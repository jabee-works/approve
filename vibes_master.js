const { spawn } = require('child_process');
const path = require('path');

// ログ出力用
function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function startPersistentProcess(scriptName, args = []) {
    log(`Starting Persistent Process: ${scriptName}...`);
    const child = spawn('node', [scriptName, ...args], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    child.on('exit', (code) => {
        log(`Warning: ${scriptName} exited with code ${code}. Restarting in 5 seconds...`);
        setTimeout(() => startPersistentProcess(scriptName, args), 5000);
    });
}

log("--- JabeeWorks Vibes Master (Aider Edition) Started ---");

// Planner: 常駐プロセスとして起動 (リアルタイム監視 & プロジェクト作成)
startPersistentProcess('vibes_planner.js');

// --- 定期実行タスク (Cron) ---
const cron = require('node-cron');

// 毎朝 9:00 にアイデア生成を実行
cron.schedule('0 9 * * *', () => {
    log('🕙 Triggering Daily Idea Generation...');
    const child = spawn('node', ['vibes_daily.js'], {
        cwd: __dirname,
        stdio: 'inherit'
    });
    child.on('close', (code) => {
        log(`Daily Idea Generation finished (code: ${code}).`);
    });
});

// 毎朝 9:05 に却下タスクのクリーンアップを実行
cron.schedule('5 9 * * *', () => {
    log('🧹 Triggering Rejected Ideas Cleanup...');
    const child = spawn('node', ['vibes_daily.js', '--cleanup'], {
        cwd: __dirname,
        stdio: 'inherit'
    });
    child.on('close', (code) => {
        log(`Cleanup finished (code: ${code}).`);
    });
});

log("Planner is running persistently. Cron jobs scheduled (09:00 Daily Ideas, 09:05 Cleanup). Waiting for tasks...");
