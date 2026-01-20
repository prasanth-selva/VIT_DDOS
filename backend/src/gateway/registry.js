const { createState } = require('../metrics/state');
const { createAnomalyDetector } = require('../detection/anomaly');

const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS || 60);
const targets = new Map();

function normalizeTargetId(targetId) {
  const id = String(targetId || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return null;
  }
  return id;
}

function validateHttpsUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return { ok: false, message: 'Invalid URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, message: 'Target URL must use HTTPS.' };
  }
  if (!parsed.hostname) {
    return { ok: false, message: 'Target URL must include a hostname.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: 'Target URL must not include credentials.' };
  }
  return { ok: true, url: parsed.toString().replace(/\/$/, '') };
}

function registerTarget({ targetId, url, label }) {
  const id = normalizeTargetId(targetId);
  if (!id) {
    return { ok: false, message: 'targetId must be alphanumeric and may include - or _.' };
  }

  const validation = validateHttpsUrl(url);
  if (!validation.ok) {
    return validation;
  }

  const target = {
    id,
    label: label ? String(label).trim() : id,
    url: validation.url,
    createdAt: Date.now(),
    state: createState(WINDOW_SECONDS),
    anomalyDetector: createAnomalyDetector()
  };

  targets.set(id, target);
  return { ok: true, target };
}

function getTarget(targetId) {
  const id = normalizeTargetId(targetId);
  if (!id) return null;
  return targets.get(id) || null;
}

function listTargets() {
  return Array.from(targets.values()).map((target) => ({
    id: target.id,
    label: target.label,
    url: target.url,
    createdAt: target.createdAt
  }));
}

module.exports = {
  registerTarget,
  getTarget,
  listTargets,
  normalizeTargetId,
  validateHttpsUrl
};
