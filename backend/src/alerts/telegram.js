const https = require('https');

function sendTelegramAlert({ token, chatId, text }) {
  return new Promise((resolve, reject) => {
    if (!token || !chatId || !text) {
      return resolve({ ok: false, error: 'Missing token, chatId, or text.' });
    }

    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown'
    });

    const request = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 8000
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
      }
    );

    request.on('error', (error) => reject(error));
    request.on('timeout', () => {
      request.destroy(new Error('Telegram request timeout'));
    });

    request.write(payload);
    request.end();
  });
}

function formatAttackAlert({ targetId, action, trafficClass, anomalyScore, rps, reason }) {
  const time = new Date().toLocaleString();
  return [
    '*CYNEX Attack Alert*',
    `Time: ${time}`,
    `Target: ${targetId || 'unknown'}`,
    `Action: ${action}`,
    `Traffic: ${trafficClass}`,
    `Anomaly Score: ${Math.round(anomalyScore)}`,
    `RPS: ${Math.round(rps)}`,
    `Reason: ${reason}`
  ].join('\n');
}

module.exports = {
  sendTelegramAlert,
  formatAttackAlert
};
