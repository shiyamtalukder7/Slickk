const { randomUUID } = require('node:crypto');

const cors = require('cors');
const express = require('express');

const { config } = require('./config');
const { parseTutorRequest } = require('./contracts/tutor');
const {
  createTutorPlan,
} = require('./pedagogy/orchestrator');
const {
  checkOllamaHealth,
  OllamaError,
} = require('./services/ollama');
const {
  askTutor,
  buildStreamingLearningTwin,
  streamTutor,
} = require('./services/tutor');
const {
  ConversationStoreError,
  createConversationStore,
} = require('./storage/conversations');
const {
  createCurriculumStore,
  CurriculumStoreError,
} = require('./storage/curriculum');

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

function errorStatus(error) {
  if (
    error instanceof OllamaError ||
    error instanceof ConversationStoreError ||
    error instanceof CurriculumStoreError
  ) {
    return error.status;
  }

  return 500;
}

function errorCode(error) {
  if (
    error instanceof OllamaError ||
    error instanceof ConversationStoreError ||
    error instanceof CurriculumStoreError
  ) {
    return error.code;
  }

  return 'UNEXPECTED_TUTOR_ERROR';
}

function writeStreamEvent(response, event) {
  if (!response.writableEnded && !response.destroyed) {
    response.write(`${JSON.stringify(event)}\n`);
  }
}

