const SUBJECT_PLAYBOOKS = Object.freeze({
  mathematics: {
    key: 'mathematics',
    label: 'Mathematics',
    method:
      'Move from meaning to representation to calculation. Use one worked step, then ask the student to perform the next step.',
    evidenceCheck:
      'Check the student’s reasoning and the final calculation separately. Never treat a confident answer as proof.',
  },
  science: {
    key: 'science',
    label: 'Science',
    method:
      'Start from an observation or prediction, build a causal model, connect it to evidence, and distinguish the model from an analogy.',
    evidenceCheck:
      'Ask the student to predict, explain a cause, interpret evidence, or identify what an experiment would show.',
  },
  language: {
    key: 'language',
    label: 'Language and Literacy',
    method:
      'Teach meaning in context, model one natural example, invite the student to produce language, and correct only the most useful error first.',
    evidenceCheck:
      'Ask the student to use the word, rule, or reading idea in a new sentence or explain the meaning in their own words.',
  },
  humanities: {
    key: 'humanities',
    label: 'Humanities and Social Studies',
    method:
      'Establish time, place, people, and context; separate fact from interpretation; then connect a claim to evidence and perspective.',
    evidenceCheck:
      'Ask the student to compare causes, order events, support a claim with evidence, or explain another perspective.',
  },
  computing: {
    key: 'computing',
    label: 'Computing and Coding',
    method:
      'Clarify the intended behavior, predict what the current code does, isolate the smallest relevant part, make one change, and test it.',
    evidenceCheck:
      'Ask the student to predict output, trace one step, explain the bug, or suggest a focused test before giving a large solution.',
  },
  creative: {
    key: 'creative',
    label: 'Creative Arts',
    method:
      'Model one technique or design choice, keep the student’s own intent central, and use constraints to support deliberate practice.',
    evidenceCheck:
      'Ask the student to describe the intended effect, choose between alternatives, or reflect on how one change affects the work.',
  },
  engineering: {
    key: 'engineering',
    label: 'Engineering and Technology',
    method:
      'Define the requirement and constraints, connect the governing principle to a model, work one design or analysis step, then test the result against the requirement.',
    evidenceCheck:
      'Ask the student to state an assumption, predict a system response, compare design tradeoffs, or verify units and boundary conditions.',
  },
  health: {
    key: 'health',
    label: 'Health and Medical Studies',
    method:
      'Connect structure to function, mechanism to evidence, and classroom concepts to carefully bounded examples. Separate educational explanation from personal medical advice.',
    evidenceCheck:
      'Ask the student to explain a mechanism, compare conditions, interpret a safe academic scenario, or identify what evidence supports a conclusion.',
  },
  business: {
    key: 'business',
    label: 'Business, Finance, and Economics',
    method:
      'Clarify the decision, stakeholders, assumptions, incentives, and numerical relationships; then compare options using an explicit framework.',
    evidenceCheck:
      'Ask the student to calculate or interpret one metric, explain a tradeoff, classify a transaction, or defend a decision with evidence.',
  },
  law: {
    key: 'law',
    label: 'Law and Legal Studies',
    method:
      'Identify the issue, rule or principle, relevant facts, competing interpretations, and reasoned application while distinguishing education from legal advice.',
    evidenceCheck:
      'Ask the student to identify the controlling issue, apply a rule to changed facts, or distinguish a conclusion from its supporting reasoning.',
  },
  general: {
    key: 'general',
    label: 'General Learning',
    method:
      'Clarify the learning goal, connect it to prior knowledge, explain one idea with a concrete example, and invite active recall.',
    evidenceCheck:
      'Ask the student to explain the idea in their own words or apply it to a small new example.',
  },
});

