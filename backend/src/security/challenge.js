const crypto = require('crypto');

const challenges = new Map();
const verifiedSignatures = new Map();
const failureCounts = new Map();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const VERIFIED_TTL_MS = 20 * 60 * 1000;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 3;

function cleanupExpired() {
  const now = Date.now();
  challenges.forEach((value, key) => {
    if (value.expiresAt <= now) {
      challenges.delete(key);
    }
  });
  verifiedSignatures.forEach((value, key) => {
    if (value.expiresAt <= now) {
      verifiedSignatures.delete(key);
    }
  });
  failureCounts.forEach((value, key) => {
    if (value.lastFailure + FAILURE_WINDOW_MS <= now) {
      failureCounts.delete(key);
    }
  });
}

function isVerified(signature) {
  cleanupExpired();
  const record = verifiedSignatures.get(signature);
  return Boolean(record && record.expiresAt > Date.now());
}

function markVerified(signature, ttlMs = VERIFIED_TTL_MS) {
  verifiedSignatures.set(signature, {
    expiresAt: Date.now() + ttlMs
  });
}

function getFailureCount(signature) {
  cleanupExpired();
  const record = failureCounts.get(signature);
  return record ? record.count : 0;
}

function recordFailure(signature) {
  cleanupExpired();
  const now = Date.now();
  const record = failureCounts.get(signature) || { count: 0, lastFailure: now };
  record.count += 1;
  record.lastFailure = now;
  failureCounts.set(signature, record);
  return record.count;
}

function clearFailures(signature) {
  failureCounts.delete(signature);
}

function createChallenge(signature, targetId, originalUrl) {
  cleanupExpired();
  const token = crypto.randomBytes(16).toString('hex');
  challenges.set(token, {
    signature,
    targetId,
    originalUrl,
    createdAt: Date.now(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS
  });
  return { token };
}

function verifyChallenge({ token, signature, human }) {
  cleanupExpired();
  const record = challenges.get(token);
  if (!record) {
    return { ok: false, reason: 'Challenge expired. Please retry.' };
  }
  if (record.signature !== signature) {
    return { ok: false, reason: 'Challenge mismatch. Please retry.' };
  }
  if (record.expiresAt <= Date.now()) {
    challenges.delete(token);
    return { ok: false, reason: 'Challenge expired. Please retry.' };
  }
  if (!human) {
    return { ok: false, reason: 'Please confirm you are not a robot.' };
  }
  challenges.delete(token);
  return { ok: true, originalUrl: record.originalUrl, targetId: record.targetId };
}

function renderChallengePage({ targetId, token, originalUrl, error }) {
  const safeUrl = encodeURIComponent(originalUrl || `/gateway/${targetId}`);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verification Required</title>
    <style>
      body { font-family: Arial, sans-serif; background:#0f172a; color:#e2e8f0; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
      .card { background:#111827; border:1px solid #334155; border-radius:12px; padding:28px; width:360px; box-shadow:0 20px 60px rgba(0,0,0,0.35);} 
      h1 { font-size:18px; margin:0 0 8px; }
      p { font-size:13px; color:#94a3b8; margin:0 0 16px; }
      label { font-size:12px; color:#cbd5f5; display:block; margin-bottom:6px; }
      input { width:100%; padding:10px 12px; border-radius:8px; border:1px solid #334155; background:#0b1220; color:#e2e8f0; }
      button { margin-top:14px; width:100%; padding:10px 12px; background:#0ea5e9; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600; }
      .error { color:#f87171; font-size:12px; margin-top:10px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>We detected unusual traffic. Please verify.</h1>
      <p>Complete this quick check to continue.</p>
      <form method="POST" action="/gateway/${targetId}/_verify" id="challenge-form">
        <input type="hidden" name="token" value="${token}" />
        <input type="hidden" name="originalUrl" value="${safeUrl}" />
        <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:13px; color:#cbd5f5;">
          <input type="checkbox" name="human" required style="width:16px; height:16px;"> I am not a robot
        </label>
        <button type="submit" style="margin-top:14px; width:100%; padding:10px 12px; background:#0ea5e9; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Verify</button>
      </form>
      ${error ? `<div class="error">${error}</div>` : ''}
    </div>
  </body>
</html>`;
}

module.exports = {
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
};
