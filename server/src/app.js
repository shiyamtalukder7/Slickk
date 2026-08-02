const { randomUUID } = require('node:crypto');

const cors = require('cors');
const express = require('express');

const { config } = require('./config');
const { parseTutorRequest } = require('./contracts/tutor');
const {
  ENGLISH_MEDIUM_PATHWAYS,
  qualificationForProfile,
} = require('./catalog/english-medium');
const {
  seedEnglishMediumSchools,
} = require('./catalog/english-medium-schools');
const {
  IPEMIS_PRIMARY_DIRECTORY_URL,
  searchIpemisPrimarySchools,
} = require('./catalog/ipemis');
const {
  createTutorPlan,
} = require('./pedagogy/orchestrator');
const {
  createTutorDecision,
} = require('./agents/tutor-decision');
const {
  curriculumSearchFilters,
  findCurriculumTrack,
  parseStudentEducationProfile,
  profileOptions,
  teachingLanguageName,
} = require('./profiles/student');
const {
  defaultModelProvider,
  isModelProviderError,
} = require('./models/provider');
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
const {
  createSchoolStore,
  SchoolStoreError,
} = require('./storage/schools');
const {
  createStudyPack,
} = require('./study/tools');
const {
  scoreAssessment,
} = require('./assessment/scoring');
const {
  authenticateApi,
  createRateLimiter,
  requireStudentAccess,
  securityHeaders,
} = require('./security/api');
const {
  analyzeMaterialBuffer,
  MAX_MATERIAL_BYTES,
} = require('./documents/material');

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
    isModelProviderError(error) ||
    error instanceof ConversationStoreError ||
    error instanceof CurriculumStoreError ||
    error instanceof SchoolStoreError
  ) {
    return error.status;
  }

  return 500;
}

