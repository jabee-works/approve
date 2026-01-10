const fetch = require('node-fetch');
const path = require('path');
const dotenv = require('dotenv');

// ローカル開発用: .env ファイルを読み込む
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default async function handler(req, res) {
    const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { pageId, newStatusName, comment } = req.body;
        const url = `https://api.notion.com/v1/pages/${pageId}`;

        const properties = {
            'Status': { status: { name: newStatusName } }
        };

        if (comment !== undefined && comment !== null) {
            properties['Feedback_Comment'] = {
                rich_text: [{ text: { content: comment } }]
            };
        }

        await fetch(url, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({ properties })
        });

        return res.status(200).send('Success');
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}
