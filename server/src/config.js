const path = require('node:path');

const dotenv = require('dotenv');

const serverRoot = path.join(__dirname, '..');

dotenv.config({
  path: path.join(serverRoot, '.env'),
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

function resolveDatabasePath() {
  const configuredPath =
    process.env.SLICKK_DATABASE_PATH?.trim();

  if (!configuredPath) {
    return path.join(serverRoot, 'data', 'slickk.db');
  }

  if (configuredPath === ':memory:') {
    return configuredPath;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(serverRoot, configuredPath);
}

function readApiCredentials() {
  const {
    parseApiCredentials,
  } = require('./security/api');

  return parseApiCredentials(
    process.env.SLICKK_API_KEYS_JSON || ''
  );
}

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  port: readInteger('PORT', 3000, 1, 65535),
  modelProvider:
    process.env.SLICKK_MODEL_PROVIDER?.trim().toLowerCase() ||
    'ollama',
  modelUrl: (
    process.env.SLICKK_MODEL_URL?.trim() ||
    process.env.OLLAMA_URL?.trim() ||
    'http://127.0.0.1:11434'
  ).replace(/\/+$/, ''),
  modelName:
    process.env.SLICKK_MODEL_NAME?.trim() ||
    process.env.OLLAMA_MODEL?.trim() ||
    'slickk-tutor-3b-backup',
  ollamaUrl: (
    process.env.SLICKK_MODEL_URL?.trim() ||
    process.env.OLLAMA_URL?.trim() ||
    'http://127.0.0.1:11434'
  ).replace(/\/+$/, ''),
  ollamaModel:
    process.env.SLICKK_MODEL_NAME?.trim() ||
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
  apiCredentials: readApiCredentials(),
  rateLimitPerMinute: readInteger(
    'RATE_LIMIT_PER_MINUTE',
    120,
    10,
    5000
  ),
  databasePath: resolveDatabasePath(),
});

module.exports = {
  config,
  readBoolean,
  readApiCredentials,
  readInteger,
  resolveDatabasePath,
};