function errorCode(error) {
  if (
    isModelProviderError(error) ||
    error instanceof ConversationStoreError ||
    error instanceof CurriculumStoreError ||
    error instanceof SchoolStoreError
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
  const modelProvider =
    options.modelProvider || defaultModelProvider;
  const modelRuntime = modelProvider.runtime;
  const modelIdentity = modelProvider.identity;
  const conversationStore =
    options.conversationStore || createConversationStore();
  const curriculumStore =
    options.curriculumStore || createCurriculumStore();
  const schoolStore =
    options.schoolStore || createSchoolStore();
  seedEnglishMediumSchools(schoolStore);

  app.locals.conversationStore = conversationStore;
  app.locals.curriculumStore = curriculumStore;
  app.locals.schoolStore = schoolStore;
  app.locals.modelProvider = modelProvider;

  app.disable('x-powered-by');
  app.use(cors(corsOptions));
  app.use(securityHeaders);
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
  app.use(
    authenticateApi(config.apiCredentials)
  );
  app.use(
    createRateLimiter({
      maximum: config.rateLimitPerMinute,
    })
  );

  function curriculumAccessForStudent(studentId) {
    if (!studentId) {
      return {
        studentId: '',
        schoolId: '',
      };
    }

    const profile =
      conversationStore.getLearnerProfile(
        studentId
      ).educationProfile;

    return {
      studentId,
      schoolId: profile?.school?.id || '',
    };
  }

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
    const educationProfile =
      learnerProfile.educationProfile;
    const curriculumTrack =
      findCurriculumTrack(
        educationProfile?.curriculumTrack
      );
    const qualification =
      qualificationForProfile(
        educationProfile?.curriculumTrack,
        educationProfile?.grade
      );
    const effectiveRequestData =
      educationProfile?.setupComplete
        ? {
            ...requestData,
            studentName:
              educationProfile.studentName,
            grade: educationProfile.grade,
            language: teachingLanguageName(
              educationProfile.teachingLanguage
            ),
            schoolName:
              educationProfile.school?.name || '',
            schoolEiin:
              educationProfile.school?.eiin || '',
            curriculumTrack:
              curriculumTrack?.name || '',
            curriculumTrackId:
              curriculumTrack?.id || '',
            enrolledSubjects:
              educationProfile.subjects || [],
            qualificationStage:
              qualification?.stage || '',
            qualificationProvider:
              qualification?.provider || '',
          }
        : requestData;
    const basePedagogyPlan = createTutorPlan({
      requestData: effectiveRequestData,
      history,
      learnerProfile,
    });
    const curriculumEvidence =
      curriculumStore.search(
        effectiveRequestData.message,
        4,
        {
          ...curriculumSearchFilters(
            educationProfile,
            basePedagogyPlan.subject
          ),
          ...curriculumAccessForStudent(
            effectiveRequestData.studentId
          ),
        }
      );
    const pedagogyPlan = {
      ...basePedagogyPlan,
      decision: createTutorDecision({
        pedagogyPlan: basePedagogyPlan,
        curriculumEvidence,
      }),
    };
    const enrichedRequestData = {
      ...effectiveRequestData,
      pedagogyPlan,
      learnerMemory: pedagogyPlan.relevantMemory,
      curriculumEvidence,
    };

    const studentMessage = conversationStore.saveMessage({
      conversationId: conversation.id,
      role: 'student',
      text: effectiveRequestData.message,
      mode: effectiveRequestData.mode,
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
      service: 'Slickk LLM',
      version: '7.0.0',
      identity: modelIdentity,
      runtime: modelRuntime,
      storage: 'local-sqlite',
      capabilities: [
        'adaptive tutoring',
        'streaming responses',
        'persistent conversations',
        'persistent learner profiles',
        'school and curriculum profiles',
        'profile-filtered textbook retrieval',
        'Bangladesh school directory search',
        'international qualification pathways',
        'school-scoped licensed textbooks',
        'free official syllabus PDF grounding',
        'subject-aware pedagogy',
        'page-grounded curriculum retrieval',
        'Bangla and English textbook search',
        'deterministic tutor orchestration',
        'multilingual teaching',
        'misconception detection',
        'guided quizzes',
        'Learning Twin signals',
        'private Slickk LLM runtime',
      ],
      requestId: request.requestId,
    });
  });

  app.get('/health', async (request, response) => {
    try {
      const health = await modelProvider.checkHealth();
      const status = health.modelInstalled ? 200 : 503;

      return response.status(status).json({
        ok: health.modelInstalled,
        service: 'Slickk LLM',
        identity: modelIdentity,
        runtime: {
          ...modelRuntime,
          status: 'connected',
        },
        database: 'connected',
        model: modelRuntime.model,
        modelInstalled: health.modelInstalled,
        installedModels: health.installedModels,
        timestamp: new Date().toISOString(),
        requestId: request.requestId,
        error: health.modelInstalled
          ? undefined
          : `Install or select the local model "${modelRuntime.model}".`,
      });
    } catch (error) {
      return response.status(503).json({
        ok: false,
        service: 'Slickk LLM',
        identity: modelIdentity,
        runtime: {
          ...modelRuntime,
          status: 'disconnected',
        },
        database: 'connected',
        model: modelRuntime.model,
        error: 'Start the configured Slickk LLM local runtime and try again.',
        code: errorCode(error),
        requestId: request.requestId,
      });
    }
  });

  app.get(
    '/api/profile-options',
    (request, response) => {
      return response.json({
        ...profileOptions(),
        schoolDirectory: schoolStore.status(),
        primarySchoolDirectory: {
          provider: 'DPE IPEMIS',
          sourceUrl: IPEMIS_PRIMARY_DIRECTORY_URL,
          searchMode: 'official-live-with-local-cache',
          otherSchoolOptionSupported: true,
        },
        requestId: request.requestId,
      });
    }
  );

  app.get(
    '/api/curricula/english-medium',
    (request, response) => {
      return response.json({
        pathways: ENGLISH_MEDIUM_PATHWAYS,
        contentPolicy: {
          officialPublicPdfs:
            'Available to all matching student profiles.',
          licensedTextbooks:
            'Available only to the assigned school or student profile.',
        },
        requestId: request.requestId,
      });
    }
  );

  app.get(
    '/api/schools/search',
    async (request, response) => {
    try {
      const query =
        typeof request.query.q === 'string'
          ? request.query.q.trim()
          : '';
      const limit = Number(request.query.limit);

      const resultLimit = Number.isInteger(limit)
        ? Math.min(30, Math.max(1, limit))
        : 15;
      const localSchools = schoolStore.search(
        query,
        resultLimit
      );
      const primarySchools =
        await searchIpemisPrimarySchools(
          query,
          resultLimit
        );

      if (primarySchools.length > 0) {
        schoolStore.importSchools(primarySchools);
      }

      const schools = Array.from(
        {
          length: Math.max(
            localSchools.length,
            primarySchools.length
          ),
        },
        (_, index) => [
          localSchools[index],
          primarySchools[index],
        ]
      )
        .flat()
        .filter(Boolean)
        .filter(
          (school, index, items) =>
            items.findIndex(
              (candidate) =>
                candidate.id === school.id
            ) === index
        )
        .slice(0, resultLimit);

      return response.json({
        query,
        schools,
        directory: schoolStore.status(),
        primaryDirectory: {
          provider: 'DPE IPEMIS',
          sourceUrl: IPEMIS_PRIMARY_DIRECTORY_URL,
          online: primarySchools.length > 0,
        },
        otherSchoolOptionSupported: true,
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

  app.get(
    '/api/students/:studentId/profile',
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

      if (
        !requireStudentAccess(
          request,
          response,
          studentId
        )
      ) {
        return;
      }

      const learnerProfile =
        conversationStore.getLearnerProfile(studentId);

      return response.json({
        studentId,
        profile: learnerProfile.educationProfile,
        learningSummary: {
          totalTurns: learnerProfile.totalTurns,
          subjects: learnerProfile.subjects,
          activeMisconceptions:
            learnerProfile.activeMisconceptions,
        },
        requestId: request.requestId,
      });
    }
  );

  app.put(
    '/api/students/:studentId/profile',
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

      if (
        !requireStudentAccess(
          request,
          response,
          studentId
        )
      ) {
        return;
      }

      const parsed =
        parseStudentEducationProfile(request.body);

      if (!parsed.success) {
        return response.status(400).json({
          error: 'Please check the student profile.',
          code: 'INVALID_STUDENT_PROFILE',
          issues: parsed.issues,
          requestId: request.requestId,
        });
      }

      const learnerProfile =
        conversationStore.saveEducationProfile({
          studentId,
          profile: parsed.data,
          language: teachingLanguageName(
            parsed.data.teachingLanguage
          ),
        });

      return response.json({
        ok: true,
        studentId,
        profile: learnerProfile.educationProfile,
        requestId: request.requestId,
      });
    }
  );

  app.post('/api/study/packs', (request, response) => {
    const documentId = String(
      request.body?.documentId || ''
    ).trim();
    const studentId = String(
      request.body?.studentId || ''
    ).trim();
    const page = Number(request.body?.page) || 0;
    const available = curriculumStore
      .listDocuments(
        500,
        curriculumAccessForStudent(studentId)
      )
      .some((document) => document.id === documentId);

    if (!available) {
      return response.status(404).json({
        error: 'The learning document was not found.',
        code: 'DOCUMENT_NOT_FOUND',
        requestId: request.requestId,
      });
    }

    try {
      return response.status(201).json({
        studyPack: createStudyPack({
          title: request.body?.title,
          language: request.body?.language,
          regions: curriculumStore.listEvidenceRegions(
            documentId,
            page,
            studentId
          ),
        }),
        requestId: request.requestId,
      });
    } catch (error) {
      return response
        .status(Number(error.status) || 500)
        .json({
          error: error.message,
          code: error.code || 'STUDY_PACK_ERROR',
          requestId: request.requestId,
        });
    }
  });

  app.post(
    '/api/assessments/score',
    (request, response) => {
      const responses = Array.isArray(
        request.body?.responses
      )
        ? request.body.responses
        : [];

      if (
        responses.length === 0 ||
        responses.length > 100
      ) {
        return response.status(400).json({
          error:
            'Provide between 1 and 100 assessment responses.',
          code: 'INVALID_ASSESSMENT_RESPONSES',
          requestId: request.requestId,
        });
      }

      return response.json({
        report: scoreAssessment({
          assessmentId: request.body?.assessmentId,
          responses,
        }),
        requestId: request.requestId,
      });
    }
  );

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

      if (
        !requireStudentAccess(
          request,
          response,
          studentId
        )
      ) {
        return;
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
    const studentId =
      typeof request.query.studentId === 'string'
        ? request.query.studentId.trim()
        : '';

    return response.json({
      documents: curriculumStore.listDocuments(
        100,
        curriculumAccessForStudent(studentId)
      ),
      requestId: request.requestId,
    });
  });

  app.post(
    '/api/students/:studentId/materials/analyze',
    express.raw({
      type: 'application/octet-stream',
      limit: MAX_MATERIAL_BYTES,
    }),
    async (request, response) => {
      const studentId = String(
        request.params.studentId || ''
      ).trim();

      if (!studentId || !Buffer.isBuffer(request.body)) {
        return response.status(400).json({
          error: 'A student and material file are required.',
          code: 'INVALID_MATERIAL_REQUEST',
          requestId: request.requestId,
        });
      }

      if (
        !requireStudentAccess(
          request,
          response,
          studentId
        )
      ) {
        return;
      }

      try {
        const profile =
          conversationStore.getLearnerProfile(
            studentId
          ).educationProfile;
        const result = await analyzeMaterialBuffer({
          buffer: request.body,
          mimeType: request.header('X-Material-Type'),
          fileName: decodeURIComponent(
            request.header('X-Material-Name') ||
              'learning-material'
          ),
          studentId,
          profile,
          subject: request.header('X-Material-Subject'),
          store: curriculumStore,
        });

        return response.status(201).json({
          result,
          requestId: request.requestId,
        });
      } catch (error) {
        return response
          .status(Number(error.status) || 500)
          .json({
            error: error.message,
            code:
              error.code || 'MATERIAL_ANALYSIS_FAILED',
            requestId: request.requestId,
          });
      }
    }
  );

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
      const filters =
        request.body?.filters &&
        typeof request.body.filters === 'object'
          ? request.body.filters
          : {};
      const studentId =
        typeof request.body?.studentId === 'string'
          ? request.body.studentId.trim()
          : '';
      const results = curriculumStore
        .search(
          query,
          Number.isInteger(requestedLimit)
            ? requestedLimit
            : 5,
          {
            ...filters,
            ...curriculumAccessForStudent(studentId),
          }
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

  app.get(
    '/api/documents/:documentId/regions',
    (request, response) => {
      const studentId =
        typeof request.query.studentId === 'string'
          ? request.query.studentId.trim()
          : '';
      const page = Number(request.query.page) || 0;
      const available = curriculumStore
        .listDocuments(
          500,
          curriculumAccessForStudent(studentId)
        )
        .some(
          (document) =>
            document.id === request.params.documentId
        );

      if (!available) {
        return response.status(404).json({
          error: 'The learning document was not found.',
          code: 'DOCUMENT_NOT_FOUND',
          requestId: request.requestId,
        });
      }

      return response.json({
        documentId: request.params.documentId,
        page,
        regions: curriculumStore.listEvidenceRegions(
          request.params.documentId,
          page,
          studentId
        ),
        requestId: request.requestId,
      });
    }
  );

  app.put(
    '/api/documents/:documentId/regions/:regionId/correction',
    (request, response) => {
      const studentId = String(
        request.body?.studentId || ''
      ).trim();

      try {
        const available = curriculumStore
          .listDocuments(
            500,
            curriculumAccessForStudent(studentId)
          )
          .some(
            (document) =>
              document.id === request.params.documentId
          );

        if (!available) {
          return response.status(404).json({
            error: 'The learning document was not found.',
            code: 'DOCUMENT_NOT_FOUND',
            requestId: request.requestId,
          });
        }

        return response.json({
          ok: true,
          region: curriculumStore.correctEvidenceRegion({
            documentId: request.params.documentId,
            regionId: request.params.regionId,
            studentId,
            text: request.body?.text,
          }),
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
        context.history,
        modelProvider
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
          identity: modelIdentity.id,
          provider: modelRuntime.provider,
          model: modelRuntime.model,
          mode: parsedRequest.data.mode,
          language: parsedRequest.data.language,
          grade: parsedRequest.data.grade,
          subject: context.pedagogyPlan.subject,
          lessonState:
            context.pedagogyPlan.lessonState,
          tutorDecision:
            context.pedagogyPlan.decision,
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
          isModelProviderError(error) ||
          error instanceof ConversationStoreError ||
          error instanceof CurriculumStoreError ||
          error instanceof SchoolStoreError
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
        identity: modelIdentity.id,
        model: modelRuntime.model,
        subject: context.pedagogyPlan.subject,
        lessonState:
          context.pedagogyPlan.lessonState,
        tutorDecision:
          context.pedagogyPlan.decision,
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
        context.history,
        modelProvider
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
          identity: modelIdentity.id,
          provider: modelRuntime.provider,
          model: modelRuntime.model,
          requestId: request.requestId,
          subject: context.pedagogyPlan.subject,
          lessonState:
            context.pedagogyPlan.lessonState,
          tutorDecision:
            context.pedagogyPlan.decision,
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
