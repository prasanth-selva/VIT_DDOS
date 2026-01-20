const crypto = require('crypto');

const tokens = new Map();
const TOKEN_TTL_MS = 8 * 60 * 1000;

function cleanupExpired() {
  const now = Date.now();
  tokens.forEach((value, key) => {
    if (value.expiresAt <= now) {
      tokens.delete(key);
    }
  });
}

function createSecureToken({ signature, targetId }) {
  cleanupExpired();
  const token = crypto.randomBytes(16).toString('hex');
  tokens.set(token, {
    signature,
    targetId,
    expiresAt: Date.now() + TOKEN_TTL_MS
  });
  return token;
}

function verifySecureToken({ token, signature }) {
  cleanupExpired();
  const record = tokens.get(token);
  if (!record) return { ok: false };
  if (record.expiresAt <= Date.now()) {
    tokens.delete(token);
    return { ok: false };
  }
  if (record.signature !== signature) {
    return { ok: false };
  }
  return { ok: true, targetId: record.targetId };
}

module.exports = {
  createSecureToken,
  verifySecureToken,
  TOKEN_TTL_MS
};