function createApp(options = {}) {
  const app = express();
  const conversationStore =
    options.conversationStore || createConversationStore();
  const curriculumStore =
    options.curriculumStore || createCurriculumStore();

  app.locals.conversationStore = conversationStore;
  app.locals.curriculumStore = curriculumStore;

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

  function prepareConversation(requestData) {
    const conversation =
      conversationStore.getOrCreateConversation({
        conversationId: requestData.conversationId,
        studentId: requestData.studentId,
        firstMessage: requestData.message,
      });

    const storedHistory =
      conversationStore.getRecentMessages(
        conversation.id,
        config.maxHistoryMessages
      );

    const history =
      storedHistory.length > 0
        ? storedHistory
        : requestData.recentMessages;
    const learnerProfile =
      conversationStore.getLearnerProfile(
        requestData.studentId
      );
    const pedagogyPlan = createTutorPlan({
      requestData,
      history,
      learnerProfile,
    });
    const curriculumEvidence =
      curriculumStore.search(requestData.message, 4);
    const enrichedRequestData = {
      ...requestData,
      pedagogyPlan,
      learnerMemory: pedagogyPlan.relevantMemory,
      curriculumEvidence,
    };

    const studentMessage = conversationStore.saveMessage({
      conversationId: conversation.id,
      role: 'student',
      text: requestData.message,
      mode: requestData.mode,
    });

    return {
      conversation,
      history,
      learnerProfile,
      pedagogyPlan,
      curriculumEvidence,
      requestData: enrichedRequestData,
      studentMessage,
    };
  }

  function recordLearning(context, learningTwin) {
    return conversationStore.recordLearningTurn({
      studentId: context.requestData.studentId,
      studentName: context.requestData.studentName,
      grade: context.requestData.grade,
      language: context.requestData.language,
      conversationId: context.conversation.id,
      pedagogyPlan: context.pedagogyPlan,
      learningTwin,
    });
  }

  app.get('/', (request, response) => {
    response.json({
      status: 'online',
      service: 'Slickk Local Intelligence Core',
      version: '5.0.0',
      provider: 'ollama',
      model: config.ollamaModel,
      storage: 'local-sqlite',
      capabilities: [
        'adaptive tutoring',
        'streaming responses',
        'persistent conversations',
        'persistent learner profiles',
        'subject-aware pedagogy',
        'page-grounded curriculum retrieval',
        'Bangla and English textbook search',
        'deterministic tutor orchestration',
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
        database: 'connected',
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
        database: 'connected',
        model: config.ollamaModel,
        error: 'Open Ollama on the laptop and try again.',
        code: errorCode(error),
        requestId: request.requestId,
      });
    }
  });

  app.get(
    '/api/students/:studentId/progress',
    (request, response) => {
      const studentId =
        String(request.params.studentId || '').trim();

      if (!studentId || studentId.length > 120) {
        return response.status(400).json({
          error: 'Please provide a valid student ID.',
          code: 'INVALID_STUDENT_ID',
          requestId: request.requestId,
        });
      }

      return response.json({
        profile:
          conversationStore.getLearnerProfile(
            studentId
          ),
        requestId: request.requestId,
      });
    }
  );

  app.get('/api/documents', (request, response) => {
    return response.json({
      documents: curriculumStore.listDocuments(),
      requestId: request.requestId,
    });
  });

  app.post('/api/documents/search', (request, response) => {
    const query = String(request.body?.query || '').trim();
    const requestedLimit = Number(request.body?.limit);

    if (!query || query.length > 1000) {
      return response.status(400).json({
        error: 'Please provide a textbook search query.',
        code: 'INVALID_DOCUMENT_QUERY',
        requestId: request.requestId,
      });
    }

    try {
      const results = curriculumStore
        .search(
          query,
          Number.isInteger(requestedLimit)
            ? requestedLimit
            : 5
        )
        .map(({ content, ...citation }) => citation);

      return response.json({
        query,
        results,
        requestId: request.requestId,
      });
    } catch (error) {
      return response.status(errorStatus(error)).json({
        error: error.message,
        code: errorCode(error),
        requestId: request.requestId,
      });
    }
  });

  app.get('/api/conversations', (request, response) => {
    const studentId =
      typeof request.query.studentId === 'string'
        ? request.query.studentId.trim()
        : 'local-student';

    return response.json({
      conversations:
        conversationStore.listConversations(studentId),
      requestId: request.requestId,
    });
  });

  app.get(
    '/api/conversations/:conversationId/messages',
    (request, response) => {
      try {
        const studentId =
          typeof request.query.studentId === 'string'
            ? request.query.studentId.trim()
            : 'local-student';

        return response.json({
          conversationId: request.params.conversationId,
          messages: conversationStore.getMessages(
            request.params.conversationId,
            studentId
          ),
          requestId: request.requestId,
        });
      } catch (error) {
        return response.status(errorStatus(error)).json({
          error: error.message,
          code: errorCode(error),
          requestId: request.requestId,
        });
      }
    }
  );

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
      const context = prepareConversation(parsedRequest.data);
      const { tutorResult, metrics } = await askTutor(
        context.requestData,
        controller.signal,
        context.history
      );
      const tutorMessage = conversationStore.saveMessage({
        conversationId: context.conversation.id,
        role: 'tutor',
        text: tutorResult.reply,
        mode: parsedRequest.data.mode,
        metadata: {
          learningTwin: tutorResult,
          performance: metrics,
        },
      });
      const learnerProfile = recordLearning(
        context,
        tutorResult
      );
      const citations = context.curriculumEvidence.map(
        ({ content, ...citation }) => citation
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
        learnerProfile,
        citations,
        metadata: {
          provider: 'ollama',
          model: config.ollamaModel,
          mode: parsedRequest.data.mode,
          language: parsedRequest.data.language,
          grade: parsedRequest.data.grade,
          subject: context.pedagogyPlan.subject,
          lessonState:
            context.pedagogyPlan.lessonState,
          generatedAt: new Date().toISOString(),
          requestId: request.requestId,
          conversationId: context.conversation.id,
          messageId: tutorMessage.id,
          grounding: citations.length > 0
            ? 'curriculum'
            : 'model-only',
          performance: metrics,
        },
      });
    } catch (error) {
      const status = errorStatus(error);

      console.error(
        JSON.stringify({
          level: 'error',
          requestId: request.requestId,
          code: errorCode(error),
          message: error?.message || String(error),
        })
      );

      if (status === 499) {
        return;
      }

      return response.status(status).json({
        error:
          error instanceof OllamaError ||
          error instanceof ConversationStoreError ||
          error instanceof CurriculumStoreError
            ? error.message
            : 'Slickk could not prepare the tutor response.',
        code: errorCode(error),
        requestId: request.requestId,
      });
    } finally {
      request.removeListener('aborted', cancelRequest);
    }
  });

  app.post('/api/tutor/stream', async (request, response) => {
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
    response.once('close', () => {
      if (!response.writableEnded) {
        controller.abort();
      }
    });

    let streamStarted = false;

    try {
      const context = prepareConversation(parsedRequest.data);

      response.status(200);
      response.setHeader(
        'Content-Type',
        'application/x-ndjson; charset=utf-8'
      );
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.flushHeaders();
      streamStarted = true;

      writeStreamEvent(response, {
        type: 'start',
        requestId: request.requestId,
        conversationId: context.conversation.id,
        model: config.ollamaModel,
        subject: context.pedagogyPlan.subject,
        lessonState:
          context.pedagogyPlan.lessonState,
        grounded:
          context.curriculumEvidence.length > 0,
      });

      const result = await streamTutor(
        context.requestData,
        controller.signal,
        async (token) => {
          writeStreamEvent(response, {
            type: 'token',
            content: token,
          });
        },
        context.history
      );

      const learningTwin =
        buildStreamingLearningTwin(
          context.requestData
        );
      const tutorMessage = conversationStore.saveMessage({
        conversationId: context.conversation.id,
        role: 'tutor',
        text: result.content,
        mode: parsedRequest.data.mode,
        metadata: {
          learningTwin,
          performance: result.metrics,
        },
      });
      const learnerProfile = recordLearning(
        context,
        learningTwin
      );
      const citations = context.curriculumEvidence.map(
        ({ content, ...citation }) => citation
      );

      writeStreamEvent(response, {
        type: 'complete',
        reply: result.content,
        conversationId: context.conversation.id,
        messageId: tutorMessage.id,
        learningTwin,
        learnerProfile,
        citations,
        metadata: {
          provider: 'ollama',
          model: config.ollamaModel,
          requestId: request.requestId,
          subject: context.pedagogyPlan.subject,
          lessonState:
            context.pedagogyPlan.lessonState,
          grounding: citations.length > 0
            ? 'curriculum'
            : 'model-only',
          performance: result.metrics,
          generatedAt: new Date().toISOString(),
        },
      });

      return response.end();
    } catch (error) {
      const status = errorStatus(error);

      console.error(
        JSON.stringify({
          level: 'error',
          requestId: request.requestId,
          code: errorCode(error),
          message: error?.message || String(error),
        })
      );

      if (!streamStarted) {
        return response.status(status).json({
          error: error.message,
          code: errorCode(error),
          requestId: request.requestId,
        });
      }

      if (status !== 499) {
        writeStreamEvent(response, {
          type: 'error',
          error: error.message,
          code: errorCode(error),
          requestId: request.requestId,
        });
      }

      return response.end();
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
  writeStreamEvent,
};
