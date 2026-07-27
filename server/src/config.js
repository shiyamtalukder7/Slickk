const path = require('node:path');

const dotenv = require('dotenv');

dotenv.config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
});

function readInteger(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, parsed));
}

function readBoolean(name, fallback) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  return fallback;
}

function readOrigins() {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  port: readInteger('PORT', 3000, 1, 65535),
  ollamaUrl: (
    process.env.OLLAMA_URL?.trim() ||
    'http://127.0.0.1:11434'
  ).replace(/\/+$/, ''),
  ollamaModel:
    process.env.OLLAMA_MODEL?.trim() ||
    'slickk-tutor-3b-backup',
  ollamaThink: readBoolean('OLLAMA_THINK', false),
  ollamaKeepAlive:
    process.env.OLLAMA_KEEP_ALIVE?.trim() || '30m',
  requestTimeoutMs: readInteger(
    'OLLAMA_TIMEOUT_MS',
    120000,
    10000,
    300000
  ),
  numContext: readInteger(
    'OLLAMA_NUM_CTX',
    4096,
    2048,
    16384
  ),
  numPredict: readInteger(
    'OLLAMA_NUM_PREDICT',
    320,
    64,
    1024
  ),
  maxHistoryMessages: readInteger(
    'MAX_HISTORY_MESSAGES',
    10,
    2,
    30
  ),
  corsOrigins: readOrigins(),
});

module.exports = {
  config,
  readBoolean,
  readInteger,
};
