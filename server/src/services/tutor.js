const {
  TUTOR_RESULT_JSON_SCHEMA,
  TUTOR_REPAIR_RESULT_JSON_SCHEMA,
  safelyParseTutorResult,
  sanitizeTutorReply,
} = require('../contracts/tutor');
const {
  buildStreamingTutorSystemPrompt,
  buildTutorSystemPrompt,
} = require('../prompts/tutor');
const {
  defaultModelProvider,
} = require('../models/provider');
const {
  auditTutorLanguage,
  languageCorrectionInstruction,
  languageFailureReply,
  normalizeTeachingLanguage,
} = require('../language/contract');
const {
  auditTutorResponseShape,
  constrainTutorReply,
} = require('../auditing/response-shape');
const {
  auditClaimEvidenceShadow,
} = require('../auditing/claim-evidence');
const {
  applyLearningTwinPolicy,
  auditMindRightReply,
  deterministicMindRightResult,
  mindRightFallbackReply,
  mindRightRepairInstruction,
} = require('../mind-right/runtime');
const {
  applyMindfulnessLearningPolicy,
  auditMindfulReply,
  mindfulnessFallbackReply,
  mindfulnessRepairInstruction,
} = require('../mindfulness/engine');

function normalizeHistory(recentMessages) {
  return recentMessages.map((message) => ({
    role: message.role === 'student' ? 'user' : 'assistant',
    content: (message.text || message.content).slice(0, 4000),
  }));
}

function buildMessages(requestData, history, streaming) {
  return [
    {
      role: 'system',
      content: streaming
        ? buildStreamingTutorSystemPrompt(requestData)
        : buildTutorSystemPrompt(requestData),
    },
    ...normalizeHistory(history),
    {
      role: 'user',
      content: requestData.message,
    },
  ];
}

function clarificationReply(requestData) {
  const message = String(
    requestData.message || ''
  )
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80);
  const shownMessage = message || 'that';
  const mode = normalizeTeachingLanguage(
    requestData.language
  );

  if (mode === 'bangla') {
    return (
      '\u09a4\u09c1\u09ae\u09bf "' +
      shownMessage +
      '" \u09b2\u09bf\u0996\u09c7\u099b\u0964 ' +
      '\u098f\u099f\u09bf \u0995\u09bf \u0986\u0997\u09c7\u09b0 ' +
      '\u0995\u09cb\u09a8\u09cb \u09aa\u09cd\u09b0\u09b6\u09cd\u09a8\u09c7\u09b0 ' +
      '\u0989\u09a4\u09cd\u09a4\u09b0, \u09a8\u09be\u0995\u09bf ' +
      '\u098f\u099f\u09bf \u09b8\u09ae\u09cd\u09aa\u09b0\u09cd\u0995\u09c7 ' +
      '\u09b6\u09bf\u0996\u09a4\u09c7 \u099a\u09be\u0993?'
    );
  }

  if (mode === 'banglish') {
    return (
      `Tumi "${shownMessage}" likhecho. ` +
      'Eta ki ager kono proshner uttor, ' +
      'naki eta niye shikhte chao?'
    );
  }

  if (mode === 'bilingual') {
    return (
      `You entered "${shownMessage}". ` +
      'Is it an answer to an earlier question, ' +
      'or would you like to learn about it?'
    );
  }

  return (
    `You entered "${shownMessage}". ` +
    'Is it an answer to an earlier question, ' +
    'or would you like to learn about it?'
  );
}

function deterministicTutorResult(requestData) {
  if (
    requestData.pedagogyPlan?.turnKind ===
    'clarification'
  ) {
    const reply = clarificationReply(requestData);

    return {
      reply,
      topic: 'Clarifying the question',
      skill: 'Providing enough context',
      misconception: '',
      nextAction: 'Clarify what the message refers to.',
      confidence: 1,
      masteryDelta: 0,
      runtimeVerified: true,
      runtimePolicy:
        'context-clarification-v1',
    };
  }

  return deterministicMindRightResult(
    requestData
  );
}

function deterministicMetrics(kind) {
  return {
    provider: 'deterministic',
    policy: kind,
    promptTokens: 0,
    generatedTokens: 0,
    totalMs: 0,
  };
}

function messagesWithLanguageRepair(
  messages,
  requestData
) {
  const finalMessage =
    messages[messages.length - 1];

  return [
    ...messages.slice(0, -1),
    {
      role: 'system',
      content:
        languageCorrectionInstruction(
          requestData.language
        ),
    },
    finalMessage,
  ];
}

