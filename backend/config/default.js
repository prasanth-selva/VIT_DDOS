const path = require('path');

function normalizeEnvValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  let normalized = value.trim();
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function normalizeTelegramToken(value) {
  let token = normalizeEnvValue(value);
  if (token.toLowerCase().startsWith('bot')) {
    token = token.slice(3).trim();
  }
  return token;
}

module.exports = {
  port: process.env.PORT || 3000,
  targetUrl: process.env.TARGET_URL || 'http://localhost:8080',
  dashboardStatic: process.env.DASHBOARD_STATIC !== 'false',
  baseRateLimitRps: Number(process.env.BASE_RATE_LIMIT_RPS || 120),
  baseBurst: Number(process.env.BASE_BURST || 200),
  softThrottleMs: Number(process.env.SOFT_THROTTLE_MS || 200),
  hardLimitRps: Number(process.env.HARD_LIMIT_RPS || 30),
  windowSeconds: Number(process.env.WINDOW_SECONDS || 60),
  telegram: {
    enabled: process.env.TELEGRAM_ENABLED !== 'false',
    botToken: normalizeTelegramToken(process.env.TELEGRAM_BOT_TOKEN || ''),
    chatId: normalizeEnvValue(process.env.TELEGRAM_CHAT_ID || ''),
    cooldownMs: Number(process.env.TELEGRAM_COOLDOWN_MS || process.env.TELEGRAM_ALERT_COOLDOWN_MS || 60000)
  },
  staticDir: path.join(__dirname, '..', '..', 'frontend', 'public')
};
