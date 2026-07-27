const { randomUUID } = require('node:crypto');

const cors = require('cors');
const express = require('express');

const { config } = require('./config');
const { parseTutorRequest } = require('./contracts/tutor');
const {
  checkOllamaHealth,
  OllamaError,
} = require('./services/ollama');
const { askTutor } = require('./services/tutor');

function corsOptions(request, callback) {
  const origin = request.header('Origin');
  const isAllowed =
    config.corsOrigins.length === 0 ||
    !origin ||
    config.corsOrigins.includes(origin);

  callback(
    isAllowed ? null : new Error('Origin is not allowed.'),
    { origin: isAllowed }
  );
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  app.use((request, response, next) => {
    const startedAt = Date.now();
    const requestId =
      request.header('X-Request-Id') || randomUUID();

    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    response.on('finish', () => {
      const durationMs = Date.now() - startedAt;

      console.log(
        JSON.stringify({
          level: 'info',
          requestId,
          method: request.method,
          path: request.path,
          status: response.statusCode,
          durationMs,
        })
      );
    });

    next();
  });

  app.get('/', (request, response) => {
    response.json({
      status: 'online',
      service: 'Slickk Local Intelligence Core',
      version: '2.0.0',
      provider: 'ollama',
      model: config.ollamaModel,
      capabilities: [
        'adaptive tutoring',
        'multilingual teaching',
        'misconception detection',
        'guided quizzes',
        'Learning Twin signals',
        'private local AI',
      ],
      requestId: request.requestId,
    });
  });

  app.get('/health', async (request, response) => {
    try {
      const health = await checkOllamaHealth();
      const status = health.modelInstalled ? 200 : 503;

      return response.status(status).json({
        ok: health.modelInstalled,
        service: 'Slickk Local Intelligence Core',
        ollama: 'connected',
        model: config.ollamaModel,
        modelInstalled: health.modelInstalled,
        installedModels: health.installedModels,
        timestamp: new Date().toISOString(),
        requestId: request.requestId,
        error: health.modelInstalled
          ? undefined
          : `Install or select the model "${config.ollamaModel}".`,
      });
    } catch (error) {
      return response.status(503).json({
        ok: false,
        service: 'Slickk Local Intelligence Core',
        ollama: 'disconnected',
        model: config.ollamaModel,
        error: 'Open Ollama on the laptop and try again.',
        code:
          error instanceof OllamaError
            ? error.code
            : 'HEALTH_CHECK_FAILED',
        requestId: request.requestId,
      });
    }
  });

  app.post('/api/tutor', async (request, response) => {
    const parsedRequest = parseTutorRequest(request.body);

    if (!parsedRequest.success) {
      return response.status(400).json({
        error: 'Please check the tutor request.',
        code: 'INVALID_TUTOR_REQUEST',
        issues: parsedRequest.issues,
        requestId: request.requestId,
      });
    }

    const controller = new AbortController();
    const cancelRequest = () => controller.abort();

    request.once('aborted', cancelRequest);

    try {
      const { tutorResult, metrics } = await askTutor(
        parsedRequest.data,
        controller.signal
      );

      return response.json({
        reply: tutorResult.reply,
        learningTwin: {
          topic: tutorResult.topic,
          skill: tutorResult.skill,
          misconception: tutorResult.misconception,
          nextAction: tutorResult.nextAction,
          confidence: tutorResult.confidence,
          masteryDelta: tutorResult.masteryDelta,
        },
        metadata: {
          provider: 'ollama',
          model: config.ollamaModel,
          mode: parsedRequest.data.mode,
          language: parsedRequest.data.language,
          grade: parsedRequest.data.grade,
          generatedAt: new Date().toISOString(),
          requestId: request.requestId,
          performance: metrics,
        },
      });
    } catch (error) {
      const isOllamaError = error instanceof OllamaError;
      const status = isOllamaError ? error.status : 500;

      console.error(
        JSON.stringify({
          level: 'error',
          requestId: request.requestId,
          code: isOllamaError
            ? error.code
            : 'UNEXPECTED_TUTOR_ERROR',
          message: error?.message || String(error),
        })
      );

      if (status === 499) {
        return;
      }

      return response.status(status).json({
        error: isOllamaError
          ? error.message
          : 'Slickk could not prepare the tutor response.',
        code: isOllamaError
          ? error.code
          : 'UNEXPECTED_TUTOR_ERROR',
        requestId: request.requestId,
      });
    } finally {
      request.removeListener('aborted', cancelRequest);
    }
  });

  app.use((request, response) => {
    response.status(404).json({
      error: 'Slickk server route not found.',
      code: 'ROUTE_NOT_FOUND',
      requestId: request.requestId,
    });
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      return next(error);
    }

    const invalidJson =
      error instanceof SyntaxError && 'body' in error;

    return response.status(invalidJson ? 400 : 500).json({
      error: invalidJson
        ? 'The request body is not valid JSON.'
        : 'The Slickk server encountered an unexpected error.',
      code: invalidJson ? 'INVALID_JSON' : 'SERVER_ERROR',
      requestId: request.requestId,
    });
  });

  return app;
}

module.exports = {
  createApp,
};