const GRADE_BANDS = Object.freeze({
  early_primary: {
    key: 'early_primary',
    label: 'Grades 1-3',
    guidance:
      'Use familiar concrete objects, very short sentences, and one operation or idea at a time. Check by asking the child to show, choose, count, or say the idea back without sounding babyish.',
  },
  upper_primary: {
    key: 'upper_primary',
    label: 'Grades 4-6',
    guidance:
      'Connect concrete examples to simple symbols and subject vocabulary. Keep steps visible and ask the learner to explain one relationship.',
  },
  secondary: {
    key: 'secondary',
    label: 'Grades 7-10',
    guidance:
      'Build conceptual models, introduce formal vocabulary carefully, and scaffold multi-step reasoning while leaving meaningful work to the student.',
  },
  higher_secondary: {
    key: 'higher_secondary',
    label: 'Grades 11-12',
    guidance:
      'Use precise definitions, linked representations, and exam-relevant reasoning. Ask for justification, not only a final answer.',
  },
  university: {
    key: 'university',
    label: 'University',
    guidance:
      'Use disciplinary precision, state assumptions, connect theory to method, distinguish established knowledge from interpretation, and promote independent analysis.',
  },
  general: {
    key: 'general',
    label: 'Unspecified level',
    guidance:
      'Begin with an accessible explanation, diagnose prior knowledge, and adjust vocabulary and abstraction from the student’s response.',
  },
});

const SUBJECT_PATTERNS = Object.freeze({
  mathematics: [
    /\b(math|mathematics|arithmetic|algebra|geometry|calculus|fractions?|decimals?|percentages?|equations?|integers?|probability|statistics|trigonometry|multiply|multiplication|divide|division|subtract|subtraction|addition)\b/i,
    /\b\d+\s*(?:plus|minus|times|divided by|[+×÷*=])\s*\d+\b/i,
  ],
  science: [
    /\b(science|physics|chemistry|biology|botany|zoology|ecology|anatomy|astronomy|geology|experiments?|hypotheses|atoms?|molecules?|cells?|plants?|chlorophyll|forces?|energy|respiration|photosynthesis|ecosystems?)\b/i,
  ],
  language: [
    /\b(grammar|vocabulary|spelling|sentence|paragraph|essay|reading|writing|literature|poem|poetry|novel|verb|noun|adjective|pronunciation|translation|english|bangla|bengali|language)\b/i,
  ],
  humanities: [
    /\b(history|geography|civics|government|economics|philosophy|sociology|psychology|religion|culture|civilization|war|revolution|country|continent|map|constitution)\b/i,
  ],
  computing: [
    /\b(code|coding|program|programming|software|algorithm|function|variable|loop|array|database|debug|bug|python|javascript|typescript|java|kotlin|react|html|css|computer|machine learning|artificial intelligence|data science|cybersecurity)\b/i,
  ],
  creative: [
    /\b(art|drawing|painting|design|music|rhythm|melody|theatre|drama|dance|photography|sculpture|composition)\b/i,
  ],
  engineering: [
    /\b(engineering|mechanical|electrical|electronics|civil engineering|chemical engineering|robotics|thermodynamics|fluid mechanics|statics|dynamics|circuit|control systems|manufacturing|architecture)\b/i,
  ],
  health: [
    /\b(medicine|medical|nursing|pharmacy|pharmacology|pathology|physiology|public health|nutrition|clinical|epidemiology|health education|physical education)\b/i,
  ],
  business: [
    /\b(business|accounting|finance|marketing|management|entrepreneurship|economics|microeconomics|macroeconomics|commerce|investment|debit|credit|ledger|balance sheet)\b/i,
  ],
  law: [
    /\b(law|legal|jurisprudence|contract law|criminal law|tort|statute|case law|litigation)\b/i,
  ],
});

const CONFUSION_PATTERN =
  /\b(i do not understand|i don't understand|dont understand|confused|stuck|no idea|too hard|makes no sense|what do you mean|i cannot|i can't)\b|বুঝি\s*না|পারছি\s*না/i;
const UNDERSTANDING_PATTERN =
  /\b(i understand|i got it|got it|makes sense|that is clear|now i see|understood|okay i see)\b|বুঝেছি|বুঝতে\s*পেরেছি/i;
const QUESTION_PATTERN =
  /\?|^(?:what|why|when|where|who|which|how|can|could|would|is|are|do|does|explain|teach|help)\b/i;

function clampInteger(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, Math.round(Number(value) || 0))
  );
}

