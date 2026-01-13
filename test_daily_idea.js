const { spawn } = require('child_process');
const path = require('path');

console.log("🧪 Testing Daily Idea Generation...");
console.log("Running 'vibes_daily.js' immediately to generate ideas...");

// vibes_daily.js を実行して、強制的にアイデア生成プロセスを起動する
const child = spawn('node', ['vibes_daily.js'], {
    cwd: __dirname,
    stdio: 'inherit'
});

child.on('close', (code) => {
    if (code === 0) {
        console.log("\n✅ Test Complete! Check Firebase/Discord for new ideas.");
    } else {
        console.error(`\n❌ Script failed with code ${code}`);
    }
});
