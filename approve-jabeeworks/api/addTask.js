const fetch = require('node-fetch');
const path = require('path');
const dotenv = require('dotenv');

// ローカル開発用: .env ファイルを読み込む
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default async function handler(req, res) {
    const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
    const NOTION_DB_ID = (process.env.NOTION_DB_ID || '').trim();
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { title, overview } = req.body;
        const url = 'https://api.notion.com/v1/pages';
        const payload = {
            parent: { database_id: NOTION_DB_ID },
            properties: {
                'Name': { title: [{ text: { content: title || '無題' } }] },
                'Status': { status: { name: '下書き' } },
                'Overview': { rich_text: [{ text: { content: overview || '' } }] }
            }
        };

        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(payload)
        });

        return res.status(200).send('Success');
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}
