const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// ルートの.envを読み込む（Notionキーなど）
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());

const PORT = 3002;

// 静的ファイルの配信 (GitHub Pages公開用フォルダ 'docs' を使用してプレビュー)
app.use(express.static(path.join(__dirname, 'docs')));

// Netlify Functions のハンドラを直接インポート
const getTasks = require('./approve-jabeeworks/netlify/functions/getTasks');
const addTask = require('./approve-jabeeworks/netlify/functions/addTask');
const updateStatus = require('./approve-jabeeworks/netlify/functions/updateStatus');

// ヘルパー: FunctionsのレスポンスをExpressのレスポンスに変換
const handleFunction = async (handler, req, res) => {
    try {
        const event = {
            httpMethod: req.method,
            body: JSON.stringify(req.body), // Functionsはbodyを文字列として受け取る
            headers: req.headers
        };

        const result = await handler.handler(event, {});

        // Headersの適用
        if (result.headers) {
            Object.keys(result.headers).forEach(key => {
                res.setHeader(key, result.headers[key]);
            });
        }

        res.status(result.statusCode);

        // bodyがJSON文字列ならパースしてJSONとして返す、違えばそのまま
        try {
            const jsonBody = JSON.parse(result.body);
            res.json(jsonBody);
        } catch (e) {
            res.send(result.body);
        }
    } catch (error) {
        console.error('Function Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

// APIエンドポイント設定
app.get('/api/getTasks', (req, res) => handleFunction(getTasks, req, res));
app.post('/api/addTask', (req, res) => handleFunction(addTask, req, res));
app.post('/api/updateStatus', (req, res) => handleFunction(updateStatus, req, res));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🏡 Local Dashboard Server is running at http://localhost:${PORT}`);
    console.log(`   (Notion API Mode)`);
});
