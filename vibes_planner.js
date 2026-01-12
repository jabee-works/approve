require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// サービスアカウントキーの読み込み
const serviceAccount = require('./serviceAccountKey.json');

// Firebase初期化
if (require.main === module) {
    try {
        initializeApp({ credential: cert(serviceAccount) });
    } catch (e) { }
} else {
    try {
        initializeApp({ credential: cert(serviceAccount) });
    } catch (e) { }
}

const db = getFirestore();
const tasksRef = db.collection('tasks');

console.log("--- JabeeWorks Aider-Ready Planner (Async) Started ---");

// 起動時にスタックしているタスクのロックを解除
async function unlockStuckTasks() {
    console.log("Cleaning up stuck tasks...");
    const snapshot = await tasksRef.where('isProcessing', '==', true).get();
    if (snapshot.empty) {
        console.log("No stuck tasks found.");
        return;
    }
    const batch = db.batch();
    snapshot.forEach(doc => {
        console.log(`Unlocking task: ${doc.id}`);
        batch.update(doc.ref, { isProcessing: false });
    });
    await batch.commit();
    console.log("Clean up complete.");
}

unlockStuckTasks().then(() => {
    console.log("Listening for: '下書き' -> 企画生成, 'FBあり' -> 修正, '承認' -> プロジェクト作成, '開発中' -> Aider起動");

    tasksRef.where('status', 'in', ['下書き', 'FBあり', '承認', '開発中', '却下'])
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added' || change.type === 'modified') {
                    const task = change.doc.data();
                    const taskId = change.doc.id;

                    if (task.isProcessing) return;

                    if (task.status === '却下' && task.cleanupDone) return;

                    console.log(`Detected: [${task.status}] ${task.title || 'Untitled'}`);

                    try {
                        await tasksRef.doc(taskId).update({ isProcessing: true });
                    } catch (e) {
                        console.error("Failed to lock task:", e);
                        return;
                    }

                    try {
                        if (task.status === '下書き') {
                            await processDraft(taskId, task);
                        } else if (task.status === 'FBあり') {
                            await processFeedback(taskId, task);
                        } else if (task.status === '承認') {
                            await processApproval(taskId, task);
                        } else if (task.status === '開発中') {
                            await processDevelopmentStart(taskId, task);
                        } else if (task.status === '却下') {
                            await processRejection(taskId, task);
                        }
                    } catch (e) {
                        console.error(`Error processing task ${taskId}:`, e);
                        await tasksRef.doc(taskId).update({ isProcessing: false });
                    }
                }
            });
        }, error => {
            console.error("Firestore Listener Error:", error);
        });
});


// ---------------------------------------------------------
// Helper: 非同期 Gemini 実行 (標準入力経由)
// ---------------------------------------------------------
function runGeminiAsync(prompt) {
    return new Promise((resolve, reject) => {
        // shell: true は使わず、直接実行して stdin に流し込む
        // ※ gemini コマンドが stdin からの入力を受け付ける前提。
        // もし受け付けない場合は echo "$PROMPT" | gemini ... のようにパイプするが、
        // ここでは nodeのspawnでパイプする。

        // 注: gemini CLIの仕様として、引数なしで起動すると対話モードや入力待ちになるか、
        // あるいは `gemini prompt` のようにするかに依存する。
        // ここでは `gemini -` やパイプ対応を期待したいが、
        // 公式CLIの挙動として `gemini "prompt"` が基本なら、
        // 以前のように引数で渡すが、shell: false で配列として渡せばエスケープ不要。

        // Aプラン: shell: false で配列として渡す (これが一番安全で標準的)
        // これならクォートのエスケープ地獄から解放される。

        const child = spawn('gemini', [prompt, '--output-format', 'text'], {
            shell: false
        });

        let stdoutData = '';
        let stderrData = '';

        child.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });
        child.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`Gemini process exited with code ${code}`);
                console.error(`Stderr: ${stderrData}`);
                resolve(null); // エラーでもrejectせずnullを返す（呼び出し元でハンドリング）
            } else {
                resolve(stdoutData.trim());
            }
        });

        child.on('error', (err) => {
            console.error('Failed to start gemini process:', err);
            resolve(null);
        });
    });
}


