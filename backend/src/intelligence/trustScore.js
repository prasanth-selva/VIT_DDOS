const trustStore = new Map();

const DEFAULT_TRUST = 0.7;
const RECOVERY_RATE = 0.01;
const DECAY_RATE = 0.08;
const HARD_DECAY_RATE = 0.18;

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function getTrustRecord(signature) {
  if (!trustStore.has(signature)) {
    trustStore.set(signature, {
      trust: DEFAULT_TRUST,
      lastUpdated: Date.now()
    });
  }
  return trustStore.get(signature);
}

function updateTrust(signature, { anomalyScore, trafficClass }) {
  const record = getTrustRecord(signature);
  const now = Date.now();
  const elapsedSeconds = Math.max(1, (now - record.lastUpdated) / 1000);
  record.lastUpdated = now;

  let delta = 0;
  const suspicious = anomalyScore > 60 || ['bot', 'flood'].includes(trafficClass);
  const highlySuspicious = anomalyScore > 75 || trafficClass === 'flood';

  if (highlySuspicious) {
    delta -= HARD_DECAY_RATE;
  } else if (suspicious) {
    delta -= DECAY_RATE;
  } else {
    delta += RECOVERY_RATE;
  }

  if (elapsedSeconds > 5 && !suspicious) {
    delta += RECOVERY_RATE * Math.min(elapsedSeconds / 5, 3);
  }

  record.trust = clamp(record.trust + delta);
  return record.trust;
}

function getTrust(signature) {
  return getTrustRecord(signature).trust;
}

module.exports = {
  updateTrust,
  getTrust
};