function messagesWithRuntimeRepair(
  messages,
  requestData,
  mindRightAudit,
  mindfulnessAudit,
  languageAudit
) {
  const finalMessage =
    messages[messages.length - 1];
  const languageRepair =
    languageAudit?.ok === false
      ? languageCorrectionInstruction(
          requestData.language
        )
      : '';
  const instructions = [];

  if (
    mindRightAudit?.ok === false ||
    languageRepair
  ) {
    instructions.push(
      mindRightRepairInstruction(
        requestData,
        mindRightAudit,
        languageRepair
      )
    );
  }

  if (mindfulnessAudit?.ok === false) {
    instructions.push(
      mindfulnessRepairInstruction(
        requestData,
        mindfulnessAudit
      )
    );
  }

  return [
    ...messages.slice(0, -1),
    {
      role: 'system',
      content: instructions.join('\n\n'),
    },
    finalMessage,
  ];
}

async function generateTutorAttempt({
  messages,
  signal,
  modelProvider,
  format = TUTOR_RESULT_JSON_SCHEMA,
}) {
  const result =
    await modelProvider.generate({
      messages,
      format,
      signal,
    });

  return {
    result,
    tutorResult:
      safelyParseTutorResult(
        result.content
      ),
  };
}

async function bufferedStreamAttempt({
  messages,
  signal,
  modelProvider,
}) {
  let bufferedReply = '';

  const result =
    await modelProvider.stream({
      messages,
      signal,
      onToken(token) {
        bufferedReply += String(
          token ?? ''
        );
      },
    });

  const rawReply = String(
    result?.reply ||
    result?.content ||
    bufferedReply ||
    ''
  ).trim();

  return {
    result,
    rawReply,
    reply: sanitizeTutorReply(
      rawReply,
      ''
    ),
  };
}

function logReleaseRejection({
  phase,
  languageAudit,
  mindRightAudit,
  mindfulnessAudit,
}) {
  const accepted =
    languageAudit?.ok === true &&
    mindRightAudit?.ok === true &&
    mindfulnessAudit?.ok === true;

  if (accepted) {
    return;
  }

  console.warn(
    JSON.stringify({
      level: 'warn',
      event: 'tutor-release-rejected',
      phase,
      language: {
        ok: languageAudit?.ok === true,
        issues: Array.isArray(languageAudit?.issues)
          ? languageAudit.issues
          : [],
      },
      mindRight: {
        ok: mindRightAudit?.ok === true,
        actionKind:
          mindRightAudit?.actionKind || '',
        questions:
          Number.isInteger(mindRightAudit?.questions)
            ? mindRightAudit.questions
            : null,
        words:
          Number.isInteger(mindRightAudit?.words)
            ? mindRightAudit.words
            : null,
        issues: Array.isArray(mindRightAudit?.issues)
          ? mindRightAudit.issues
          : [],
      },
      mindfulness: {
        ok: mindfulnessAudit?.ok === true,
        issues: Array.isArray(mindfulnessAudit?.issues)
          ? mindfulnessAudit.issues
          : [],
      },
    })
  );
}