// ---------------------------------------------------------
// 1. アイデア企画
// ---------------------------------------------------------
async function processDraft(taskId, task) {
    const currentTitle = task.title || "無題";
    const note = task.overview || "";
    console.log(`🤔 Brainstorming for: ${currentTitle}`);

    const prompt = `
    あなたは優秀なプロダクトマネージャーです。
    ユーザーの「アプリアイデアの種」を、開発チームに渡せるレベルの企画書に仕上げてください。
    出力はJSON形式のみで返してください。
    
    タイトル: ${currentTitle}
    メモ: ${note}
    
    JSON構造: { 
      "title": "アプリ名", "overview": "概要", "monetization": "戦略", 
      "target": "ターゲット", "difficulty": "★〜★★★", "type": "iPhoneアプリ" 
    }`;

    const responseText = await runGeminiAsync(prompt);
    if (!responseText) {
        await tasksRef.doc(taskId).update({ isProcessing: false });
        // ログ
        console.log('Gemini response was empty or failed.');
        return;
    }

    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");
        const refined = JSON.parse(jsonMatch[0]);

        const deadlineDate = new Date();
        deadlineDate.setDate(deadlineDate.getDate() + 1);
        const deadlineStr = deadlineDate.toISOString().split('T')[0];

        await tasksRef.doc(taskId).update({
            title: refined.title,
            overview: refined.overview,
            monetization: refined.monetization,
            target: refined.target,
            difficulty: refined.difficulty,
            type: refined.type || 'iPhoneアプリ',
            status: '新着',
            deadline: deadlineStr,
            isProcessing: false,
            updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`✨ Concept Created: ${refined.title}`);

    } catch (e) {
        console.error('Error parsing draft response', e);
        await tasksRef.doc(taskId).update({ isProcessing: false });
    }
}

// ---------------------------------------------------------
// 2. 企画修正
// ---------------------------------------------------------
async function processFeedback(taskId, task) {
    const title = task.title;
    const fb = task.feedbackComment || '指示なし';
    console.log(`🔄 Refining: ${title}`);

    const prompt = `
    ユーザーからのFBに基づきアイデアを修正してください。
    アプリ名: ${title}
    FB: ${fb}
    現在の概要: ${task.overview}
    
    出力(JSON): { "title": "...", "overview": "...", "monetization": "...", "target": "...", "difficulty": "...", "type": "..." }`;

    const responseText = await runGeminiAsync(prompt);
    if (!responseText) {
        await tasksRef.doc(taskId).update({ isProcessing: false });
        return;
    }

    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const revised = JSON.parse(jsonMatch[0]);

        await tasksRef.doc(taskId).update({
            title: revised.title,
            overview: revised.overview,
            monetization: revised.monetization,
            target: revised.target,
            difficulty: revised.difficulty,
            status: '修正済',
            isProcessing: false,
            updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`✅ Refined: ${revised.title}`);

    } catch (e) {
        console.error('Error parsing feedback response', e);
        await tasksRef.doc(taskId).update({ isProcessing: false });
    }
}

// ---------------------------------------------------------
// 3. プロジェクト作成 & 設計書生成
// ---------------------------------------------------------
async function processApproval(taskId, task) {
    const title = task.title || 'Untitled';
    console.log(`🚀 Initializes Project for: ${title}`);

    const namePrompt = `"${title}" というiPhoneアプリを作ります。Flutterプロジェクトに適した「小文字スネークケース」の英語名を1つ返してください。例: my_app`;
    let safeName = await runGeminiAsync(namePrompt);

    if (safeName) {
        safeName = safeName.trim().replace(/[^a-z0-9_]/g, '');
    }
    if (!safeName || safeName.length === 0) {
        safeName = `app_${Date.now()}`;
    }
    if (/^\d/.test(safeName)) safeName = 'p_' + safeName;

    const projectsDir = path.join(__dirname, 'projects');
    if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir);
    const projectDir = path.join(projectsDir, safeName);

    // Flutter Create (syncでOK、軽いので)
    const { execSync } = require('child_process');
    if (!fs.existsSync(projectDir)) {
        console.log(`Creating Flutter Project: ${safeName}`);
        try {
            execSync(`flutter create ${safeName} --org com.jabeeworks --platforms ios`, { cwd: projectsDir });
        } catch (e) {
            console.error('Flutter create failed:', e.message);
            await tasksRef.doc(taskId).update({ isProcessing: false });
            return;
        }
    } else {
        console.log(`Project directory ${safeName} already exists. Using it.`);
    }

    // SPEC.md 生成 (ここが長いのでAsync必須)
    console.log('Drafting SPEC.md (This may take a while)...');
    const specPrompt = `
    あなたは熟練のiOSアプリアーキテクトです。
    Flutter (Dart) で実装するための「詳細設計書 (SPEC.md)」を作成してください。
    
    アプリ名: ${title}
    概要: ${task.overview}
    マネタイズ: ${task.monetization}
    ターゲット: ${task.target}

    ## 出力形式: Markdown
    内容:
    1. **Overview**: アプリの目的と主要機能。
    2. **Architecture**: Riverpod + GoRouter + MVVM (Repository Pattern) を採用。
    3. **Directory Structure**: \`lib/\` 以下のフォルダ構成推奨案。
    4. **Data Models**: 必要なEntityクラス定義。
    5. **UI/UX Flow**: 画面遷移と各画面のUI要素。モダンでAppleらしいデザイン(Cupertino/Material 3)を意識。
    6. **Implementation Steps**: Aiderに指示する際の実装順序。
    
    マークダウンのみ出力。`;

    const specContent = await runGeminiAsync(specPrompt);

    if (specContent) {
        fs.writeFileSync(path.join(projectDir, 'SPEC.md'), specContent);
        console.log(`✅ SPEC.md saved to ${projectDir}/SPEC.md`);
    } else {
        console.error("Failed to generate SPEC.md content from Gemini.");
    }

    // 完了更新
    const nextSteps = `
プロジェクト作成完了: ${safeName}
1. ターミナルを開く: cd ${path.basename(__dirname)}/projects/${safeName}
2. Aider起動: aider --architect --model gemini/gemini-1.5-pro-latest
3. 設計書読込: /add SPEC.md
4. 実装指示: "SPEC.mdの手順に従って実装してください"
    `.trim();

    try {
        await tasksRef.doc(taskId).update({
            status: '設計完了',
            isProcessing: false,
            directoryName: safeName, // 後のためにディレクトリ名を保存
            updatedAt: FieldValue.serverTimestamp(),
            feedbackComment: nextSteps
        });
        console.log(`🎉 Status Updated to '設計完了' for: ${safeName}`);
    } catch (e) {
        console.error("Failed to update status to 設計完了:", e);
    }
}

