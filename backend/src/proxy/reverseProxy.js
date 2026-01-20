const { createProxyMiddleware } = require('http-proxy-middleware');
const { recordResponse } = require('../metrics/state');

function buildProxy(getTargetUrl, stripPrefix = '') {
  return createProxyMiddleware({
    target: 'http://localhost',
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    proxyTimeout: 15000,
    router(req) {
      return getTargetUrl(req);
    },
    pathRewrite(path, req) {
      const prefix = req._gatewayPathPrefix || stripPrefix;
      if (prefix && req.originalUrl && req.originalUrl.startsWith(prefix)) {
        const rewritten = req.originalUrl.replace(prefix, '') || '/';
        return rewritten;
      }
      if (stripPrefix && path.startsWith(stripPrefix)) {
        const rewritten = path.replace(stripPrefix, '') || '/';
        return rewritten;
      }
      return path;
    },
    onProxyRes(proxyRes, req) {
      const startedAt = req._gatewayStart || Date.now();
      const latencyMs = Date.now() - startedAt;
      const bytesOut = Number(proxyRes.headers['content-length'] || 0);
      const handler = req._recordResponse || recordResponse;
      handler({
        latencyMs,
        bytesOut,
        statusCode: proxyRes.statusCode || 200,
        timestamp: Date.now()
      });
    },
    onError(err, req, res) {
      const payload = JSON.stringify({
        error: 'Bad Gateway',
        message: 'Upstream service unavailable.'
      });

      if (res && typeof res.status === 'function') {
        return res.status(502).json({
          error: 'Bad Gateway',
          message: 'Upstream service unavailable.'
        });
      }

      if (res && typeof res.writeHead === 'function') {
        res.writeHead(502, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        });
        return res.end(payload);
      }

      if (res && typeof res.end === 'function') {
        return res.end();
      }
    }
  });
}

module.exports = buildProxy;
