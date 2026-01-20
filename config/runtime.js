const { URL } = require('url');
const defaults = require('./default');

let targetUrl = process.env.TARGET_URL || defaults.targetUrl || null;

function validateTargetUrl(value) {
  if (!value) return null;
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Target URL must be http or https');
  }
  return parsed.toString().replace(/\/$/, '');
}

function getTargetUrl() {
  return targetUrl;
}

function setTargetUrl(value) {
  const next = validateTargetUrl(value);
  targetUrl = next;
  return targetUrl;
}

module.exports = {
  getTargetUrl,
  setTargetUrl
};