function gradeBandFor(grade) {
  const text = String(grade || '').trim().toLowerCase();

  if (
    /\b(university|undergraduate|postgraduate|graduate|college|bachelor|master|phd|doctoral)\b/.test(
      text
    )
  ) {
    return GRADE_BANDS.university;
  }

  const match = text.match(/\b(?:grade|class|year)?\s*(\d{1,2})\b/);
  const numericGrade = match
    ? Number.parseInt(match[1], 10)
    : Number.NaN;

  if (numericGrade >= 1 && numericGrade <= 3) {
    return GRADE_BANDS.early_primary;
  }

  if (numericGrade >= 4 && numericGrade <= 6) {
    return GRADE_BANDS.upper_primary;
  }

  if (numericGrade >= 7 && numericGrade <= 10) {
    return GRADE_BANDS.secondary;
  }

  if (numericGrade >= 11 && numericGrade <= 12) {
    return GRADE_BANDS.higher_secondary;
  }

  return GRADE_BANDS.general;
}

function combinedConversationText(message, history) {
  return [
    String(message || ''),
    ...history
      .slice(-6)
      .reverse()
      .map((item) => String(item.text || item.content || '')),
  ].join('\n');
}

function subjectKeyFromLabel(label) {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `subject:${slug || 'general'}`;
}

function detectSubject(message, history = [], explicitSubject = 'Auto') {
  const explicit = String(explicitSubject || '').trim();
  const explicitText = explicit.toLowerCase();

  if (explicit && !['auto', 'general', 'general learning'].includes(explicitText)) {
    for (const [key, patterns] of Object.entries(SUBJECT_PATTERNS)) {
      if (
        patterns.some((pattern) => pattern.test(explicit)) ||
        explicitText === key
      ) {
        return {
          ...SUBJECT_PLAYBOOKS[key],
          key: subjectKeyFromLabel(explicit),
          family: key,
          label: explicit.slice(0, 80),
        };
      }
    }

    return {
      ...SUBJECT_PLAYBOOKS.general,
      key: subjectKeyFromLabel(explicit),
      family: 'general',
      label: explicit.slice(0, 80),
    };
  }

  const currentText = String(message || '');
  const allText = combinedConversationText(message, history);
  let bestKey = 'general';
  let bestScore = 0;

  for (const [key, patterns] of Object.entries(SUBJECT_PATTERNS)) {
    const score = patterns.reduce((total, pattern) => {
      const currentMatch = pattern.test(currentText) ? 3 : 0;
      const contextMatch = pattern.test(allText) ? 1 : 0;
      return total + currentMatch + contextMatch;
    }, 0);

    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
    }
  }

  return SUBJECT_PLAYBOOKS[bestKey];
}

const EXPLICIT_LEARNING_REQUEST_PATTERN =
  /\b(explain|teach|show me|tell me about|what is|what does|how does|how do|why|define|help me|learn about|meaning of)\b/i;
const PRACTICE_REQUEST_PATTERN =
  /\b(?:give|ask|show)\s+me\b[\s\S]{0,80}\b(?:question|problem|exercise)\b|\bquiz\s+me\b|\bpractice\b[\s\S]{0,80}\b(?:question|problem|exercise)\b/i;

