function buildDecision({ anomalyScore, classification, features, trustScore, globalAttackMode = false, verified = false, challengeFailures = 0 }) {
  const confidence = classification.confidence;
  const topFeatures = [
    features.rps > 0 ? 'rps' : 'rps',
    features.endpointConcentration > 0.4 ? 'endpointConcentration' : 'headerEntropy',
    features.headerEntropy < 1.5 ? 'headerEntropy' : 'payloadVariance'
  ];

  const classWeight = classification.trafficClass === 'flood'
    ? 0.35
    : classification.trafficClass === 'bot'
      ? 0.2
      : classification.trafficClass === 'flash_crowd'
        ? 0.1
        : 0;

  const trustPenalty = Math.max(0, 0.5 - trustScore) * 0.5;
  const anomalyWeight = anomalyScore / 100;
  const confidenceWeight = confidence * 0.25;
  let riskScore = Math.min(1, anomalyWeight * 0.6 + classWeight + trustPenalty + confidenceWeight);

  if (verified) {
    riskScore = Math.max(0, riskScore - 0.35);
  }

  if (challengeFailures > 0) {
    riskScore = Math.min(1, riskScore + Math.min(0.2, challengeFailures * 0.08));
  }

  if (challengeFailures >= 3) {
    return {
      action: 'BLOCK',
      throttleMs: 0,
      rateLimitRps: 0,
      reason: 'Repeated CAPTCHA failures detected. Blocking temporarily.',
      confidence,
      topFeatures,
      riskScore
    };
  }

  if (globalAttackMode && !verified) {
    return {
      action: 'CHALLENGE',
      throttleMs: 0,
      rateLimitRps: null,
      reason: 'Attack mode active. Step-up verification required.',
      confidence,
      topFeatures,
      riskScore
    };
  }

  if (!verified && (
    ['bot', 'flood'].includes(classification.trafficClass) ||
    anomalyScore >= 75 ||
    riskScore >= 0.8 ||
    trustScore < 0.15
  )) {
    return {
      action: 'CHALLENGE',
      throttleMs: 0,
      rateLimitRps: null,
      reason: 'Suspicious signals detected. Step-up verification required.',
      confidence,
      topFeatures,
      riskScore
    };
  }

  if (features.rps < 2 && trustScore > 0.2) {
    return {
      action: 'ALLOW',
      throttleMs: 0,
      rateLimitRps: null,
      reason: 'Low request rate; allow to avoid false positives.',
      confidence: Math.max(0.4, confidence),
      topFeatures,
      riskScore
    };
  }

  if (['legit', 'flash_crowd'].includes(classification.trafficClass) && anomalyScore < 70 && trustScore > 0.3) {
    return {
      action: 'ALLOW',
      throttleMs: 0,
      rateLimitRps: null,
      reason: 'Traffic within expected baseline. Monitoring only.',
      confidence: Math.max(0.4, confidence),
      topFeatures,
      riskScore
    };
  }

  if (['flood', 'bot'].includes(classification.trafficClass) && riskScore >= 0.97 && anomalyScore > 92 && trustScore < 0.2) {
    return {
      action: 'BLOCK',
      throttleMs: 0,
      rateLimitRps: 0,
      reason: `Temporary block applied due to sustained ${classification.trafficClass} signals, high anomaly score, and low trust.`,
      confidence,
      topFeatures,
      riskScore
    };
  }


  if (riskScore >= 0.85 && (['flood', 'bot'].includes(classification.trafficClass) || anomalyScore > 80)) {
    return {
      action: 'RATE_LIMIT',
      throttleMs: 0,
      rateLimitRps: 30,
      reason: `Rate limiting applied due to ${classification.trafficClass} signals, elevated anomaly score, and declining trust.`,
      confidence,
      topFeatures,
      riskScore
    };
  }

  return {
    action: 'ALLOW',
    throttleMs: 0,
    rateLimitRps: null,
    reason: 'Traffic allowed with continued monitoring.',
    confidence,
    topFeatures,
    riskScore
  };
}

module.exports = {
  buildDecision
};
