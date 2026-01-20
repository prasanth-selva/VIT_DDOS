function normalizeHeaderValue(value) {
  if (!value) return 'unknown';
  if (Array.isArray(value)) return value.join(',');
  return String(value).slice(0, 64);
}

function fingerprintHeaders(headers) {
  const signature = [
    normalizeHeaderValue(headers['user-agent']),
    normalizeHeaderValue(headers['accept-language']),
    normalizeHeaderValue(headers['accept-encoding'])
  ];

  return signature.join('|');
}

function extractRequestMetadata(req) {
  const bytes = Number(req.headers['content-length'] || 0);
  const headerFingerprint = fingerprintHeaders(req.headers);
  const isWebSocket = (req.headers['upgrade'] || '').toLowerCase() === 'websocket';
  const httpVersion = req.httpVersion || '1.1';
  const protocol = isWebSocket ? 'websocket' : (httpVersion.startsWith('2') ? 'http2' : 'http1');

  return {
    path: req.path || '/',
    method: req.method,
    bytes,
    headerFingerprint,
    protocol
  };
}

module.exports = {
  extractRequestMetadata
};
