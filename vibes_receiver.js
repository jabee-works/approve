const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = 3001;
const LOG_FILE = path.join(__dirname, 'receiver.log');

function log(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, entry);
    console.log(msg);
}

const WEBHOOK_SECRET = 'jabee_secret_2026';

app.post('/webhook', (req, res) => {
    const { action, projectName, secret } = req.body;

    if (secret !== WEBHOOK_SECRET) {
        log('Unauthorized attempt');
        return res.status(401).send('Unauthorized');
    }

    log(`🚀 Received Trigger for Project: ${projectName} (Action: ${action})`);

    if (action === 'approved' || action === 'build') {
        res.send({ status: 'Sequence started' });

        // 承認された瞬間に走るフルコンボ：設計 -> 同期 -> 実装
        runSequence([
            ['node', ['vibes_designer.js']], // 設計書作成
            ['node', ['vibes_coder.js']],    // ローカル同期
            ['node', ['vibes_builder.js', projectName]], // 実装
            ['node', ['vibes_preview.js', projectName]]  // プレビュー
        ], projectName);

    } else if (action === 'draft') {
        res.send({ status: 'Planner trigger started' });
        log(`Triggering Planner for new draft: ${projectName}`);

        // 下書きが来たら即座に Planner を実行
        const child = spawn('node', ['vibes_planner.js'], {
            cwd: __dirname,
            stdio: 'inherit',
            detached: false
        });

        child.on('exit', (code) => {
            log(`Planner finished with code ${code}`);
        });

    } else {
        res.status(400).send('Unknown action');
    }
});

/**
 * コマンドを順番に実行するヘルパー
 */
function runSequence(commands, projectName) {
    if (commands.length === 0) {
        log(`✅ All sequence completed for ${projectName}`);
        return;
    }

    const [cmd, args] = commands.shift();
    log(`Running: ${cmd} ${args.join(' ')}...`);

    const child = spawn(cmd, args, {
        cwd: __dirname,
        stdio: 'inherit',
        detached: false
    });

    child.on('exit', (code) => {
        if (code === 0) {
            runSequence(commands, projectName);
        } else {
            log(`❌ Command failed with code ${code}: ${cmd} ${args.join(' ')}`);
        }
    });
}

app.listen(PORT, () => {
    log(`JabeeWorks Receiver listening on port ${PORT}`);
});
