function classifyTraffic(features, anomalyScore) {
  const rules = [];
  const rps = features.rps || 0;
  const entropy = features.headerEntropy || 0;
  const uniqueness = features.headerUniqueness || 0;
  const concentration = features.endpointConcentration || 0;

  if ((rps > 25 || anomalyScore > 75) && rps >= 3 && uniqueness < 0.15 && concentration > 0.55) {
    rules.push({
      label: 'flood',
      confidence: 0.9,
      reason: 'High request rate with highly uniform headers and concentrated endpoint targeting.'
    });
  }

  if ((rps > 15 || anomalyScore > 65) && rps >= 3 && (entropy < 1.2 || uniqueness < 0.25) && concentration > 0.5) {
    rules.push({
      label: 'bot',
      confidence: 0.82,
      reason: 'Uniform headers with elevated endpoint concentration suggest automated clients.'
    });
  }

  if ((rps > 6 || anomalyScore > 40) && entropy > 2.0 && concentration < 0.4) {
    rules.push({
      label: 'flash_crowd',
      confidence: 0.7,
      reason: 'Diverse headers with distributed endpoints indicate a flash crowd.'
    });
  }

  if (rules.length === 0) {
    return {
      trafficClass: 'legit',
      confidence: 0.4,
      reason: 'Traffic matches baseline patterns.'
    };
  }

  const top = rules.sort((a, b) => b.confidence - a.confidence)[0];
  return {
    trafficClass: top.label,
    confidence: top.confidence,
    reason: top.reason
  };
}

module.exports = {
  classifyTraffic
};
