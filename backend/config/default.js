const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  targetUrl: process.env.TARGET_URL || 'http://localhost:8080',
  dashboardStatic: process.env.DASHBOARD_STATIC !== 'false',
  baseRateLimitRps: Number(process.env.BASE_RATE_LIMIT_RPS || 120),
  baseBurst: Number(process.env.BASE_BURST || 200),
  softThrottleMs: Number(process.env.SOFT_THROTTLE_MS || 200),
  hardLimitRps: Number(process.env.HARD_LIMIT_RPS || 30),
  windowSeconds: Number(process.env.WINDOW_SECONDS || 60),
  staticDir: path.join(__dirname, '..', '..', 'frontend', 'public')
};
