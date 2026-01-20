require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const config = require('../config/default');
const createApp = require('./server/app');
const buildProxy = require('./proxy/reverseProxy');
const { extractRequestMetadata } = require('./features/extractor');
const {
  recordRequest: recordRequestGlobal,
  recordDecision: recordDecisionGlobal,
  recordAnomaly: recordAnomalyGlobal,
  recordResponse: recordResponseGlobal,
  getTrafficMetrics,
  getMitigationMetrics
} = require('./metrics/state');
const { classifyTraffic } = require('./detection/classifier');
const { buildDecision } = require('./policy/policyEngine');
const { enforce, getSignature } = require('./enforcement/limiter');
const { updateTrust } = require('./intelligence/trustScore');
const { getTarget } = require('./gateway/registry');
const {
  isVerified,
  markVerified,
  getFailureCount,
  recordFailure,
  clearFailures,
  createChallenge,
  verifyChallenge,
  renderChallengePage,
  MAX_FAILURES,
  VERIFIED_TTL_MS
} = require('./security/challenge');
const { getAnomalyMetrics } = require('./metrics/state');
const { updateAttackMode, getAttackMode } = require('./security/attackMode');
const { createSecureToken, verifySecureToken } = require('./security/secureGateway');
const { sendTelegramAlert, formatAttackAlert } = require('./alerts/telegram');

const app = createApp({ staticDir: config.staticDir, dashboardStatic: config.dashboardStatic });
const proxy = buildProxy((req) => req._targetUrl, '/gateway');

let lastAttackState = false;
let lastTelegramSentAt = 0;

async function maybeSendAttackAlert({ attackActive, targetId, decision, classification, anomalyScore, rps, reason }) {
  if (!config.telegram?.enabled || !config.telegram.botToken || !config.telegram.chatId) {
    return;
  }
  const now = Date.now();
  const shouldSend = attackActive && (!lastAttackState || now - lastTelegramSentAt > config.telegram.cooldownMs);
  if (!shouldSend) {
    lastAttackState = attackActive;
    return;
  }

  const message = formatAttackAlert({
    targetId,
    action: decision?.action || 'UNKNOWN',
    trafficClass: classification?.trafficClass || 'unknown',
    anomalyScore: Number(anomalyScore || 0),
    rps: Number(rps || 0),
    reason: reason || 'Attack mode active.'
  });

  try {
    await sendTelegramAlert({
      token: config.telegram.botToken,
      chatId: config.telegram.chatId,
      text: message
    });
    lastTelegramSentAt = now;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Telegram alert failed', error.message || error);
  } finally {
    lastAttackState = attackActive;
  }
}

