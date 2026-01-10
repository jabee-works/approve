const fetch = require('node-fetch');
const path = require('path');
const dotenv = require('dotenv');

// ローカル開発用: .env ファイルを読み込む（デプロイ時は環境変数から直接取得）
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default async function handler(req, res) {
    const NOTION_API_KEY = (process.env.NOTION_API_KEY || '').trim();
    const NOTION_DB_ID = (process.env.NOTION_DB_ID || '').trim();

    // 本番環境での欠落チェック
    if (!NOTION_API_KEY || !NOTION_DB_ID) {
        return res.status(500).json({
            error: 'Environment variables missing on server',
            details: {
                hasKey: !!NOTION_API_KEY,
                hasDbId: !!NOTION_DB_ID
            }
        });
    }

    if (req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`;

        const payload = {
            filter: {
                property: 'Status',
                status: { does_not_equal: '完了' }
            },
            sorts: [
                { timestamp: 'created_time', direction: 'descending' }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Notion API Error:', JSON.stringify(data, null, 2));
            return res.status(response.status).json(data);
        }

        if (!data.results) {
            console.error('No results found in Notion response:', JSON.stringify(data, null, 2));
            return res.status(200).json([]);
        }

        const tasks = data.results.map(page => {
            const props = page.properties;
            const getText = (prop) => prop?.rich_text?.[0]?.plain_text || prop?.title?.[0]?.plain_text || '';
            const getSelect = (prop) => prop?.select?.name || '';
            const getStatus = (prop) => prop?.status?.name || '不明';
            const getUrl = (prop) => prop?.url || '';

            return {
                id: page.id,
                title: getText(props['Name']),
                status: getStatus(props['Status']),
                overview: getText(props['Overview']),
                monetization: getText(props['Monetization']),
                target: getText(props['Target']),
                difficulty: getSelect(props['Tech_Difficulty']),
                reviewUrl: getUrl(props['Review_URL']),
                deadline: props['承認期限']?.date?.start || '',
                feedbackComment: getText(props['Feedback_Comment'])
            };
        });

        const filteredTasks = tasks.filter(task => {
            const isDraft = task.status.includes('下書き') || task.status === '新着' || task.status.includes('Draft');
            if (isDraft) return true;
            const hasTitle = task.title && task.title !== '無題';
            const hasOverview = task.overview !== '';
            return hasTitle || hasOverview;
        }).sort((a, b) => {
            const isADraft = a.status.includes('下書き') || a.status === '新着' || a.status.includes('Draft');
            const isBDraft = b.status.includes('下書き') || b.status === '新着' || b.status.includes('Draft');
            if (isADraft && !isBDraft) return -1;
            if (!isADraft && isBDraft) return 1;
            return 0;
        });

        return res.status(200).json(filteredTasks);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}
