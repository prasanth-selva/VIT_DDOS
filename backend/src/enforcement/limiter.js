const buckets = new Map();
const blockedSignatures = new Map();
const BLOCK_TTL_MS = 60 * 1000;

function getSignature(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const ua = req.headers['user-agent'] || 'unknown';
  return `${ip}|${ua}`;
}

function getBucket(signature, ratePerSecond, burst) {
  if (!buckets.has(signature)) {
    buckets.set(signature, {
      tokens: burst,
      lastRefill: Date.now()
    });
  }

  const bucket = buckets.get(signature);
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(burst, bucket.tokens + elapsed * ratePerSecond);
  bucket.lastRefill = now;

  return bucket;
}

function enforce(req, decision, config) {
  const signature = getSignature(req);
  const now = Date.now();

  const blockedUntil = blockedSignatures.get(signature);
  if (blockedUntil && blockedUntil > now) {
    return { allowed: false, signature, retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000), blocked: true };
  }

  if (decision.action === 'BLOCK') {
    blockedSignatures.set(signature, now + BLOCK_TTL_MS);
    return { allowed: false, signature, retryAfterSeconds: Math.ceil(BLOCK_TTL_MS / 1000), blocked: true };
  }

  if (decision.action === 'ALLOW') {
    return { allowed: true, signature };
  }

  const ratePerSecond = decision.rateLimitRps || config.baseRateLimitRps;
  const burst = config.baseBurst;
  const bucket = getBucket(signature, ratePerSecond, burst);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, signature };
  }

  return {
    allowed: false,
    signature,
    retryAfterSeconds: 1
  };
}

module.exports = {
  enforce,
  getSignature
};
