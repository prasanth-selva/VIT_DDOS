const express = require('express');
const { getMitigationMetrics } = require('../metrics/state');
const { registerTarget, listTargets } = require('../gateway/registry');

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

router.get('/api/targets', (req, res) => {
  res.json({ targets: listTargets() });
});

module.exports = router;
