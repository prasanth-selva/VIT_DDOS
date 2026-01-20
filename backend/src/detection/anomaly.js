const smoothing = 0.08;

function createAnomalyDetector() {
  const baseline = {
    rps: 2,
    endpointConcentration: 0.2,
    headerEntropy: 2.5,
    payloadVariance: 2000,
    burstiness: 0.1
  };

  function updateBaseline(features, factor = 1) {
    const alpha = smoothing * factor;
    Object.keys(baseline).forEach((key) => {
      baseline[key] = baseline[key] * (1 - alpha) + (features[key] || 0) * alpha;
    });
  }

  function scoreFeature(value, base, higherIsRisky = true) {
    if (base === 0) return 0;
    const ratio = higherIsRisky ? value / base : base / Math.max(value, 0.0001);
    const normalized = Math.min(Math.max(ratio - 1, 0), 4);
    return normalized / 4;
  }

  function anomalyScore(features) {
    const rpsEffective = Math.max(features.rps || 0, features.recentRps || 0);
    const rpsScore = scoreFeature(rpsEffective, baseline.rps, true);
    const concentrationScore = scoreFeature(features.endpointConcentration, baseline.endpointConcentration, true);
    const entropyScore = scoreFeature(features.headerEntropy, baseline.headerEntropy, false);
    const varianceScore = scoreFeature(features.payloadVariance, baseline.payloadVariance, true);
    const burstScore = scoreFeature(features.burstiness, baseline.burstiness, true);

    const composite = (rpsScore * 0.4 + concentrationScore * 0.2 + entropyScore * 0.2 + varianceScore * 0.1 + burstScore * 0.1);
    let score = Math.round(composite * 100);

    const botHeuristic = (features.headerUniqueness || 1) < 0.3 && (features.endpointConcentration || 0) > 0.4;
    const rpsRatio = baseline.rps > 0 ? rpsEffective / baseline.rps : rpsEffective;
    let rpsFloor = 0;
    if (rpsRatio >= 2.5) rpsFloor = 25;
    if (rpsRatio >= 5) rpsFloor = 40;
    if (rpsRatio >= 10) rpsFloor = 60;
    if (rpsRatio >= 20) rpsFloor = 75;
    score = Math.max(score, rpsFloor);

    if (rpsEffective > 10 && botHeuristic) {
      score = Math.max(score, 45);
    }
    if (concentrationScore > 0.65 && entropyScore > 0.55) {
      score = Math.max(score, 70);
    }

    const contributors = [
      { feature: 'rps', weight: rpsScore },
      { feature: 'endpointConcentration', weight: concentrationScore },
      { feature: 'headerEntropy', weight: entropyScore },
      { feature: 'payloadVariance', weight: varianceScore },
      { feature: 'burstiness', weight: burstScore }
    ]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((entry) => entry.feature);

    const spike = rpsEffective > baseline.rps * 2.5;
    updateBaseline({
      ...features,
      rps: rpsEffective
    }, spike ? 0.2 : 1);

    return {
      score,
      contributors,
      baseline: { ...baseline }
    };
  }

  return anomalyScore;
}

const anomalyScore = createAnomalyDetector();

module.exports = {
  anomalyScore,
  createAnomalyDetector
};
