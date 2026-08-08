const {
  normalizeTeachingLanguage,
} = require('../language/contract');
const {
  questionCount,
  wordCount,
} = require('../auditing/response-shape');

const RUNTIME_VERSION = 'mind-right-runtime-v1.1';

const PRACTICE_REQUEST_PATTERN =
  /\b(?:give|ask|show)\s+me\b[\s\S]{0,80}\b(?:question|problem|exercise)\b|\bquiz\s+me\b|\bpractice\b[\s\S]{0,80}\b(?:question|problem|exercise)\b/i;

const NUMBER_CONCEPT_PATTERN =
  /\b(?:explain|teach|define|what\s+is|meaning\s+of)\s+(?:the\s+)?number\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\b/i;

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function safeLearningText(
  value,
  fallback = '',
  maximumLength = 500
) {
  const text = cleanText(value);

  if (!text) {
    return fallback;
  }

  const unsafe =
    /^(?:<\?xml\b|<!doctype\b|<html\b|<xml\b|```|[\[{]\s*["']?(?:reply|message|content|answer|text)["']?\s*:)/i.test(
      text
    ) ||
    /\b(?:MIND_RIGHT_DECISION_DATA|PEDAGOGY_PLAN_DATA|STUDENT_PROFILE_DATA|RELEVANT_LEARNER_MEMORY_DATA|CURRICULUM_EVIDENCE_DATA)\s*=/i.test(
      text
    ) ||
    text.toLowerCase() === 'default';

  return unsafe
    ? fallback
    : text.slice(0, maximumLength);
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '';
  }

  if (Number.isInteger(number)) {
    return String(number);
  }

  return String(
    Number(number.toFixed(8))
  );
}

function arithmeticPatterns() {
  const number =
    '([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))';

  return [
    {
      operation: 'division',
      pattern: new RegExp(
        `${number}\\s*(?:÷|\\/|divided\\s+by)\\s*${number}`,
        'i'
      ),
      compute: (left, right) =>
        right === 0 ? Number.NaN : left / right,
    },
    {
      operation: 'multiplication',
      pattern: new RegExp(
        `${number}\\s*(?:×|\\*|x|times|multiplied\\s+by)\\s*${number}`,
        'i'
      ),
      compute: (left, right) => left * right,
    },
    {
      operation: 'addition',
      pattern: new RegExp(
        `${number}\\s*(?:\\+|plus|added\\s+to)\\s*${number}`,
        'i'
      ),
      compute: (left, right) => left + right,
    },
    {
      operation: 'subtraction',
      pattern: new RegExp(
        `${number}\\s*(?:-|minus|take\\s+away)\\s*${number}`,
        'i'
      ),
      compute: (left, right) => left - right,
    },
  ];
}

function parseSimpleArithmeticQuestion(value) {
  const text = cleanText(value);

  for (const candidate of arithmeticPatterns()) {
    const match = candidate.pattern.exec(text);

    if (!match) {
      continue;
    }

    const left = Number(match[1]);
    const right = Number(match[2]);
    const answer =
      candidate.compute(left, right);

    if (
      !Number.isFinite(left) ||
      !Number.isFinite(right) ||
      !Number.isFinite(answer)
    ) {
      return null;
    }

    return {
      operation: candidate.operation,
      left,
      right,
      answer,
      expression: match[0],
    };
  }

  return null;
}

function parseNumericAnswer(value) {
  const match = cleanText(value).match(
    /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))[.!]?$/u
  );

  return match
    ? Number(match[1])
    : null;
}

function operationLabel(operation) {
  const labels = {
    addition: 'Addition',
    subtraction: 'Subtraction',
    multiplication: 'Multiplication',
    division: 'Division',
  };

  return labels[operation] || 'Arithmetic';
}

function operationWord(operation) {
  const words = {
    addition: 'plus',
    subtraction: 'minus',
    multiplication: 'times',
    division: 'divided by',
  };

  return words[operation] || '';
}

function operationRequestFromText(value) {
  const text = cleanText(value).toLowerCase();

  if (/\b(?:division|divide|divided|quotient)\b/.test(text)) {
    return 'division';
  }

  if (/\b(?:multiplication|multiply|times|product)\b/.test(text)) {
    return 'multiplication';
  }

  if (/\b(?:addition|add|plus|sum)\b/.test(text)) {
    return 'addition';
  }

  if (/\b(?:subtraction|subtract|minus|difference)\b/.test(text)) {
    return 'subtraction';
  }

  return '';
}

function practiceProblem(operation) {
  const problems = {
    division: {
      left: 48,
      right: 6,
      answer: 8,
    },
    multiplication: {
      left: 7,
      right: 6,
      answer: 42,
    },
    addition: {
      left: 27,
      right: 15,
      answer: 42,
    },
    subtraction: {
      left: 42,
      right: 17,
      answer: 25,
    },
  };

  return problems[operation] || null;
}

function localizedPracticeQuestion(
  operation,
  left,
  right,
  language
) {
  const mode = normalizeTeachingLanguage(language);
  const word = operationWord(operation);

  if (mode === 'bangla') {
    const phrases = {
      division: `${left} কে ${right} দিয়ে ভাগ করলে কত হয়?`,
      multiplication: `${left} গুণ ${right} কত হয়?`,
      addition: `${left} যোগ ${right} কত হয়?`,
      subtraction: `${left} থেকে ${right} বিয়োগ করলে কত থাকে?`,
    };

    return phrases[operation];
  }

  if (mode === 'banglish') {
    const phrases = {
      division: `${left} ke ${right} diye vag korle koto hoy?`,
      multiplication: `${left} gun ${right} koto hoy?`,
      addition: `${left} jog ${right} koto hoy?`,
      subtraction: `${left} theke ${right} biyog korle koto thake?`,
    };

    return phrases[operation];
  }

  return `What is ${left} ${word} ${right}?`;
}

function localizedNumberConcept(number, language) {
  const mode = normalizeTeachingLanguage(language);
  const value = formatNumber(number);
  const previous = formatNumber(number - 1);
  const next = formatNumber(number + 1);

  if (mode === 'bangla') {
    return (
      `${value} একটি সংখ্যা, যা পরিমাণ বা সংখ্যারেখায় একটি অবস্থান বোঝায়। ` +
      `উদাহরণ হিসেবে, টেবিলে ${value}টি কাউন্টার কল্পনা করো। ` +
      `সংখ্যারেখায় ${value} আসে ${previous} এর পরে এবং ${next} এর আগে। ` +
      `${value}টি জিনিসের আরেকটি উদাহরণ বলতে পারো?`
    );
  }

  if (mode === 'banglish') {
    return (
      `${value} ekti shongkha, ja poriman ba number line-e ekti obosthan bojhay. ` +
      `Udahoron hisebe, table-e ${value}ti counter kolpona koro. ` +
      `Number line-e ${value} ashe ${previous} er pore ebong ${next} er age. ` +
      `${value}ti jinisher arekti udahoron bolte paro?`
    );
  }

  return (
    `The number ${value} represents a quantity of ${value} and a position on a number line. ` +
    `For example, imagine ${value} counters on a table. ` +
    `On the number line, ${value} comes after ${previous} and before ${next}. ` +
    `Can you name another group of ${value}?`
  );
}

function nextQuestionFor(problem, language) {
  const mode = normalizeTeachingLanguage(language);
  const { operation, left, right } = problem;

  if (operation === 'division') {
    if (mode === 'bangla') {
      return `${right} কে কোন সংখ্যা দিয়ে গুণ করলে ${left} হয়?`;
    }

    if (mode === 'banglish') {
      return `${right} ke kon shongkha diye gun korle ${left} hoy?`;
    }

    return `What number times ${right} equals ${left}?`;
  }

  if (operation === 'multiplication') {
    if (mode === 'bangla') {
      return `${left} সংখ্যাটি ${right} বার যোগ করলে মোট কত হয়?`;
    }

    if (mode === 'banglish') {
      return `${left} shongkhati ${right} bar jog korle mot koto hoy?`;
    }

    return `What total do you get by adding ${left} exactly ${right} times?`;
  }

  if (operation === 'addition') {
    if (mode === 'bangla') {
      return `${left} ও ${right} একসঙ্গে করলে মোট কত হয়?`;
    }

    if (mode === 'banglish') {
      return `${left} ebong ${right} eksathe korle mot koto hoy?`;
    }

    return `What total do you get when you combine ${left} and ${right}?`;
  }

  if (mode === 'bangla') {
    return `${left} থেকে ${right} সরালে কত থাকে?`;
  }

  if (mode === 'banglish') {
    return `${left} theke ${right} sorale koto thake?`;
  }

  return `Starting at ${left}, what remains after taking away ${right}?`;
}

function changedQuestionFor(problem, language) {
  const { operation, left, right } = problem;
  let next;

  if (operation === 'division') {
    next = {
      operation,
      left: right * 9,
      right,
    };
  } else if (operation === 'multiplication') {
    next = {
      operation,
      left,
      right: right + 1,
    };
  } else if (operation === 'addition') {
    next = {
      operation,
      left: left + 1,
      right,
    };
  } else {
    next = {
      operation,
      left: left + 2,
      right,
    };
  }

  return localizedPracticeQuestion(
    next.operation,
    next.left,
    next.right,
    language
  );
}

function localizedEvaluation(
  problem,
  studentAnswer,
  language
) {
  const mode = normalizeTeachingLanguage(language);
  const correct = Math.abs(
    studentAnswer - problem.answer
  ) < 1e-9;
  const expected = formatNumber(problem.answer);
  const received = formatNumber(studentAnswer);
  const left = formatNumber(problem.left);
  const right = formatNumber(problem.right);
  const operation = problem.operation;

  const english = {
    division:
      `${left} divided by ${right} is ${expected} because ` +
      `${right} times ${expected} equals ${left}.`,
    multiplication:
      `${left} times ${right} is ${expected}.`,
    addition:
      `${left} plus ${right} is ${expected}.`,
    subtraction:
      `${left} minus ${right} is ${expected}.`,
  };
  const bangla = {
    division:
      `${left} কে ${right} দিয়ে ভাগ করলে ${expected} হয়, ` +
      `কারণ ${right} গুণ ${expected} সমান ${left}।`,
    multiplication:
      `${left} গুণ ${right} সমান ${expected}।`,
    addition:
      `${left} যোগ ${right} সমান ${expected}।`,
    subtraction:
      `${left} থেকে ${right} বিয়োগ করলে ${expected} থাকে।`,
  };
  const banglish = {
    division:
      `${left} ke ${right} diye vag korle ${expected} hoy, ` +
      `karon ${right} gun ${expected} shoman ${left}.`,
    multiplication:
      `${left} gun ${right} shoman ${expected}.`,
    addition:
      `${left} jog ${right} shoman ${expected}.`,
    subtraction:
      `${left} theke ${right} biyog korle ${expected} thake.`,
  };

  if (mode === 'bangla') {
    return (
      `${correct ? 'সঠিক।' : `${received} সঠিক নয়।`} ` +
      `${bangla[operation]} ` +
      (
        correct
          ? changedQuestionFor(problem, language)
          : nextQuestionFor(problem, language)
      )
    );
  }

  if (mode === 'banglish') {
    return (
      `${correct ? 'Shothik.' : `${received} shothik noy.`} ` +
      `${banglish[operation]} ` +
      (
        correct
          ? changedQuestionFor(problem, language)
          : nextQuestionFor(problem, language)
      )
    );
  }

  return (
    `${correct ? 'Correct.' : 'Not yet.'} ` +
    `${english[operation]} ` +
    (
      correct
        ? changedQuestionFor(problem, language)
        : nextQuestionFor(problem, language)
    )
  );
}

function trustedResult({
  reply,
  topic,
  skill,
  nextAction,
  confidence = 1,
  runtimePolicy,
  evidenceVerified = false,
  observation = '',
}) {
  return {
    reply,
    topic,
    skill,
    misconception: '',
    nextAction,
    confidence,
    masteryDelta: 0,
    runtimeVerified: true,
    runtimePolicy,
    evidenceVerified,
    observation:
      observation === 'correct' ||
      observation === 'incorrect'
        ? observation
        : '',
  };
}

function deterministicMindRightResult(requestData) {
  const plan = requestData.pedagogyPlan || {};
  const message = cleanText(requestData.message);
  const actionKind =
    plan.decision?.teachingAction?.kind || '';

  if (
    plan.turnKind === 'practice_request' ||
    PRACTICE_REQUEST_PATTERN.test(message)
  ) {
    const operation =
      operationRequestFromText(message);

    if (operation) {
      const problem = practiceProblem(operation);
      const reply = localizedPracticeQuestion(
        operation,
        problem.left,
        problem.right,
        requestData.language
      );

      return trustedResult({
        reply,
        topic: operationLabel(operation),
        skill: `Solving a ${operation} question`,
        nextAction: 'Answer the question.',
        confidence: 1,
        runtimePolicy:
          `deterministic-${operation}-practice-v1`,
      });
    }
  }

  if (
    plan.signals?.answerAttempt &&
    plan.activeQuestion
  ) {
    const problem = parseSimpleArithmeticQuestion(
      plan.activeQuestion
    );
    const answer = parseNumericAnswer(message);

    if (problem && answer !== null) {
      const correct = Math.abs(
        answer - problem.answer
      ) < 1e-9;

      return trustedResult({
        reply: localizedEvaluation(
          problem,
          answer,
          requestData.language
        ),
        topic: operationLabel(problem.operation),
        skill: `Evaluating ${problem.operation}`,
        nextAction:
          'Solve the checking question.',
        confidence: 1,
        runtimePolicy:
          `deterministic-${problem.operation}-evaluation-v1`,
        evidenceVerified: true,
        observation:
          correct ? 'correct' : 'incorrect',
      });
    }
  }

  if (actionKind === 'build-mental-connection') {
    const numberMatch =
      NUMBER_CONCEPT_PATTERN.exec(message);

    if (numberMatch) {
      const number = Number(numberMatch[1]);

      return trustedResult({
        reply: localizedNumberConcept(
          number,
          requestData.language
        ),
        topic: `Number ${formatNumber(number)}`,
        skill:
          'Connecting quantity, example, and number position',
        nextAction:
          'Name another group with that quantity.',
        confidence: 1,
        runtimePolicy:
          'deterministic-number-concept-v1',
      });
    }
  }

  return null;
}

function hasUnsupportedPastClaim(reply, history = []) {
  const text = cleanText(reply);
  const historyText = cleanText(
    history
      .map((item) => item.text || item.content || '')
      .join(' ')
  );
  const claim =
    /\b(?:yesterday|last time|earlier you|you previously|we discussed before|in class yesterday)\b/i.exec(
      text
    );

  if (!claim) {
    return false;
  }

  return !historyText
    .toLowerCase()
    .includes(claim[0].toLowerCase());
}

function hasConcreteBridge(reply) {
  const text = cleanText(reply);

  if (!text) {
    return false;
  }

  const englishBridge =
    /\b(?:for example|such as|like|imagine|consider|suppose|take|one example(?: is)?|picture)\b/i.test(
      text
    );

  const banglishBridge =
    /\b(?:jemon|udahoron|udharon|dhoro|mone\s+koro|vabo|bhabo)\b/i.test(
      text
    );

  const banglaBridge =
    /(?:\u0989\u09A6\u09BE\u09B9\u09B0\u09A3|\u09AF\u09C7\u09AE\u09A8|\u09A7\u09B0\u09CB|\u09AE\u09A8\u09C7\s+\u0995\u09B0\u09CB|\u09AD\u09BE\u09AC\u09CB)/u.test(
      text
    );

  return (
    englishBridge ||
    banglishBridge ||
    banglaBridge
  );
}

function extractCheckingQuestion(reply) {
  const text = cleanText(reply);
  const questionMark = text.indexOf('?');

  if (questionMark < 0) {
    return '';
  }

  const beforeQuestion =
    text.slice(0, questionMark);

  const boundary =
    Math.max(
      beforeQuestion.lastIndexOf('.'),
      beforeQuestion.lastIndexOf('!'),
      beforeQuestion.lastIndexOf('\n')
    );

  return cleanText(
    text.slice(
      boundary >= 0
        ? boundary + 1
        : 0,
      questionMark + 1
    )
  );
}

function evidenceProducingConceptQuestion(reply) {
  const question =
    extractCheckingQuestion(reply);

  if (!question) {
    return false;
  }

  const englishPreference =
    /\b(?:would|do)\s+you\s+(?:like|want|prefer)\b|\b(?:shall|should)\s+i\b|\bdo\s+you\s+want\s+me\s+to\b/i.test(
      question
    );

  const banglaPreference =
    /\u09A4\u09C1\u09AE\u09BF\s+\u0995\u09BF[\s\S]{0,40}(?:\u099A\u09BE\u0993|\u099A\u09BE\u0987\u09AC\u09C7)|\u0986\u09AA\u09A8\u09BF\s+\u0995\u09BF[\s\S]{0,40}(?:\u099A\u09BE\u09A8|\u099A\u09BE\u0987\u09AC\u09C7\u09A8)/u.test(
      question
    );

  const banglishPreference =
    /\btumi\s+ki[\s\S]{0,40}\bchao\b/i.test(
      question
    );

  if (
    englishPreference ||
    banglaPreference ||
    banglishPreference
  ) {
    return false;
  }

  const englishEvidence =
    /\b(?:why|how|what|which|explain|describe|compare|predict|identify|name|solve|calculate|show|apply|reason)\b/i.test(
      question
    ) ||
    /\bcan\s+you\s+(?:explain|describe|compare|predict|identify|name|show|solve|tell)\b/i.test(
      question
    );

  const banglaEvidence =
    /(?:\u0995\u09C7\u09A8|\u0995\u09C0|\u0995\u09BF|\u0995\u09BF\u09AD\u09BE\u09AC\u09C7|\u0995\u09C0\u09AD\u09BE\u09AC\u09C7|\u09AC\u09CD\u09AF\u09BE\u0996\u09CD\u09AF\u09BE|\u09AC\u09B0\u09CD\u09A3\u09A8\u09BE|\u09A4\u09C1\u09B2\u09A8\u09BE|\u0985\u09A8\u09C1\u09AE\u09BE\u09A8|\u099A\u09BF\u09B9\u09CD\u09A8\u09BF\u09A4|\u09A8\u09BE\u09AE\s+\u09AC\u09B2|\u09A6\u09C7\u0996\u09BE\u0993|\u09B8\u09AE\u09BE\u09A7\u09BE\u09A8)/u.test(
      question
    );

  const banglishEvidence =
    /\b(?:keno|kivabe|bujhiye|bojhao|bolte\s+paro|dekhao|solve|compare|predict)\b/i.test(
      question
    );

  return (
    englishEvidence ||
    banglaEvidence ||
    banglishEvidence
  );
}

function auditMindRightReply(
  reply,
  requestData,
  history = []
) {
  const text = cleanText(reply);
  const actionKind =
    requestData.pedagogyPlan
      ?.decision?.teachingAction?.kind || '';
  const issues = [];
  const questions = questionCount(text);
  const words = wordCount(text);

  if (!text) {
    issues.push('EMPTY_RESPONSE');
  }

  if (
    hasUnsupportedPastClaim(text, history)
  ) {
    issues.push('UNSUPPORTED_PAST_CONTEXT');
  }

  if (
    /\bhow can i help you understand more\b/i.test(
      text
    )
  ) {
    issues.push('GENERIC_HELP_OFFER');
  }

  if (actionKind === 'build-mental-connection') {
    const firstQuestion =
      text.indexOf('?');
    const wordsBeforeQuestion =
      firstQuestion < 0
        ? words
        : wordCount(
            text.slice(0, firstQuestion)
          );

    if (questions !== 1) {
      issues.push(
        'CONCEPT_REQUIRES_ONE_CHECK'
      );
    }

    if (
      firstQuestion === 0 ||
      wordsBeforeQuestion < 10
    ) {
      issues.push(
        'CONCEPT_MISSING_EXPLANATION'
      );
    }

    if (!hasConcreteBridge(text)) {
      issues.push(
        'CONCEPT_MISSING_CONCRETE_BRIDGE'
      );
    }

    if (
      /\b(?:what do you already know|what do you know|how familiar are you|what comes to mind)\b/i.test(
        text
      )
    ) {
      issues.push(
        'DIAGNOSTIC_INSTEAD_OF_TEACHING'
      );
    }

    if (
      questions === 1 &&
      !evidenceProducingConceptQuestion(text)
    ) {
      issues.push(
        'CONCEPT_CHECK_NOT_EVIDENCE_PRODUCING'
      );
    }
  }

  if (
    actionKind === 'evaluate-current-thinking' &&
    !/\b(?:correct|right|partly|not yet|incorrect|mistake|close)\b/i.test(
      text
    )
  ) {
    issues.push(
      'ANSWER_NOT_EVALUATED'
    );
  }

  if (
    requestData.pedagogyPlan
      ?.turnKind === 'practice_request' &&
    questions !== 1
  ) {
    issues.push(
      'PRACTICE_REQUIRES_ONE_QUESTION'
    );
  }

  return {
    ok: issues.length === 0,
    version: RUNTIME_VERSION,
    actionKind,
    questions,
    words,
    issues,
  };
}

function mindRightRepairInstruction(
  requestData,
  audit,
  languageRepair = ''
) {
  const decision =
    requestData.pedagogyPlan?.decision || {};
  const action =
    decision.teachingAction || {};
  const issues =
    Array.isArray(audit?.issues)
      ? audit.issues
      : [];
  const targetedRepairs = [];

  if (
    issues.includes(
      'CONCEPT_MISSING_CONCRETE_BRIDGE'
    )
  ) {
    targetedRepairs.push(
      'Concrete-bridge repair: include exactly one specific, learner-friendly example before the final question.',
      'Make the example explicit instead of merely naming a fact. In English, a natural form is "For example, ..."; in another teaching language, use its natural equivalent.',
      'Immediately explain how that example demonstrates the formal idea.'
    );
  }

  if (
    action.kind ===
      'build-mental-connection'
  ) {
    targetedRepairs.push(
      'For concept teaching, end with exactly one question that requires learner evidence such as explaining, predicting, comparing, identifying, solving, or applying.',
      'Never use a preference question such as "Would you like another example?" as the learner check.'
    );
  }

  return [
    'Your previous draft was rejected by the Mind Right runtime.',
    `Selected action: ${action.kind || 'unknown'}.`,
    `Purpose: ${action.purpose || ''}`,
    `Required structure: ${JSON.stringify(
      action.requiredStructure || []
    )}`,
    `Forbidden: ${JSON.stringify(
      action.forbidden || []
    )}`,
    `Detected issues: ${JSON.stringify(
      issues
    )}`,
    ...targetedRepairs,
    'Produce a completely new response that follows the selected action.',
    'Use only the current message, verified history, and supplied evidence.',
    'Do not invent a previous lesson, class event, upload, or student statement.',
    'Ask at most one question and stop immediately after it.',
    languageRepair,
  ]
    .filter(Boolean)
    .join('\n');
}

function mindRightFallbackReply(requestData) {
  const mode = normalizeTeachingLanguage(
    requestData.language
  );
  const topic =
    requestData.pedagogyPlan?.focusTopic ||
    requestData.pedagogyPlan?.subject ||
    'this topic';

  if (mode === 'bangla') {
    return (
      'আমি উত্তরটি নিরাপদভাবে যাচাই করতে পারিনি। ' +
      'সঠিকভাবে শেখানোর জন্য পুরো প্রশ্নটি আবার লিখবে?'
    );
  }

  if (mode === 'banglish') {
    return (
      'Ami uttorti nirapod vabe jachai korte parini. ' +
      'Shothik vabe shekhanor jonno puro proshnoti abar likhbe?'
    );
  }

  return (
    `I could not verify the teaching response for ${topic}. ` +
    'Please repeat the full question so I can rebuild it accurately.'
  );
}

function applyLearningTwinPolicy(
  tutorResult,
  requestData
) {
  const source = tutorResult || {};
  const policy =
    requestData.pedagogyPlan
      ?.decision?.learningTwinPolicy || {};
  const trusted =
    source.runtimeVerified === true;
  const fallbackTopic =
    policy.topic ||
    requestData.pedagogyPlan?.focusTopic ||
    requestData.pedagogyPlan?.subject ||
    'Current learning conversation';
  const fallbackSkill =
    policy.skill ||
    'Guided reasoning';
  const fallbackNextAction =
    policy.nextAction ||
    'Respond to the tutor checking question.';
  const topic = trusted
    ? source.topic
    : fallbackTopic;
  const skill = trusted
    ? source.skill
    : fallbackSkill;
  const nextAction = trusted
    ? source.nextAction
    : fallbackNextAction;

  return {
    reply: safeLearningText(
      source.reply,
      '',
      8000
    ),
    topic: safeLearningText(
      topic,
      fallbackTopic,
      120
    ),
    skill: safeLearningText(
      skill,
      fallbackSkill,
      120
    ),
    misconception:
      trusted &&
      typeof source.misconception === 'string'
        ? safeLearningText(
            source.misconception,
            '',
            500
          )
        : '',
    nextAction: safeLearningText(
      nextAction,
      fallbackNextAction,
      500
    ),
    confidence: trusted
      ? Number(source.confidence) || 0
      : Number(policy.confidence) || 0,
    masteryDelta: 0,
    runtimeVerified: trusted,
    evidenceVerified:
      trusted &&
      source.evidenceVerified === true,
    observation:
      trusted &&
      (
        source.observation === 'correct' ||
        source.observation === 'incorrect'
      )
        ? source.observation
        : '',
  };
}

module.exports = {

  extractCheckingQuestion,  PRACTICE_REQUEST_PATTERN,
  RUNTIME_VERSION,
  applyLearningTwinPolicy,
  auditMindRightReply,
  deterministicMindRightResult,
  formatNumber,
  mindRightFallbackReply,
  mindRightRepairInstruction,
  operationRequestFromText,
  parseNumericAnswer,
  parseSimpleArithmeticQuestion,
  safeLearningText,
};
