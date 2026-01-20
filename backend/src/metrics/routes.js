const express = require('express');
const { getTrafficMetrics, getMitigationMetrics, getExplainabilityMetrics, getAnomalyMetrics } = require('./state');
const { getTarget } = require('../gateway/registry');
const { getSystemMetrics } = require('./system');

const router = express.Router();

router.get('/traffic', (req, res) => {
  res.json(getTrafficMetrics());
});

router.get('/mitigation', (req, res) => {
  res.json(getMitigationMetrics());
});

router.get('/anomaly', (req, res) => {
  res.json(getAnomalyMetrics());
});

router.get('/explainability', (req, res) => {
  res.json(getExplainabilityMetrics());
});

router.get('/state', (req, res) => {
  const traffic = getTrafficMetrics();
  const mitigation = getMitigationMetrics();
  res.json({
    traffic,
    mitigation
  });
});

router.get('/system', (req, res) => {
  res.json(getSystemMetrics());
});

router.get('/targets/:targetId', (req, res) => {
  const target = getTarget(req.params.targetId);
  if (!target) {
    return res.status(404).json({ error: 'Target not registered.' });
  }
  res.json({
    traffic: target.state.getTrafficMetrics(),
    mitigation: target.state.getMitigationMetrics(),
    anomaly: target.state.getAnomalyMetrics(),
    explainability: target.state.getExplainabilityMetrics()
  });
});


module.exports = router;