// ---------------------------------------------------------
// 4. 開発開始 (設計完了 -> 開発中)
// ---------------------------------------------------------
async function processDevelopmentStart(taskId, task) {
    const title = task.title || 'Untitled';
    console.log(`💻 Starting Development for: ${title}`);

    // ディレクトリを特定
    let dirName = task.directoryName;
    const projectsDir = path.join(__dirname, 'projects');

    if (!dirName) {
        // 保存されていない場合は feedbackComment から無理やり抽出するか、ディレクトリ検索
        const match = (task.feedbackComment || '').match(/projects\/([a-zA-Z0-9_]+)/);
        if (match) {
            dirName = match[1];
        } else {
            console.error("Could not determine project directory.");
            await tasksRef.doc(taskId).update({ isProcessing: false });
            return;
        }
    }

    const projectDir = path.join(projectsDir, dirName);
    if (!fs.existsSync(projectDir)) {
        console.error(`Project directory not found: ${projectDir}`);
        await tasksRef.doc(taskId).update({ isProcessing: false });
        // もしかしたらprojects配下ではなく直下にあるかも(旧仕様)
        // ここでは深追いせず終了
        return;
    }

    // Aider起動用スクリプト(.command)を作成
    const commandFile = path.join(projectDir, 'start_aider.command');
    const openRouterKey = process.env.OPENROUTER_API_KEY || '';

    const scriptContent = `#!/bin/zsh
export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin
export OPENROUTER_API_KEY="${openRouterKey}"

TARGET_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$TARGET_DIR"

# Aiderが親ディレクトリのgitに惑わされないよう、ここでgit initする
if [ ! -d ".git" ]; then
    echo "Initializing git repository for project..."
    git init
    git add .
    git commit -m "Initial commit"
fi

echo "🚀 Starting Aider for ${title} in $TARGET_DIR..."
echo "Waiting for 3 seconds..."
sleep 3
# OpenRouter (Qwen2.5-Coder) を指定して起動
aider --architect --yes --no-stream --model openrouter/qwen/qwen-2.5-coder-32b-instruct SPEC.md --message "SPEC.mdの手順に従って、Step 1 から順に実装を開始してください。"

# ------------------------------------------------------------------
# Web Build & Preview Deployment
# ------------------------------------------------------------------
echo "🏗 Building Flutter for Web (Release)..."
if flutter build web --release; then
    echo "✅ Build Success."
    
    # Random Port (8000-8999)
    PORT=$((8000 + RANDOM % 1000))
    echo "🌍 Starting Preview Server on port $PORT..."
    
    # Start Python HTTP Server in background
    cd build/web
    nohup python3 -m http.server $PORT > /dev/null 2>&1 &
    mypid=$!
    
    # Start Cloudflare Tunnel
    echo "🚀 Launching Cloudflare Tunnel..."
    rm -f ../../tunnel.log
    nohup cloudflared tunnel --url http://localhost:$PORT > ../../tunnel.log 2>&1 &
    
    # Wait for URL
    echo "Waiting for Tunnel URL..."
    URL=""
    for i in {1..20}; do
        if grep -q "trycloudflare.com" ../../tunnel.log; then
            URL=$(grep -o 'https://[^ ]*\.trycloudflare.com' ../../tunnel.log | head -n 1)
            break
        fi
        sleep 2
    done
    
    if [ -n "$URL" ]; then
        echo "✅ Preview URL: $URL"
        
        # Update Firebase
        cd "$TARGET_DIR/../.." # Back to workspace root for serviceAccount
        node -e "
            const { initializeApp, cert } = require('firebase-admin/app');
            const { getFirestore, FieldValue } = require('firebase-admin/firestore');
            const sa = require('./serviceAccountKey.json');
            try {
              initializeApp({ credential: cert(sa) });
              const db = getFirestore();
              db.collection('tasks').doc('${taskId}').update({
                status: '実装完了/レビュー中',
                reviewUrl: '$URL',
                updatedAt: FieldValue.serverTimestamp()
              }).then(() => {
                console.log('Status & URL updated successfully.');
                process.exit(0);
              }).catch(e => {
                console.error('Failed to update status:', e);
                process.exit(1);
              });
            } catch(e) { console.error(e); process.exit(1); }
        "
        
        echo "🎉 All Done! Preview is live at: $URL"
        echo "Closing terminal in 5 seconds..."
        sleep 5
        osascript -e 'tell application "Terminal" to close front window'
        exit 0
    else
        echo "❌ Failed to get Tunnel URL."
        # Tunnel Error -> Revert to '設計完了'
        cd "$TARGET_DIR/../.."
        node -e "
            const { initializeApp, cert } = require('firebase-admin/app');
            const { getFirestore, FieldValue } = require('firebase-admin/firestore');
            const sa = require('./serviceAccountKey.json');
            try {
              initializeApp({ credential: cert(sa) });
              const db = getFirestore();
              db.collection('tasks').doc('${taskId}').update({
                status: '設計完了',
                updatedAt: FieldValue.serverTimestamp()
              }).then(() => process.exit(0)).catch(() => process.exit(1));
            } catch(e) { process.exit(1); }
        "
    fi
else
    echo "❌ Flutter Build Failed."
    # Build Error -> Revert to '設計完了'
    cd "$TARGET_DIR/../.."
    node -e "
        const { initializeApp, cert } = require('firebase-admin/app');
        const { getFirestore, FieldValue } = require('firebase-admin/firestore');
        const sa = require('./serviceAccountKey.json');
        try {
          initializeApp({ credential: cert(sa) });
          const db = getFirestore();
          db.collection('tasks').doc('${taskId}').update({
            status: '設計完了',
            updatedAt: FieldValue.serverTimestamp()
          }).then(() => process.exit(0)).catch(() => process.exit(1));
        } catch(e) { process.exit(1); }
    "
fi

# エラー時は閉じない
echo "⚠️ Process finished with errors or warning. Terminal will stay open."
`;

    fs.writeFileSync(commandFile, scriptContent, { mode: 0o755 });

    // 実行
    console.log(`Opening terminal: ${commandFile}`);
    const { exec } = require('child_process');
    exec(`open "${commandFile}"`);

    // ステータス更新 & ロック解除
    await tasksRef.doc(taskId).update({
        status: 'Aider起動済',
        isProcessing: false,
        updatedAt: FieldValue.serverTimestamp()
    });
}


// ---------------------------------------------------------
// 5. 却下時のクリーンアップ
// ---------------------------------------------------------
async function processRejection(taskId, task) {
    const title = task.title || 'Untitled';
    console.log(`🗑 Cleanup process started for: ${title}`);

    // ディレクトリ名がある場合のみ削除を実施
    if (task.directoryName) {
        const projectsDir = path.join(__dirname, 'projects');
        const projectDir = path.join(projectsDir, task.directoryName);

        if (fs.existsSync(projectDir)) {
            console.log(`Removing project directory: ${projectDir}`);
            try {
                fs.rmSync(projectDir, { recursive: true, force: true });
                console.log(`✅ Directory deleted.`);
            } catch (e) {
                console.error(`Failed to delete directory: ${e.message}`);
            }
        } else {
            console.log(`Directory not found (already deleted?): ${projectDir}`);
        }
    } else {
        console.log(`No directory linked to this task. Skipping file deletion.`);
    }

    // ロック解除 & クリーンアップ完了フラグ設定
    await tasksRef.doc(taskId).update({
        isProcessing: false,
        cleanupDone: true
    });
}

