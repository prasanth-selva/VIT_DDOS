const express = require('express');
const config = require('../../config/default');
const { getMitigationMetrics } = require('../metrics/state');
const config = require('../../config/default');
const { sendTelegramAlert, formatAttackAlert } = require('../alerts/telegram');
const { registerTarget, listTargets } = require('../gateway/registry');
const { sendTelegramAlert, formatAttackAlert } = require('../alerts/telegram');

const router = express.Router();
router.use(express.json({ limit: '256kb' }));

router.get('/gateway/state', (req, res) => {
  const targets = listTargets();
  const mitigation = getMitigationMetrics();
  let mode = 'standby';
  if (targets.length > 0) {
    mode = mitigation.lastDecision
      ? (mitigation.lastDecision.action !== 'allowed' ? 'active-mitigation' : 'learning')
      : 'learning';
  }

  res.json({
    mode,
    targets
  });
});

router.get('/gateway/config', (req, res) => {
  res.json({
    targets: listTargets()
  });
});

router.put('/gateway/config', (req, res) => {
  try {
    const { targetUrl } = req.body || {};
    const result = registerTarget({ targetId: 'default', url: targetUrl, label: 'Default' });
    if (!result.ok) {
      return res.status(400).json({ error: result.message });
    }
    res.json({
      targetUrl: result.target.url,
      targetId: result.target.id
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/api/set-target', (req, res) => {
  try {
    const { target } = req.body || {};
    const result = registerTarget({ targetId: 'default', url: target, label: 'Default' });
    if (!result.ok) {
      return res.status(400).json({ error: result.message });
    }
    res.json({
      status: 'active',
      target: result.target.url,
      targetId: result.target.id
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/api/register-target', (req, res) => {
  try {
    const { targetId, url, label } = req.body || {};
    const result = registerTarget({ targetId, url, label });
    if (!result.ok) {
      return res.status(400).json({ error: result.message });
    }
    res.json({
      status: 'registered',
      target: {
        id: result.target.id,
        label: result.target.label,
        url: result.target.url
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/api/alerts/telegram', async (req, res) => {
  try {
    if (!config.telegram?.enabled || !config.telegram.botToken || !config.telegram.chatId) {
      return res.status(400).json({ error: 'Telegram is not configured.' });
    }

    const { message, targetId, action, trafficClass, anomalyScore, rps, reason } = req.body || {};
    const text = message?.trim() || formatAttackAlert({
      targetId,
      action: action || 'MANUAL',
      trafficClass: trafficClass || 'manual',
      anomalyScore: Number.isFinite(anomalyScore) ? anomalyScore : 0,
      rps: Number.isFinite(rps) ? rps : 0,
      reason: reason || 'Manual alert from dashboard'
    });

    const result = await sendTelegramAlert({
      token: config.telegram.botToken,
      chatId: config.telegram.chatId,
      text
    });

    if (!result.ok) {
      let details;
      try {
        const parsed = JSON.parse(result.body || '{}');
        details = parsed.description || parsed.message;
      } catch (parseError) {
        details = result.body;
      }

      let hint;
      if (result.status === 401 || result.status === 404) {
        hint = 'Check TELEGRAM_BOT_TOKEN (should look like 123456:ABC... and must NOT include the "bot" prefix).';
      } else if (result.status === 400 && typeof details === 'string' && details.toLowerCase().includes('chat not found')) {
        hint = 'Check TELEGRAM_CHAT_ID. For users, send /start to the bot first; for groups/channels, add the bot and use the correct chat id.';
      }

      return res.status(502).json({ error: 'Telegram alert failed.', status: result.status, details, hint });
    }

    return res.json({ status: 'sent' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Telegram alert failed.' });
  }
});

router.get('/api/targets', (req, res) => {
  res.json({ targets: listTargets() });
});

router.post('/api/alerts/telegram', async (req, res) => {
  try {
    if (!config.telegram?.enabled || !config.telegram.botToken || !config.telegram.chatId) {
      return res.status(400).json({ error: 'Telegram alerting not configured.' });
    }

    const payload = req.body || {};
    const message = payload.message || formatAttackAlert({
      targetId: payload.targetId || 'manual',
      action: payload.action || 'INFO',
      trafficClass: payload.trafficClass || 'unknown',
      anomalyScore: Number(payload.anomalyScore || 0),
      rps: Number(payload.rps || 0),
      reason: payload.reason || 'Manual alert trigger.'
    });

    const result = await sendTelegramAlert({
      token: config.telegram.botToken,
      chatId: config.telegram.chatId,
      text: message
    });

    if (!result.ok) {
      return res.status(502).json({ error: 'Telegram send failed.', status: result.status, body: result.body });
    }

    return res.json({ status: 'sent' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to send Telegram alert.' });
  }
});

module.exports = router;
