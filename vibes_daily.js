require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { execSync } = require('child_process');
const path = require('path');
const { sendDiscordNotification } = require('./vibes_notifier');

// サービスアカウントキーの読み込み
const serviceAccount = require('./serviceAccountKey.json');

// 二重初期化防止
if (!process.env.FIREBASE_CONFIG) {
    initializeApp({
        credential: cert(serviceAccount)
    });
} else {
    // 既に初期化されている場合は getApp() などで取得する運用も考えられるが、
    // 単発実行スクリプトなので、requireキャッシュの影響を受けないようシンプルに実行する前提
}
// ※ vibes_master から child_process で呼ばれるので、毎回プロセスは新規作成される。

const db = getFirestore();

async function main() {
    const mode = process.argv[2];

    if (mode === '--cleanup') {
        await cleanupRejectedIdeas();
    } else {
        await generateDailyIdeas();
    }
}

async function generateDailyIdeas() {
    console.log('--- Generating Daily Ideas (Firebase Edition) ---');
    const todayDate = new Date();
    const currentMonthStr = `${todayDate.getFullYear()}年${todayDate.getMonth() + 1}月`;

    // 重複チェック用（直近のアイデアを取得するなどしてもよいが、ここではシンプルにAI任せ）
    // Geminiに「過去の事例」として渡すためにいくつか取得するのもあり。

    // Firestoreから既存タイトルを取得
    const existingTitles = await getExistingIdeaTitles();
    const historyInstruction = existingTitles.length > 0
        ? `以下のアイデアは既に提案済みです。これらと内容が重複したり、似たような方向性の提案は避けてください：\n${existingTitles.join(', ')}`
        : '';

    const prompt = `
  あなたはトレンドに敏感なプロダクトマネージャーです。
  Google検索機能を活用して、現在（${currentMonthStr}時点）の世の中のリアルなニーズ、SNSでの不満、急上昇している社会課題をリサーチしてください。

  ${historyInstruction}

  以下の3つの視点で情報を収集し、それを解決する個人開発レベルのFlutterアプリを5つ考案してください。
  
  1. 【不満の解消】: SNSで「〇〇が面倒」「〇〇のアプリ使いにくい」と話題になっていること。
  2. 【ライフハック】: 最近の法改正や物価上昇、働き方の変化に伴って生まれた新しい「面倒くさい」を解決するもの。
  3. 【海外トレンド】: Product Huntなどで流行っているが、まだ日本向けにローカライズされていないニッチなツール。

  特に「技術的実現性」と「マネタイズの鋭さ」に焦点を当ててください。
  レスポンスは以下のJSON形式のみで返してください。余計な説明は不要です。配列の中に5つのオブジェクトを入れてください。
  
  JSON構造: { "ideas": [{ "title": "アプリ名", "overview": "【背景にある課題】...に対して【解決策】...を提供する", "monetization": "マネタイズ戦略", "target": "ターゲット層", "difficulty": "★〜★★★", "type": "webアプリ | iPhoneアプリ | chrome拡張機能" }] }
  `;

    const responseText = await callGemini(prompt);
    if (!responseText) return;

    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;

        const ideas = JSON.parse(jsonMatch[0]).ideas;
        if (!ideas) return;

        const deadlineDate = new Date();
        deadlineDate.setDate(deadlineDate.getDate() + 1); // 1日後
        const deadlineStr = deadlineDate.toISOString().split('T')[0];

        const batch = db.batch();

        for (const idea of ideas) {
            const newDocRef = db.collection('tasks').doc();
            batch.set(newDocRef, {
                title: idea.title,
                overview: idea.overview,
                monetization: idea.monetization,
                target: idea.target,
                difficulty: idea.difficulty,
                type: idea.type || 'webアプリ',
                status: '新着',
                deadline: deadlineStr,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`Prepared Daily Idea: ${idea.title}`);
        }

        await batch.commit();
        console.log('Daily ideas committed to Firestore.');

        // Discord通知
        const fields = ideas.map(idea => ({
            name: `💡 ${idea.title} (${idea.difficulty || '★'})`,
            value: `${idea.overview}\n**Target:** ${idea.target}\n**Monetize:** ${idea.monetization}\n**Type:** ${idea.type}`
        }));

        await sendDiscordNotification(
            '🤖 新着アイデアが届きました！',
            `本日（${currentMonthStr}）のトレンドに基づいたアイデアを${ideas.length}件生成しました。`,
            0x00ff00, // Green for success/new
            fields
        );

    } catch (e) {
        console.error("JSON Parse or Firestore Error:", e);
    }
}

async function cleanupRejectedIdeas() {
    console.log('--- Cleaning up Rejected Ideas (Firebase Edition) ---');
    const tasksRef = db.collection('tasks');
    const snapshot = await tasksRef.where('status', '==', '却下').get();

    if (snapshot.empty) {
        console.log('No rejected tasks found.');
        return;
    }

    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const batch = db.batch();
    let deleteCount = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        // updatedAtがあればそれを見る、なければ今の時間を基準（削除しない）
        const lastUpdated = data.updatedAt ? data.updatedAt.toDate() : new Date();

        if (now - lastUpdated > oneDayMs) {
            console.log(`Deleting old rejected idea: ${data.title} (${doc.id})`);
            batch.delete(doc.ref);
            deleteCount++;
        }
    });

    if (deleteCount > 0) {
        await batch.commit();
        console.log(`Deleted ${deleteCount} rejected tasks.`);
    } else {
        console.log('No rejected tasks old enough to delete.');
    }
}

async function getExistingIdeaTitles() {
    const tasksRef = db.collection('tasks');
    // 最新50件くらいを確認すれば十分
    const snapshot = await tasksRef.orderBy('createdAt', 'desc').limit(50).get();
    return snapshot.docs.map(doc => doc.data().title).filter(Boolean);
}

async function callGemini(prompt) {
    try {
        const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
        const cmd = `gemini "${escapedPrompt}" --output-format text`;
        const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        return stdout.trim();
    } catch (e) {
        return null;
    }
}

main(); // 明示的に呼び出す（単発スクリプトとして）
