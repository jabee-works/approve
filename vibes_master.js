const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');

// ログ出力用
function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runScriptOneShot(scriptName, args = []) {
    log(`Starting One-Shot Script: ${scriptName}...`);
    const child = spawn('node', [scriptName, ...args], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    child.on('exit', (code) => {
        log(`${scriptName} finished with code ${code}`);
    });
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

log("--- JabeeWorks Vibes Master (Firebase Realtime Edition) Started ---");

// 1. Planner: 常駐プロセスとして起動 (リアルタイム監視)
startPersistentProcess('vibes_planner.js');

// 2. Daily Ideas: 毎朝 8:30 に実行 (アイデア出し)
cron.schedule('30 8 * * *', () => {
    runScriptOneShot('vibes_daily.js');
});

// 3. Cleanup: 毎朝 9:00 に実行 (ゴミ箱整理)
cron.schedule('0 9 * * *', () => {
    runScriptOneShot('vibes_daily.js', ['--cleanup']);
});

log("Schedules set: Daily(08:30), Cleanup(09:00), Planner is running persistently.");