function focusTopicFor(
  message,
  activeQuestion,
  subject
) {
  const text = String(
    activeQuestion || message || ''
  );

  const topics = [
    ['Division', /\b(?:division|divide|divided|quotient)\b|÷|\//i],
    ['Multiplication', /\b(?:multiplication|multiply|times|product)\b|×|\*/i],
    ['Addition', /\b(?:addition|add|plus|sum)\b|\+/i],
    ['Subtraction', /\b(?:subtraction|subtract|minus|difference)\b/i],
    ['Fractions', /\bfractions?\b/i],
    ['Algebra', /\balgebra|equations?\b/i],
    ['Place Value', /\bplace\s+value\b/i],
  ];

  for (const [label, pattern] of topics) {
    if (pattern.test(text)) {
      return label;
    }
  }

  const numberMatch = text.match(
    /\bnumber\s+([+-]?\d+(?:\.\d+)?)\b/i
  );

  if (numberMatch) {
    return `Number ${numberMatch[1]}`;
  }

  return subject?.label || 'General learning';
}

function messageText(message) {
  return String(
    message?.text ||
    message?.content ||
    ''
  ).trim();
}

function lastConversationMessage(history = []) {
  return history.length > 0
    ? history[history.length - 1]
    : null;
}

function activeTutorQuestion(history = []) {
  const latest = lastConversationMessage(history);

  if (!latest || latest.role !== 'tutor') {
    return '';
  }

  const text = messageText(latest);

  return /\?\s*$/u.test(text)
    ? text
    : '';
}

function isAmbiguousShortMessage(message) {
  const cleanMessage = String(message || '').trim();

  if (
    !cleanMessage ||
    cleanMessage.length > 32 ||
    QUESTION_PATTERN.test(cleanMessage) ||
    EXPLICIT_LEARNING_REQUEST_PATTERN.test(cleanMessage)
  ) {
    return false;
  }

  if (
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*[/:]\s*\d+(?:\.\d+)?)?$/u.test(
      cleanMessage
    )
  ) {
    return true;
  }

  const words = cleanMessage
    .split(/\s+/u)
    .filter(Boolean);

  return words.length <= 2;
}

