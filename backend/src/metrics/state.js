const RollingWindow = require('../utils/rollingWindow');

const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS || 60);

function createState(windowSeconds = WINDOW_SECONDS) {
  const state = {
    startedAt: Date.now(),
    windowSeconds,
    requestWindow: [],
    rpsWindow: new RollingWindow(windowSeconds),
    bytesWindow: new RollingWindow(windowSeconds),
    latencyWindow: new RollingWindow(windowSeconds),
    totals: {
      requests: 0,
      bytes: 0
    },
    statusCodes: {
      success: 0,
      clientError: 0,
      serverError: 0
    },
    protocolCounts: {
      http1: 0,
      http2: 0,
      websocket: 0
    },
    trafficClasses: {
      legit: 0,
      flash_crowd: 0,
      bot: 0,
      flood: 0
    },
    classActions: {
      bot: { allowed: 0, throttled: 0, rateLimited: 0, blocked: 0, challenged: 0 },
      human: { allowed: 0, throttled: 0, rateLimited: 0, blocked: 0, challenged: 0 }
    },
    actions: {
      allowed: 0,
      throttled: 0,
      rateLimited: 0,
      blocked: 0,
      challenged: 0
    },
    lastDecision: null,
    lastDecisionAt: null,
    lastAnomaly: null,
    lastSeenAt: null,
    decisionWindow: [],
    mitigationLog: []
  };

  function pruneWindow(now) {
    const cutoff = now - state.windowSeconds * 1000;
    while (state.requestWindow.length > 0 && state.requestWindow[0].t < cutoff) {
      state.requestWindow.shift();
    }
  }

  function entropy(values) {
    if (values.length === 0) return 0;
    const counts = new Map();
    values.forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    const total = values.length;
    let sum = 0;
    for (const count of counts.values()) {
      const p = count / total;
      sum -= p * Math.log2(p);
    }
    return sum;
  }

  function variance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const varianceValue = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    return varianceValue;
  }

  function computeWindowFeatures() {
    const total = state.requestWindow.length || 1;
    const byEndpoint = new Map();
    const headerFingerprints = [];
    const payloadSizes = [];
    const now = Date.now();
    const recentCutoff = now - 5000;
    let recentCount = 0;

    state.requestWindow.forEach((req) => {
      byEndpoint.set(req.path, (byEndpoint.get(req.path) || 0) + 1);
      headerFingerprints.push(req.headerFingerprint);
      payloadSizes.push(req.bytes || 0);
      if (req.t >= recentCutoff) {
        recentCount += 1;
      }
    });

    const maxEndpoint = Math.max(...byEndpoint.values(), 0);
    const endpointConcentration = maxEndpoint / total;
    const headerEntropy = entropy(headerFingerprints);
    const uniqueHeaders = new Set(headerFingerprints).size;
    const headerUniqueness = uniqueHeaders / total;
    const payloadVariance = variance(payloadSizes);

    const rps = total / state.windowSeconds;
    const recentRps = recentCount / 5;
    const burstiness = payloadSizes.length > 2 ? Math.sqrt(payloadVariance) / (Math.max(1, payloadSizes.reduce((a, b) => a + b, 0) / payloadSizes.length)) : 0;

    return {
      rps,
      recentRps,
      endpointConcentration,
      headerEntropy,
      headerUniqueness,
      payloadVariance,
      burstiness
    };
  }

  function recordRequest(meta) {
    const now = Date.now();
    state.totals.requests += 1;
    state.totals.bytes += meta.bytes || 0;
    state.rpsWindow.add(1, now);
    state.bytesWindow.add(meta.bytes || 0, now);
    state.lastSeenAt = now;

    state.requestWindow.push({
      t: now,
      path: meta.path,
      headerFingerprint: meta.headerFingerprint,
      bytes: meta.bytes,
      protocol: meta.protocol
    });

    if (meta.protocol && state.protocolCounts[meta.protocol] !== undefined) {
      state.protocolCounts[meta.protocol] += 1;
    }

    pruneWindow(now);
    return computeWindowFeatures();
  }

  function pruneDecisionWindow(now) {
    const cutoff = now - state.windowSeconds * 1000;
    while (state.decisionWindow.length > 0 && state.decisionWindow[0].t < cutoff) {
      state.decisionWindow.shift();
    }
  }

  function recordDecision(decision) {
    state.lastDecision = decision;
    state.lastDecisionAt = Date.now();
    state.actions[decision.action] += 1;
    if (decision.trafficClass && state.trafficClasses[decision.trafficClass] !== undefined) {
      state.trafficClasses[decision.trafficClass] += 1;
    }

    const classGroup = ['bot', 'flood'].includes(decision.trafficClass) ? 'bot' : 'human';
    if (state.classActions[classGroup] && state.classActions[classGroup][decision.action] !== undefined) {
      state.classActions[classGroup][decision.action] += 1;
    }

    state.decisionWindow.push({
      t: state.lastDecisionAt,
      trafficClass: decision.trafficClass,
      action: decision.action
    });
    pruneDecisionWindow(state.lastDecisionAt);

    state.mitigationLog.unshift({
      time: new Date().toISOString(),
      action: decision.action,
      reason: decision.reason,
      confidence: decision.confidence,
      trustScore: decision.trustScore,
      riskScore: decision.riskScore,
      anomalyScore: decision.anomalyScore,
      trafficClass: decision.trafficClass,
      features: decision.topFeatures || []
    });

    state.mitigationLog = state.mitigationLog.slice(0, 50);
  }

  function recordResponse(meta) {
    if (typeof meta.bytesOut === 'number' && meta.bytesOut > 0) {
      state.bytesWindow.add(meta.bytesOut, meta.timestamp || Date.now());
      state.totals.bytes += meta.bytesOut;
    }

    if (typeof meta.latencyMs === 'number') {
      state.latencyWindow.add(meta.latencyMs, meta.timestamp || Date.now());
    }

    if (meta.statusCode >= 500) {
      state.statusCodes.serverError += 1;
    } else if (meta.statusCode >= 400) {
      state.statusCodes.clientError += 1;
    } else {
      state.statusCodes.success += 1;
    }
  }

  function recordAnomaly({ anomalyScore, trafficClass, confidence, reason }) {
    state.lastAnomaly = {
      anomalyScore,
      trafficClass,
      confidence,
      reason,
      updatedAt: Date.now()
    };
  }

  function getTrafficMetrics() {
    const rps = state.rpsWindow.sum() / state.windowSeconds;
    const bandwidthGbps = (state.bytesWindow.sum() * 8) / (state.windowSeconds * 1e9);
    const totalActions = state.actions.allowed + state.actions.throttled + state.actions.rateLimited + state.actions.blocked + state.actions.challenged || 1;
    const latencySamples = state.latencyWindow.series();
    const avgLatencyMs = latencySamples.reduce((acc, value) => acc + value, 0) / Math.max(1, latencySamples.length);
    const protocolTotal = state.protocolCounts.http1 + state.protocolCounts.http2 + state.protocolCounts.websocket || 1;

    return {
      rps,
      bandwidthGbps,
      cleanPercent: (state.actions.allowed / totalActions) * 100,
      throttledPercent: (state.actions.throttled / totalActions) * 100,
      rateLimitedPercent: (state.actions.rateLimited / totalActions) * 100,
      blockedPercent: (state.actions.blocked / totalActions) * 100,
      avgLatencyMs,
      statusCodes: { ...state.statusCodes },
      totals: { ...state.totals },
      protocolDistribution: {
        http1: (state.protocolCounts.http1 / protocolTotal) * 100,
        http2: (state.protocolCounts.http2 / protocolTotal) * 100,
        websocket: (state.protocolCounts.websocket / protocolTotal) * 100
      },
      history: {
        rps: state.rpsWindow.series(),
        bandwidth: state.bytesWindow.series().map((bytes) => (bytes * 8) / 1e9)
      }
    };
  }

  function getMitigationMetrics() {
    const staleWindowMs = state.windowSeconds * 1000;
    const lastDecisionFresh =
      state.lastDecision && state.lastDecisionAt && (Date.now() - state.lastDecisionAt) <= staleWindowMs;

    const now = Date.now();
    pruneDecisionWindow(now);
    const recentClassCounts = { legit: 0, flash_crowd: 0, bot: 0, flood: 0 };
    const recentClassActions = {
      bot: { allowed: 0, throttled: 0, rateLimited: 0, blocked: 0, challenged: 0 },
      human: { allowed: 0, throttled: 0, rateLimited: 0, blocked: 0, challenged: 0 }
    };

    state.decisionWindow.forEach((entry) => {
      if (recentClassCounts[entry.trafficClass] !== undefined) {
        recentClassCounts[entry.trafficClass] += 1;
      }
      const group = ['bot', 'flood'].includes(entry.trafficClass) ? 'bot' : 'human';
      if (recentClassActions[group] && recentClassActions[group][entry.action] !== undefined) {
        recentClassActions[group][entry.action] += 1;
      }
    });

    return {
      lastDecision: lastDecisionFresh ? state.lastDecision : null,
      actions: { ...state.actions },
      mitigationLog: state.mitigationLog,
      trafficClasses: { ...state.trafficClasses },
      classActions: {
        bot: { ...state.classActions.bot },
        human: { ...state.classActions.human }
      },
      recentClassCounts,
      recentClassActions
    };
  }

  function getExplainabilityMetrics() {
    const staleWindowMs = state.windowSeconds * 1000;
    const lastDecisionFresh =
      state.lastDecision && state.lastDecisionAt && (Date.now() - state.lastDecisionAt) <= staleWindowMs;

    if (!lastDecisionFresh) {
      return {
        reason: 'No recent decision.',
        topFeatures: [],
        confidence: 0,
        trustScore: 0,
        anomalyScore: 0,
        trafficClass: 'legit',
        riskScore: 0
      };
    }

    return {
      reason: state.lastDecision.reason,
      topFeatures: state.lastDecision.topFeatures || [],
      confidence: state.lastDecision.confidence,
      trustScore: state.lastDecision.trustScore,
      anomalyScore: state.lastDecision.anomalyScore,
      trafficClass: state.lastDecision.trafficClass,
      riskScore: state.lastDecision.riskScore
    };
  }

  function getAnomalyMetrics() {
    const staleWindowMs = state.windowSeconds * 1000;
    const hasRecentTraffic = state.lastSeenAt && (Date.now() - state.lastSeenAt) <= staleWindowMs;

    if (!hasRecentTraffic || !state.lastAnomaly) {
      return {
        anomalyScore: 0,
        trafficClass: 'legit',
        confidence: 0,
        reason: 'No recent anomaly.'
      };
    }

    return {
      anomalyScore: state.lastAnomaly.anomalyScore,
      trafficClass: state.lastAnomaly.trafficClass,
      confidence: state.lastAnomaly.confidence,
      reason: state.lastAnomaly.reason
    };
  }

  return {
    state,
    recordRequest,
    recordDecision,
    recordResponse,
    recordAnomaly,
    getTrafficMetrics,
    getMitigationMetrics,
    getExplainabilityMetrics,
    getAnomalyMetrics
  };
}

const defaultInstance = createState(WINDOW_SECONDS);

module.exports = {
  ...defaultInstance,
  createState
};
