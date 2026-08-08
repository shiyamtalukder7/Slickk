const { config } = require('../config');

class OllamaError extends Error {
  constructor(message, code, status = 503, details = undefined) {
    super(message);
    this.name = 'OllamaError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.isModelProviderError = true;
  }
}

function nanosecondsToMilliseconds(value) {
  const nanoseconds = Number(value);

  if (!Number.isFinite(nanoseconds) || nanoseconds < 0) {
    return null;
  }

  return Math.round(nanoseconds / 1_000_000);
}

function calculateTokensPerSecond(tokenCount, duration) {
  const tokens = Number(tokenCount);
  const nanoseconds = Number(duration);

  if (
    !Number.isFinite(tokens) ||
    !Number.isFinite(nanoseconds) ||
    tokens <= 0 ||
    nanoseconds <= 0
  ) {
    return null;
  }

  return Number((tokens / (nanoseconds / 1_000_000_000)).toFixed(2));
}

function readMetrics(data) {
  return {
    totalMs: nanosecondsToMilliseconds(data?.total_duration),
    loadMs: nanosecondsToMilliseconds(data?.load_duration),
    promptTokens: Number(data?.prompt_eval_count) || 0,
    generatedTokens: Number(data?.eval_count) || 0,
    tokensPerSecond: calculateTokensPerSecond(
      data?.eval_count,
      data?.eval_duration
    ),
    doneReason:
      typeof data?.done_reason === 'string'
        ? data.done_reason
        : null,
  };
}

function createAbortContext(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, {
      once: true,
    });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    didTimeOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener(
        'abort',
        abortFromParent
      );
    },
  };
}

function translateFetchError(error, timedOut) {
  if (error instanceof OllamaError) {
    return error;
  }

  if (error?.name === 'AbortError') {
    return new OllamaError(
      timedOut
        ? 'The local tutor took too long to answer.'
        : 'The tutor request was cancelled.',
      timedOut ? 'OLLAMA_TIMEOUT' : 'REQUEST_CANCELLED',
      timedOut ? 504 : 499
    );
  }

  return new OllamaError(
    'Slickk LLM could not connect to its local model runtime.',
    'OLLAMA_UNREACHABLE',
    503,
    { cause: error?.message || String(error) }
  );
}

async function parseErrorResponse(response) {
  let message = '';

  try {
    const data = await response.json();
    message = typeof data?.error === 'string' ? data.error : '';
  } catch {
    message = '';
  }

  const modelMissing =
    response.status === 404 ||
    /model.+(not found|does not exist)/i.test(message);

  return new OllamaError(
    modelMissing
      ? `The configured local model "${config.modelName}" is not installed.`
      : message || 'The local model runtime could not complete the request.',
    modelMissing ? 'MODEL_NOT_FOUND' : 'OLLAMA_RESPONSE_ERROR',
    modelMissing ? 503 : 502,
    { ollamaStatus: response.status }
  );
}

async function fetchJson(path, options = {}) {
  const abortContext = createAbortContext(
    options.signal,
    options.timeoutMs ?? config.requestTimeoutMs
  );
  const fetchOptions = { ...options };
  delete fetchOptions.signal;
  delete fetchOptions.timeoutMs;

  try {
    const response = await fetch(`${config.ollamaUrl}${path}`, {
      ...fetchOptions,
      signal: abortContext.controller.signal,
    });

    if (!response.ok) {
      throw await parseErrorResponse(response);
    }

    try {
      return await response.json();
    } catch {
      throw new OllamaError(
        'Ollama returned an unreadable response.',
        'INVALID_RESPONSE',
        502
      );
    }
  } catch (error) {
    throw translateFetchError(
      error,
      abortContext.didTimeOut()
    );
  } finally {
    abortContext.cleanup();
  }
}

function normalizeModelNames(data) {
  if (!Array.isArray(data?.models)) {
    return [];
  }

  return data.models
    .map((model) => model?.name || model?.model)
    .filter((name) => typeof name === 'string');
}

