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

// 必要に応じて他の定期実行スクリプトを追加
log("Planner is running persistently. Waiting for tasks...");
