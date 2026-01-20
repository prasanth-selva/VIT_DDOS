const STATE = {
  active: false,
  lastUpdated: 0,
  lastAttackAt: 0,
  recentBlocks: 0
};

const ATTACK_TTL_MS = 5 * 60 * 1000;

function updateAttackMode({ anomalyScore = 0, rps = 0, trafficClass = 'legit', blocked = false }) {
  const now = Date.now();
  const spike = rps >= 25 || anomalyScore >= 70;
  const botLike = ['bot', 'flood'].includes(trafficClass) && anomalyScore >= 55;

  if (blocked) {
    STATE.recentBlocks += 1;
  } else if (STATE.recentBlocks > 0 && now - STATE.lastUpdated > 3000) {
    STATE.recentBlocks = Math.max(0, STATE.recentBlocks - 1);
  }

  if (spike || botLike || STATE.recentBlocks >= 5) {
    STATE.active = true;
    STATE.lastAttackAt = now;
  } else if (STATE.active && now - STATE.lastAttackAt > ATTACK_TTL_MS) {
    STATE.active = false;
    STATE.recentBlocks = 0;
  }

  STATE.lastUpdated = now;
  return STATE.active;
}

function getAttackMode() {
  const now = Date.now();
  if (STATE.active && now - STATE.lastAttackAt > ATTACK_TTL_MS) {
    STATE.active = false;
    STATE.recentBlocks = 0;
  }
  return STATE.active;
}

module.exports = {
  updateAttackMode,
  getAttackMode
};