function isConfiguredModelInstalled(modelNames) {
  return modelNames.some(
    (modelName) =>
      modelName === config.modelName ||
      modelName.startsWith(`${config.modelName}:`)
  );
}

async function checkOllamaHealth() {
  const data = await fetchJson('/api/tags', {
    timeoutMs: 5000,
  });
  const installedModels = normalizeModelNames(data);

  return {
    installedModels,
    modelInstalled: isConfiguredModelInstalled(installedModels),
  };
}

const GENERATION_OPTION_KEYS = Object.freeze([
  'temperature',
  'top_p',
  'top_k',
  'min_p',
  'repeat_penalty',
  'seed',
]);

function normalizeGenerationOptions(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  const normalized = {};

  for (const key of GENERATION_OPTION_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(
        value,
        key
      ) &&
      Number.isFinite(value[key])
    ) {
      normalized[key] = value[key];
    }
  }

  return normalized;
}

function tutorRequestBody(messages, stream, format, generationOptions = null) {
  return {
    model: config.modelName,
    stream,
    think: config.ollamaThink,
    ...(format ? { format } : {}),
    keep_alive: config.ollamaKeepAlive,
    messages,
    options: {
      temperature: 0.25,
      top_p: 0.9,
      repeat_penalty: 1.08,
      num_ctx: config.numContext,
      num_predict: config.numPredict,
      ...normalizeGenerationOptions(
        generationOptions
      ),
    },
  };
}

async function generateTutorResult({
  messages,
  format,
  signal,
  generationOptions,
}) {
  const data = await fetchJson('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify(
      tutorRequestBody(messages, false, format, generationOptions)
    ),
  });

  const content = data?.message?.content?.trim();

  if (!content) {
    throw new OllamaError(
      'The local model returned an empty answer.',
      'EMPTY_RESPONSE',
      502
    );
  }

  return {
    content,
    metrics: readMetrics(data),
  };
}

async function streamTutorResult({
  messages,
  signal,
  onToken,
}) {
  const abortContext = createAbortContext(
    signal,
    config.requestTimeoutMs
  );
  let reader;

  try {
    const response = await fetch(
      `${config.ollamaUrl}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortContext.controller.signal,
        body: JSON.stringify(
          tutorRequestBody(messages, true)
        ),
      }
    );

    if (!response.ok) {
      throw await parseErrorResponse(response);
    }

    if (!response.body) {
      throw new OllamaError(
        'Ollama streaming is unavailable.',
        'STREAM_UNAVAILABLE',
        502
      );
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reply = '';
    let finalChunk = {};

    async function processLine(line) {
      if (!line.trim()) {
        return;
      }

      let chunk;

      try {
        chunk = JSON.parse(line);
      } catch {
        throw new OllamaError(
          'Ollama returned an invalid stream chunk.',
          'INVALID_STREAM',
          502
        );
      }

      if (chunk?.error) {
        throw new OllamaError(
          String(chunk.error),
          'OLLAMA_STREAM_ERROR',
          502
        );
      }

      const token = chunk?.message?.content;

      if (typeof token === 'string' && token) {
        reply += token;
        await onToken(token);
      }

      if (chunk?.done) {
        finalChunk = chunk;
      }
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        await processLine(line);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      await processLine(buffer);
    }

    if (!reply.trim()) {
      throw new OllamaError(
        'The local model returned an empty answer.',
        'EMPTY_RESPONSE',
        502
      );
    }

    return {
      content: reply.trim(),
      metrics: readMetrics(finalChunk),
    };
  } catch (error) {
    throw translateFetchError(
      error,
      abortContext.didTimeOut()
    );
  } finally {
    await reader?.cancel().catch(() => {});
    abortContext.cleanup();
  }
}

module.exports = {
  OllamaError,
  calculateTokensPerSecond,
  checkOllamaHealth,
  generateTutorResult,
  isConfiguredModelInstalled,
  nanosecondsToMilliseconds,
  normalizeModelNames,
  readMetrics,
  streamTutorResult,
};
