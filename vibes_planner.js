require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { execSync } = require('child_process');
const path = require('path');
const { sendDiscordNotification } = require('./vibes_notifier');

// サービスアカウントキーの読み込み
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

console.log("--- Vibes Planner (Firebase Realtime Edition) Started ---");
console.log("Listening for tasks with status: '下書き', 'FBあり'");

// リアルタイム監視を開始
const tasksRef = db.collection('tasks');

// 「下書き」または「FBあり」の変更を監視
// Note: 'in' クエリでの監視は制限がある場合があるが、ここでは単純に全件監視でフィルタリングするか、
// 効率化のためクエリ監視を行う。ここではシンプルに、処理が必要なステータスを持つドキュメントを監視する。
// しかし onSnapshot は永続的なので、一度 fetch して終わりではない。

tasksRef.where('status', 'in', ['下書き', 'FBあり'])
    .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const task = change.doc.data();
                const taskId = change.doc.id;

                // すでに処理中ならスキップ（ロック機構）
                if (task.isProcessing) return;

                console.log(`Detected target task: [${task.status}] ${task.title}`);

                // 即座に処理中フラグを立てる
                await tasksRef.doc(taskId).update({ isProcessing: true });

                if (task.status === '下書き') {
                    await processDraft(taskId, task);
                } else if (task.status === 'FBあり') {
                    await processFeedback(taskId, task);
                }
            }
        });
    }, error => {
        console.error("Listener Error:", error);
    });

// 承認期限切れのチェックなどは定期実行（cron）で行うか、ここで行うか。
// リアルタイム性が不要なものは別途 vibes_daily.js の cleanup でやるのが綺麗だが、
// ここではシンプルにイベント駆動のみに集中する。

async function processDraft(taskId, task) {
    const currentTitle = task.title || "無題";
    const note = task.overview || "";

    console.log(`Draft processing: ${currentTitle}`);

    const prompt = `
  あなたは優秀なプロダクトマネージャーです。
  ユーザーが思いついた以下の「アプリアイデアの種」を、開発チームに渡せるレベルの企画書に仕上げてください。
  
  ユーザーのメモ:
  タイトル: ${currentTitle}
  備考: ${note}
  
  出力は以下のJSON形式のみで返してください。単一のオブジェクトです。
  JSON構造: { 
    "title": "ブラッシュアップしたアプリ名", 
    "overview": "魅力的な概要", 
    "monetization": "具体的なマネタイズ戦略", 
    "target": "明確なターゲット層", 
    "difficulty": "★〜★★★",
    "type": "iPhoneアプリ | webアプリ | chrome拡張機能 | steamゲーム" 
  }
  `;

    const responseText = await callGemini(prompt);

    // 失敗時はフラグを下ろしてリトライ待ちにするか、エラーログを出して放置するか。
    // ここではエラー時はログを出して、ステータスはそのまま（再試行可能）にするが、処理中フラグは戻す。
    if (!responseText) {
        await db.collection('tasks').doc(taskId).update({ isProcessing: false });
        return;
    }

    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");

        const refinedIdea = JSON.parse(jsonMatch[0]);
        const deadlineDate = new Date();
        deadlineDate.setDate(deadlineDate.getDate() + 1); // 承認期限: 1日後
        const deadlineStr = deadlineDate.toISOString().split('T')[0];

        await db.collection('tasks').doc(taskId).update({
            title: refinedIdea.title,
            overview: refinedIdea.overview,
            monetization: refinedIdea.monetization,
            target: refinedIdea.target,
            difficulty: refinedIdea.difficulty,
            type: refinedIdea.type,
            status: '新着',
            deadline: deadlineStr,
            isProcessing: false, // ロック解除
            updatedAt: FieldValue.serverTimestamp()
        });

        console.log(`Draft refined: ${refinedIdea.title}`);
        await sendDiscordNotification(
            '💡 企画ブラッシュアップ完了',
            `「${currentTitle}」の企画が仕上がりました。`,
            0x3498db
        );

    } catch (e) {
        console.error('Error parsing draft response', e);
        await db.collection('tasks').doc(taskId).update({ isProcessing: false });
    }
}

async function processFeedback(taskId, task) {
    const title = task.title || "No Title";
    const fbComment = task.feedbackComment || '指示なし';

    console.log(`Processing Feedback for: ${title}`);

    const prompt = `ユーザーからのFBに基づきアイデアを修正してください。
  アプリ名: ${title}
  FB: ${fbComment}
  JSON構造: { 
    "title": "修正後のアプリ名", 
    "overview": "概要", 
    "monetization": "戦略", 
    "target": "ターゲット層", 
    "difficulty": "★〜★★★",
    "type": "iPhoneアプリ | webアプリ | chrome拡張機能 | steamゲーム"
  }`;

    const responseText = await callGemini(prompt);
    if (!responseText) {
        await db.collection('tasks').doc(taskId).update({ isProcessing: false });
        return;
    }

    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");

        const revised = JSON.parse(jsonMatch[0]);

        await db.collection('tasks').doc(taskId).update({
            title: revised.title,
            overview: revised.overview,
            monetization: revised.monetization,
            target: revised.target,
            difficulty: revised.difficulty,
            type: revised.type,
            status: '修正済',
            isProcessing: false,
            updatedAt: FieldValue.serverTimestamp()
        });

        console.log(`Revision applied to: ${title}`);
        await sendDiscordNotification(
            '🔄 フィードバック反映完了',
            `「${title}」のアイデアを修正しました。`,
            0x9b59b6
        );
    } catch (e) {
        console.error('Error parsing feedback response', e);
        await db.collection('tasks').doc(taskId).update({ isProcessing: false });
    }
}

async function callGemini(prompt) {
    try {
        const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
        const cmd = `gemini "${escapedPrompt}" --output-format text`;
        const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        return stdout.trim();
    } catch (e) {
        console.error('Gemini CLI Error:', e.message);
        return null;
    }
}
