const { spawn } = require('child_process');

console.log('--- Starting JabeeWorks Dashboard Tunnel ---');
const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3002'], { stdio: 'inherit' });

tunnel.on('close', (code) => {
    console.log(`Cloudflare tunnel exited with code ${code}`);
});