async function askTutor(
  requestData,
  signal,
  history = requestData.recentMessages,
  modelProvider = defaultModelProvider
) {
  const deterministic =
    deterministicTutorResult(requestData);

  if (deterministic) {
    let tutorResult =
      applyLearningTwinPolicy(
        deterministic,
        requestData
      );
    const reply = constrainTutorReply(
      tutorResult.reply,
      {
        channel: requestData.channel,
      }
    );
    tutorResult.reply = reply;

    const mindfulnessAudit =
      auditMindfulReply(
        reply,
        requestData,
        history
      );

    tutorResult =
      applyMindfulnessLearningPolicy(
        tutorResult,
        requestData,
        mindfulnessAudit
      );

    return {
      tutorResult,
      metrics: deterministicMetrics(
        deterministic.runtimePolicy ||
        'mind-right-deterministic-v1'
      ),
      languageAudit: auditTutorLanguage(
        reply,
        requestData.language
      ),
      mindRightAudit:
        auditMindRightReply(
          reply,
          requestData,
          history
        ),
      mindfulnessAudit,
      responseAudit:
        auditTutorResponseShape(
          reply,
          requestData.channel
        ),
    };
  }

  const baseMessages =
    buildMessages(
      requestData,
      history,
      false
    );

  let attempt =
    await generateTutorAttempt({
      messages: baseMessages,
      signal,
      modelProvider,
    });

  let languageAudit =
    auditTutorLanguage(
      attempt.tutorResult.reply,
      requestData.language
    );
  let mindRightAudit =
    auditMindRightReply(
      attempt.tutorResult.reply,
      requestData,
      history
    );
  let mindfulnessAudit =
    auditMindfulReply(
      attempt.tutorResult.reply,
      requestData,
      history
    );

  if (
    !languageAudit.ok ||
    !mindRightAudit.ok ||
    !mindfulnessAudit.ok
  ) {
    attempt =
      await generateTutorAttempt({
        messages:
          messagesWithRuntimeRepair(
            baseMessages,
            requestData,
            mindRightAudit,
            mindfulnessAudit,
            languageAudit
          ),
        signal,
        modelProvider,
        format: TUTOR_REPAIR_RESULT_JSON_SCHEMA,
      });

    languageAudit =
      auditTutorLanguage(
        attempt.tutorResult.reply,
        requestData.language
      );
    mindRightAudit =
      auditMindRightReply(
        attempt.tutorResult.reply,
        requestData,
        history
      );
    mindfulnessAudit =
      auditMindfulReply(
        attempt.tutorResult.reply,
        requestData,
        history
      );
  }

  logReleaseRejection({
    phase: 'typed',
    languageAudit,
    mindRightAudit,
    mindfulnessAudit,
  });

  const releaseAccepted =
    languageAudit.ok &&
    mindRightAudit.ok &&
    mindfulnessAudit.ok;

  const acceptedReply =
    !languageAudit.ok
      ? languageFailureReply(
          requestData.language
        )
      : !mindfulnessAudit.ok
        ? mindfulnessFallbackReply(
            requestData
          )
        : !mindRightAudit.ok
          ? mindRightFallbackReply(
              requestData
            )
          : attempt.tutorResult.reply;

  attempt.tutorResult.reply =
    constrainTutorReply(
      sanitizeTutorReply(
        acceptedReply,
        languageFailureReply(
          requestData.language
        )
      ),
      {
        channel: requestData.channel,
      }
    );

  const finalMindRightAudit =
    auditMindRightReply(
      attempt.tutorResult.reply,
      requestData,
      history
    );
  const finalMindfulnessAudit =
    auditMindfulReply(
      attempt.tutorResult.reply,
      requestData,
      history
    );
  const releasedMindfulnessAudit =
    releaseAccepted
      ? finalMindfulnessAudit
      : {
          ...finalMindfulnessAudit,
          ok: false,
          issues: [
            ...new Set([
              ...finalMindfulnessAudit.issues,
              'FALLBACK_RELEASED',
            ]),
          ],
        };

  if (
    releaseAccepted &&
    process.env.SLICKK_CLAIM_EVIDENCE_SHADOW === '1'
  ) {
    void auditClaimEvidenceShadow({
      reply: attempt.tutorResult.reply,
      curriculumEvidence:
        requestData.curriculumEvidence,
      modelProvider,
      signal: AbortSignal.timeout(180000),
      phase: 'typed',
    });
  }

  let tutorResult =
    applyLearningTwinPolicy(
      attempt.tutorResult,
      requestData
    );

  tutorResult =
    applyMindfulnessLearningPolicy(
      tutorResult,
      requestData,
      releasedMindfulnessAudit
    );

  const responseAudit =
    auditTutorResponseShape(
      tutorResult.reply,
      requestData.channel
    );

  return {
    tutorResult,
    metrics:
      attempt.result.metrics,
    languageAudit:
      auditTutorLanguage(
        tutorResult.reply,
        requestData.language
      ),
    mindRightAudit:
      finalMindRightAudit,
    mindfulnessAudit:
      releasedMindfulnessAudit,
    responseAudit,
  };
}

