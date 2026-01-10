const axios = require('axios');
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

async function sendDiscordNotification(title, message, color = 0x3498db, fields = []) {
    if (!DISCORD_WEBHOOK_URL) {
        console.log('Discord Webhook URL not set. Skipping notification.');
        return;
    }

    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: title,
                description: message,
                color: color,
                fields: fields,
                timestamp: new Date().toISOString()
            }]
        });
        console.log('Discord notification sent.');
    } catch (error) {
        console.error('Error sending Discord notification:', error.message);
    }
}

module.exports = { sendDiscordNotification };