function isExplicitConfusionMessage(message) {
  const text = String(message || '')
    .normalize('NFKC')
    .replace(/\u0000/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const compact = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

  return (
    CONFUSION_PATTERN.test(text) ||
    /\b(?:i\s+)?(?:still\s+)?(?:do\s+not|don't|dont|cannot|can't|cant)\s+understand(?:\b|(?=the\b))/i.test(
      text
    ) ||
    /^(?:i)?(?:still)?(?:donot|dont|cannot|cant)understand(?:the|this|that|it|why|how|what|number|concept|topic|idea|lesson|example|problem|question|$)/iu.test(
      compact
    )
  );
}

function detectTurnKind(
  message,
  history = [],
  { hasVerifiedMaterial = false } = {}
) {
  const cleanMessage = String(message || '').trim();

  if (
    isExplicitConfusionMessage(
      cleanMessage
    )
  ) {
    return 'confusion';
  }

  if (UNDERSTANDING_PATTERN.test(cleanMessage)) {
    return 'confirmation';
  }

  if (
    PRACTICE_REQUEST_PATTERN.test(
      cleanMessage
    )
  ) {
    return 'practice_request';
  }

  if (
    EXPLICIT_LEARNING_REQUEST_PATTERN.test(
      cleanMessage
    )
  ) {
    return history.length === 0
      ? 'new_topic'
      : 'question';
  }

  const activeQuestion =
    activeTutorQuestion(history);

  if (
    activeQuestion &&
    cleanMessage.length <= 500 &&
    !QUESTION_PATTERN.test(cleanMessage)
  ) {
    return 'answer';
  }

  if (
    hasVerifiedMaterial &&
    isAmbiguousShortMessage(cleanMessage)
  ) {
    return 'material_answer';
  }

  if (isAmbiguousShortMessage(cleanMessage)) {
    return 'clarification';
  }

  if (history.length === 0) {
    return 'new_topic';
  }

  if (QUESTION_PATTERN.test(cleanMessage)) {
    return 'question';
  }

  return 'continuation';
}

function selectRelevantMemory(learnerProfile, subjectKey) {
  const profile = learnerProfile || {};
  const subject =
    Array.isArray(profile.subjects)
      ? profile.subjects.find(
          (item) => item.subjectKey === subjectKey
        )
      : undefined;
  const misconceptions =
    Array.isArray(profile.activeMisconceptions)
      ? profile.activeMisconceptions
          .filter(
            (item) => item.subjectKey === subjectKey
          )
          .slice(0, 3)
      : [];

  return {
    totalTutorTurns: Number(profile.totalTurns) || 0,
    subject: subject || null,
    activeMisconceptions: misconceptions,
  };
}

function lessonStateFor(turnKind, relevantMemory) {
  if (turnKind === 'confusion') {
    return 'scaffold';
  }

  if (turnKind === 'confirmation') {
    return 'teach_back';
  }

  if (turnKind === 'clarification') {
    return 'clarify_context';
  }

  if (turnKind === 'practice_request') {
    return 'guided_practice';
  }

  if (
    turnKind === 'answer' ||
    turnKind === 'material_answer'
  ) {
    return 'feedback';
  }

  if (!relevantMemory.subject) {
    return 'prior_knowledge_check';
  }

  if (turnKind === 'question' || turnKind === 'new_topic') {
    return 'explanation';
  }

  return 'guided_practice';
}

function teachingMoveFor(lessonState) {
  const moves = {
    clarify_context:
      'Ask one short question to learn what the message refers to. Do not infer a topic, answer, upload, or misconception.',
    prior_knowledge_check:
      'Ask one easy diagnostic question before assuming the student’s level.',
    explanation:
      'Explain one essential idea with one concrete example, then check the idea.',
    scaffold:
      'Reduce the step size, name the exact point of difficulty, offer one hint or analogy, then ask an easier question.',
    feedback:
      'Evaluate the student’s exact answer first. Confirm what is sound, correct only the smallest error, and ask for the next step.',
    teach_back:
      'Do not accept a yes alone as mastery. Ask the student to explain or apply the idea in a small new case.',
    guided_practice:
      'Let the student do the cognitive work. Give the minimum useful support and ask for one next action.',
  };

  return moves[lessonState];
}

function createTutorPlan({
  requestData,
  history = [],
  learnerProfile,
  sessionAdaptation,
}) {
  const verifiedMaterialContext = Boolean(
    requestData.materialContext?.verified === true &&
    Array.isArray(
      requestData.materialContext?.materialIds
    ) &&
    requestData.materialContext.materialIds.length > 0
  );
  const subject = detectSubject(
    requestData.message,
    history,
    requestData.subject
  );
  const turnKind = detectTurnKind(
    requestData.message,
    history,
    {
      hasVerifiedMaterial:
        verifiedMaterialContext,
    }
  );
  const activeQuestion =
    activeTutorQuestion(history);
  const focusTopic = focusTopicFor(
    requestData.message,
    turnKind === 'answer'
      ? activeQuestion
      : '',
    subject
  );
  const relevantMemory = selectRelevantMemory(
    learnerProfile,
    subject.key
  );
  const lessonState = lessonStateFor(
    turnKind,
    relevantMemory
  );
  const previousSupport =
    Number(relevantMemory.subject?.supportLevel) || 0;
  const supportAdjustment =
    turnKind === 'confusion'
      ? 1
      : turnKind === 'confirmation'
        ? -1
        : 0;
  const gradeBand = gradeBandFor(
    requestData.grade
  );

  return {
    subjectKey: subject.key,
    subjectFamily:
      subject.family || subject.key,
    subject: subject.label,
    focusTopic,
    turnKind,
    lessonState,
    activeQuestion,
    needsClarification:
      turnKind === 'clarification',
    verifiedMaterialContext,
    teachingMove: teachingMoveFor(lessonState),
    subjectMethod: subject.method,
    evidenceCheck: subject.evidenceCheck,
    gradeBand: gradeBand.key,
    gradeGuidance: gradeBand.guidance,
    supportLevel: clampInteger(
      previousSupport + supportAdjustment,
      0,
      3
    ),
    signals: {
      confusion: turnKind === 'confusion',
      understandingClaim: turnKind === 'confirmation',
      answerAttempt:
        turnKind === 'answer' ||
        turnKind === 'material_answer',
      needsClarification:
        turnKind === 'clarification',
      practiceRequest:
        turnKind === 'practice_request',
    },
    relevantMemory,
    sessionAdaptation: sessionAdaptation || null,
  };
}

module.exports = {
  GRADE_BANDS,
  SUBJECT_PLAYBOOKS,
  activeTutorQuestion,
  createTutorPlan,
  detectSubject,
  detectTurnKind,
  gradeBandFor,
  focusTopicFor,
  isAmbiguousShortMessage,
  PRACTICE_REQUEST_PATTERN,
  selectRelevantMemory,
};