async function streamTutor(
  requestData,
  signal,
  onToken,
  history = requestData.recentMessages,
  modelProvider = defaultModelProvider
) {
  const deterministic =
    deterministicTutorResult(requestData);

  if (deterministic) {
    let learningTwin =
      applyLearningTwinPolicy(
        deterministic,
        requestData
      );
    const reply = constrainTutorReply(
      learningTwin.reply,
      {
        channel: requestData.channel,
      }
    );
    learningTwin.reply = reply;

    const mindfulnessAudit =
      auditMindfulReply(
        reply,
        requestData,
        history
      );

    learningTwin =
      applyMindfulnessLearningPolicy(
        learningTwin,
        requestData,
        mindfulnessAudit
      );

    if (
      reply &&
      typeof onToken === 'function'
    ) {
      await onToken(reply);
    }

    return {
      reply,
      content: reply,
      learningTwin,
      metrics: deterministicMetrics(
        deterministic.runtimePolicy ||
        'mind-right-deterministic-v1'
      ),
      languageAudit: auditTutorLanguage(
        reply,
        requestData.language
      ),
      mindRightAudit:
        auditMindRightReply(
          reply,
          requestData,
          history
        ),
      mindfulnessAudit,
      responseAudit:
        auditTutorResponseShape(
          reply,
          requestData.channel
        ),
    };
  }

  const baseMessages =
    buildMessages(
      requestData,
      history,
      true
    );

  let attempt =
    await bufferedStreamAttempt({
      messages: baseMessages,
      signal,
      modelProvider,
    });

  let languageAudit =
    auditTutorLanguage(
      attempt.reply,
      requestData.language
    );
  let mindRightAudit =
    auditMindRightReply(
      attempt.reply,
      requestData,
      history
    );
  let mindfulnessAudit =
    auditMindfulReply(
      attempt.reply,
      requestData,
      history
    );

  if (
    !languageAudit.ok ||
    !mindRightAudit.ok ||
    !mindfulnessAudit.ok
  ) {
    attempt =
      await bufferedStreamAttempt({
        messages:
          messagesWithRuntimeRepair(
            baseMessages,
            requestData,
            mindRightAudit,
            mindfulnessAudit,
            languageAudit
          ),
        signal,
        modelProvider,
      });

    languageAudit =
      auditTutorLanguage(
        attempt.reply,
        requestData.language
      );
    mindRightAudit =
      auditMindRightReply(
        attempt.reply,
        requestData,
        history
      );
    mindfulnessAudit =
      auditMindfulReply(
        attempt.reply,
        requestData,
        history
      );
  }

  logReleaseRejection({
    phase: 'streaming',
    languageAudit,
    mindRightAudit,
    mindfulnessAudit,
  });

  const releaseAccepted =
    languageAudit.ok &&
    mindRightAudit.ok &&
    mindfulnessAudit.ok;

  const acceptedReply =
    constrainTutorReply(
      !languageAudit.ok
        ? languageFailureReply(
            requestData.language
          )
        : !mindfulnessAudit.ok
          ? mindfulnessFallbackReply(
              requestData
            )
          : !mindRightAudit.ok
            ? mindRightFallbackReply(
                requestData
              )
            : sanitizeTutorReply(
                attempt.reply,
                ''
              ),
      {
        channel: requestData.channel,
      }
    );

  const finalMindRightAudit =
    auditMindRightReply(
      acceptedReply,
      requestData,
      history
    );
  const finalMindfulnessAudit =
    auditMindfulReply(
      acceptedReply,
      requestData,
      history
    );
  const releasedMindfulnessAudit =
    releaseAccepted
      ? finalMindfulnessAudit
      : {
          ...finalMindfulnessAudit,
          ok: false,
          issues: [
            ...new Set([
              ...finalMindfulnessAudit.issues,
              'FALLBACK_RELEASED',
            ]),
          ],
        };
  let learningTwin =
    applyLearningTwinPolicy(
      {
        reply: acceptedReply,
      },
      requestData
    );

  learningTwin =
    applyMindfulnessLearningPolicy(
      learningTwin,
      requestData,
      releasedMindfulnessAudit
    );

  const responseAudit =
    auditTutorResponseShape(
      acceptedReply,
      requestData.channel
    );

  if (
    acceptedReply &&
    typeof onToken === 'function'
  ) {
    await onToken(acceptedReply);
  }

  return {
    ...attempt.result,
    reply: acceptedReply,
    content: acceptedReply,
    learningTwin,
    languageAudit:
      auditTutorLanguage(
        acceptedReply,
        requestData.language
      ),
    mindRightAudit:
      finalMindRightAudit,
    mindfulnessAudit:
      releasedMindfulnessAudit,
    responseAudit,
  };
}

function buildStreamingLearningTwin(
  requestData,
  result = {}
) {
  if (
    result?.learningTwin &&
    typeof result.learningTwin === 'object'
  ) {
    return result.learningTwin;
  }

  return applyLearningTwinPolicy(
    {
      reply:
        result?.reply ||
        result?.content ||
        '',
    },
    requestData
  );
}

module.exports = {
  askTutor,
  buildMessages,
  buildStreamingLearningTwin,
  deterministicTutorResult,
  normalizeHistory,
  streamTutor,
};
