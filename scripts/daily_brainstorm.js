const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { Client } = require('@notionhq/client');
const axios = require('axios'); // Gemini API呼び出し用（SDKなしでやる場合）またはSDK使用
const { GoogleGenerativeAI } = require("@google/generative-ai"); // SDKあるなら使う

// 環境変数のチェック
if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.GEMINI_API_KEY) {
    console.error('Missing environment variables.');
    process.exit(1);
}

// Firebase初期化
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Notion初期化
const notion = process.env.NOTION_API_KEY ? new Client({ auth: process.env.NOTION_API_KEY }) : null;
const NOTION_DB_ID = process.env.NOTION_DB_ID;

// Gemini初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // 1.5-flash for speed/context

async function main() {
    console.log('--- Daily Brainstorming Started ---');

    // 1. Notionから過去のアイデアタイトルを取得 (重複排除用)
    let pastTitles = [];
    if (notion && NOTION_DB_ID) {
        try {
            console.log('Fetching past ideas from Notion...');
            const response = await notion.databases.query({
                database_id: NOTION_DB_ID,
                page_size: 100, // 直近100件くらいでOKか
                sorts: [{ timestamp: 'created_time', direction: 'descending' }]
            });
            pastTitles = response.results
                .map(page => page.properties.Name?.title?.[0]?.plain_text)
                .filter(t => t);
            console.log(`Found ${pastTitles.length} past ideas.`);
        } catch (e) {
            console.error('Notion fetch failed:', e.message);
        }
    }

    // 2. Geminiでアイデア生成
    const count = 10;
    const prompt = `
    あなたは革新的なiOSアプリプランナーです。
    Flutterで開発可能な、ユニークで実用的ななアプリのアイデアを ${count} 個考案してください。
    
    ## 条件
    - ターゲット: 日本の一般ユーザー、またはニッチな層。
    - デザイン: モダンでAppleらしいUI/UX。
    - マネタイズ: 広告またはサブスクリプション。
    - **重複禁止**: 以下のアイデアは既出なので避けてください:
      ${pastTitles.join(', ')}

    ## 出力形式 (JSON Arrayのみ)
    [
      {
        "title": "アプリ名 (キャッチーな日本語)",
        "overview": "概要 (100文字程度)",
        "target": "ターゲットユーザー",
        "monetization": "マネタイズ方法"
      },
      ...
    ]
    jsonマークダウンは不要です。純粋なJSON配列のみ返してください。
    `;

    console.log('Generating ideas with Gemini...');
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const ideas = JSON.parse(text);

        console.log(`Generated ${ideas.length} ideas.`);

        // 3. Firebaseに保存
        const batch = db.batch();
        for (const idea of ideas) {
            const docRef = db.collection('tasks').doc();
            batch.set(docRef, {
                title: idea.title,
                overview: idea.overview,
                target: idea.target,
                monetization: idea.monetization,
                status: '新着', // 新着として登録
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                source: 'Daily AI',
                isProcessing: false
            });
        }
        await batch.commit();
        console.log('✅ All ideas saved to Firebase.');

    } catch (e) {
        console.error('Generation failed:', e);
        process.exit(1);
    }
}

main();