app.use((req, res, next) => {
  if (
    req.path.startsWith('/metrics') ||
    req.path === '/health' ||
    req.path.startsWith('/ws') ||
    req.path.startsWith('/api')
  ) {
    return next();
  }

  if (!req.path.startsWith('/gateway')) {
    return next();
  }

  if (req.path.startsWith('/gateway/decoy')) {
    const delayMs = 250 + Math.floor(Math.random() * 400);
    return setTimeout(() => {
      res.status(200).json({
        status: 'ok',
        message: 'Request received.',
        data: {
          items: [],
          updatedAt: new Date().toISOString()
        }
      });
    }, delayMs);
  }

  if (req.path.startsWith('/gateway/secure/')) {
    const token = req.path.split('/')[3];
    const signature = getSignature(req);
    const check = verifySecureToken({ token, signature });
    if (!check.ok) {
      return res.redirect('/gateway/decoy');
    }
    const target = getTarget(check.targetId);
    if (!target) {
      return res.redirect('/gateway/decoy');
    }
    req._gatewayStart = Date.now();
    req._gatewayPathPrefix = `/gateway/secure/${token}`;
    req._targetUrl = target.url;
    req._recordResponse = (meta) => {
      target.state.recordResponse(meta);
      recordResponseGlobal(meta);
    };
    // eslint-disable-next-line no-console
    console.log('FORWARDING request to backend');
    return proxy(req, res, () => {});
  }

  const match = req.path.match(/^\/gateway\/([^/]+)(\/|$)/);
  if (!match) {
    return res.status(404).json({
      error: 'Target not specified.'
    });
  }

  const targetId = match[1];
  const target = getTarget(targetId);
  if (!target) {
    return res.status(404).json({
      error: 'Target not registered.',
      targetId
    });
  }

  const signature = getSignature(req);

  if (req.path === `/gateway/${targetId}/_challenge` && req.method === 'GET') {
    const originalUrl = req.query.originalUrl ? decodeURIComponent(req.query.originalUrl) : `/gateway/${targetId}`;
    const challenge = createChallenge(signature, targetId, originalUrl);
    const html = renderChallengePage({
      targetId,
      token: challenge.token,
      originalUrl
    });
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }

  if (req.path === `/gateway/${targetId}/_verify` && req.method === 'POST') {
    const token = req.body?.token;
    const originalUrl = req.body?.originalUrl ? decodeURIComponent(req.body.originalUrl) : `/gateway/${targetId}`;
    const human = req.body?.human;
    const result = verifyChallenge({ token, signature, human });
    if (!result.ok) {
      const failures = recordFailure(signature);
      if (failures >= MAX_FAILURES) {
        return res.status(403).send('Verification failed. Access blocked.');
      }
      const retryChallenge = createChallenge(signature, targetId, originalUrl);
      const html = renderChallengePage({
        targetId,
        token: retryChallenge.token,
        originalUrl,
        error: result.reason
      });
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    }

    markVerified(signature, VERIFIED_TTL_MS);
    clearFailures(signature);
    return res.redirect(result.originalUrl || `/gateway/${targetId}`);
  }

  let anomaly;
  let classification;
  let decision;
  let decisionPayload;
  let trustScore;

  try {
    const meta = extractRequestMetadata(req);
    const features = target.state.recordRequest(meta);
    recordRequestGlobal(meta);

    anomaly = target.anomalyDetector(features);
    classification = classifyTraffic(features, anomaly.score);

    target.state.recordAnomaly({
      anomalyScore: anomaly.score,
      trafficClass: classification.trafficClass,
      confidence: classification.confidence,
      reason: classification.reason
    });
    recordAnomalyGlobal({
      anomalyScore: anomaly.score,
      trafficClass: classification.trafficClass,
      confidence: classification.confidence,
      reason: classification.reason
    });

    trustScore = updateTrust(signature, {
      anomalyScore: anomaly.score,
      trafficClass: classification.trafficClass
    });

    const verified = isVerified(signature);
    if (verified) {
      trustScore = Math.min(1, trustScore + 0.35);
    }

    const maxAnomaly = Math.max(
      getAnomalyMetrics().anomalyScore || 0,
      target.state.getAnomalyMetrics().anomalyScore || 0
    );
    const currentRps = target.state.getTrafficMetrics().rps || 0;
    const attackByScore = maxAnomaly >= 70;
    const attackByRps = currentRps >= 25;
    const attackByClass = ['bot', 'flood'].includes(classification.trafficClass) && maxAnomaly >= 55;
    const globalAttackMode = updateAttackMode({
      anomalyScore: maxAnomaly,
      rps: currentRps,
      trafficClass: classification.trafficClass,
      blocked: false
    }) || attackByScore || attackByRps || attackByClass;
    const challengeFailures = getFailureCount(signature);

    decision = buildDecision({
      anomalyScore: anomaly.score,
      classification,
      features,
      trustScore,
      globalAttackMode,
      verified,
      challengeFailures
    });

    if (verified && decision.action !== 'BLOCK') {
      decision = {
        ...decision,
        action: 'ALLOW',
        reason: `${decision.reason} Verified client bypass.`
      };
    }

    decisionPayload = {
      ...decision,
      anomalyScore: anomaly.score,
      trafficClass: classification.trafficClass,
      classificationConfidence: classification.confidence,
      reason: `${decision.reason} ${classification.reason}`,
      topFeatures: anomaly.contributors
    };

    const metricsAction = decision.action === 'ALLOW'
      ? 'allowed'
      : decision.action === 'RATE_LIMIT'
        ? 'rateLimited'
        : decision.action === 'CHALLENGE'
          ? 'challenged'
          : 'blocked';

    target.state.recordDecision({
      action: metricsAction,
      reason: decisionPayload.reason,
      confidence: classification.confidence,
      anomalyScore: anomaly.score,
      trafficClass: classification.trafficClass,
      topFeatures: anomaly.contributors,
      trustScore,
      riskScore: decision.riskScore
    });
    recordDecisionGlobal({
      action: metricsAction,
      reason: decisionPayload.reason,
      confidence: classification.confidence,
      anomalyScore: anomaly.score,
      trafficClass: classification.trafficClass,
      topFeatures: anomaly.contributors,
      trustScore,
      riskScore: decision.riskScore
    });

    maybeSendAttackAlert({
      attackActive: globalAttackMode,
      targetId,
      decision,
      classification,
      anomalyScore: anomaly.score,
      rps: currentRps,
      reason: decisionPayload.reason
    });
  } catch (error) {
    return res.status(403).json({
      status: 'blocked',
      reason: 'Detection or policy error. Default block.'
    });
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  // eslint-disable-next-line no-console
  console.log(`${clientIp} | ${targetId} | ${req.originalUrl} | ${anomaly.score} | ${decision.action} | ${decisionPayload.reason}`);

  if (decision.action === 'CHALLENGE') {
    const challenge = createChallenge(signature, targetId, req.originalUrl);
    const html = renderChallengePage({
      targetId,
      token: challenge.token,
      originalUrl: req.originalUrl
    });
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }

  if (getAttackMode() && ['bot', 'flood'].includes(classification.trafficClass) && !isVerified(signature)) {
    const failures = getFailureCount(signature);
    if (failures >= MAX_FAILURES) {
      return res.redirect('/gateway/decoy');
    }
    const challenge = createChallenge(signature, targetId, req.originalUrl);
    const html = renderChallengePage({
      targetId,
      token: challenge.token,
      originalUrl: req.originalUrl
    });
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }

  const enforcement = enforce(req, decision, config);
  let finalAction = 'BLOCK';
  if (decision.action === 'ALLOW') {
    finalAction = enforcement.allowed ? 'ALLOW' : (enforcement.blocked ? 'BLOCK' : 'RATE_LIMIT');
  } else if (decision.action === 'RATE_LIMIT') {
    finalAction = 'RATE_LIMIT';
  } else if (decision.action === 'BLOCK') {
    finalAction = 'BLOCK';
  }

  if (finalAction === 'BLOCK') {
    res.setHeader('Retry-After', String(enforcement.retryAfterSeconds || 1));
    updateAttackMode({
      anomalyScore: anomaly.score,
      rps: target.state.getTrafficMetrics().rps || 0,
      trafficClass: classification.trafficClass,
      blocked: true
    });
    return res.status(403).json({
      status: 'blocked',
      reason: decisionPayload.reason
    });
  }

  if (finalAction === 'RATE_LIMIT') {
    res.setHeader('Retry-After', String(enforcement.retryAfterSeconds || 1));
    return res.status(429).json({
      status: 'rate_limited',
      reason: decisionPayload.reason
    });
  }

  if (getAttackMode() && isVerified(signature)) {
    const secureToken = createSecureToken({ signature, targetId });
    const suffix = req.originalUrl.replace(`/gateway/${targetId}`, '') || '/';
    return res.redirect(`/gateway/secure/${secureToken}${suffix}`);
  }


  // eslint-disable-next-line no-console
  console.log('FORWARDING request to backend');

  req._gatewayStart = Date.now();
  req._gatewayPathPrefix = `/gateway/${targetId}`;
  req._targetUrl = target.url;
  req._recordResponse = (meta) => {
    target.state.recordResponse(meta);
    recordResponseGlobal(meta);
  };

  return proxy(req, res, () => {});
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server, path: '/ws/metrics' });

wss.on('error', () => {
  // swallow ws server errors to avoid crashing the gateway
});

wss.on('connection', (ws) => {
  ws.on('error', () => {
    // prevent malformed frames from crashing the process
  });
});

function broadcastMetrics() {
  const payload = JSON.stringify({
    traffic: getTrafficMetrics(),
    mitigation: getMitigationMetrics()
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

setInterval(broadcastMetrics, 2000);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Gateway listening on :${config.port}`);
});
