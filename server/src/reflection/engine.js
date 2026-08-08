const {
  selectBoundedRepresentation,
} = require('../outcomes/memory');
const {
  createBoundedRevalidationProbe,
} = require('../revalidation/probe');

const REFLECTION_VERSION =
  'reflective-teaching-v1';

const REPRESENTATION_ORDER = Object.freeze({
  mathematics: [
    'concrete-example',
    'visual-spatial',
    'worked-step',
    'verbal-rule',
  ],
  science: [
    'observation',
    'causal-model',
    'analogy',
    'worked-step',
  ],
  language: [
    'context-example',
    'contrast-example',
    'production-practice',
    'verbal-rule',
  ],
  general: [
    'concrete-example',
    'visual-spatial',
    'analogy',
    'worked-step',
  ],
});

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function boundedInteger(
  value,
  minimum,
  maximum,
  fallback = minimum
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(minimum, Math.round(number))
  );
}

function messageRole(message = {}) {
  return cleanText(message.role).toLowerCase();
}

function lastTutorMessage(history = []) {
  for (
    let index = history.length - 1;
    index >= 0;
    index -= 1
  ) {
    const item = history[index] || {};
    const role = messageRole(item);

    if (
      role === 'tutor' ||
      role === 'assistant'
    ) {
      return item;
    }
  }

  return null;
}

function representationSignals(kind) {
  const signals = {
    'concrete-example':
      /\b(?:objects?|counters?|cand(?:y|ies)|apples?|blocks?|coins?|pizza|share|groups?|pieces?)\b/i,
    'visual-spatial':
      /\b(?:number line|diagram|picture|draw|table|grid|graph|place|position|visuali[sz]e)\b/i,
    'worked-step':
      /\b(?:step|first|next|then|calculate|work through|solve|equals?|start with|begin with|right after|right before|comes after|comes before|one at a time)\b/i,
    'verbal-rule':
      /\b(?:means|definition|rule|in words|we call|is defined as)\b/i,
    observation:
      /\b(?:observe|notice|look at|measure|evidence|experiment|what happens)\b/i,
    'causal-model':
      /\b(?:because|causes?|therefore|leads to|mechanism|so that)\b/i,
    analogy:
      /\b(?:like|similar to|as if|analogy|imagine)\b/i,
    'context-example':
      /\b(?:sentence|story|conversation|context)\b/i,
    'contrast-example':
      /\b(?:compare|contrast|instead|but|difference|correct and incorrect)\b/i,
    'production-practice':
      /\b(?:write|say|produce)\b(?:\s+(?:a|an|your|one))?\s+(?:word|phrase|sentence|example|answer)\b|\b(?:make|create|use)\b[\s\S]{0,24}\b(?:sentence|phrase|example|answer)\b|\bin your own words?\b/i,
  };

  return signals[kind] || null;
}

function inferRepresentation(
  value,
  metadata = {}
) {
  const stored =
    cleanText(
      metadata?.reflection
        ?.selectedRepresentation ||
      metadata?.reflection
        ?.usedRepresentation
    );

  if (stored) {
    return stored;
  }

  const text = cleanText(value);
  const ordered = [
    'visual-spatial',
    'worked-step',
    'causal-model',
    'contrast-example',
    'production-practice',
    'concrete-example',
    'context-example',
    'analogy',
    'verbal-rule',
    'observation',
  ];

  for (const kind of ordered) {
    const pattern = representationSignals(kind);

    if (pattern && pattern.test(text)) {
      return kind;
    }
  }

  return 'unclassified';
}

function representationSequence(subjectFamily) {
  const key =
    cleanText(subjectFamily).toLowerCase();

  return (
    REPRESENTATION_ORDER[key] ||
    REPRESENTATION_ORDER.general
  );
}

function representationChoice(
  subjectFamily,
  previousRepresentation,
  outcomeMemory = []
) {
  const sequence =
    representationSequence(subjectFamily);
  const previousIndex =
    sequence.indexOf(previousRepresentation);
  const fallback =
    previousIndex < 0
      ? sequence[0]
      : sequence[
          (previousIndex + 1) %
            sequence.length
        ];

  return selectBoundedRepresentation({
    candidates: sequence,
    previousRepresentation,
    memory: outcomeMemory,
    fallback,
    minimumDecisiveEvidence: 2,
    minimumEffectivenessRate: 0.67,
  });
}

function nextRepresentation(
  subjectFamily,
  previousRepresentation,
  outcomeMemory = []
) {
  return representationChoice(
    subjectFamily,
    previousRepresentation,
    outcomeMemory
  ).representation;
}

function topicFromMessage(message = {}) {
  return cleanText(
    message?.metadata?.learningTwin?.topic ||
    message?.metadata?.reflection?.topic
  );
}

function sameTopic(
  currentTopic,
  previousTopic
) {
  const current =
    cleanText(currentTopic).toLowerCase();
  const previous =
    cleanText(previousTopic).toLowerCase();

  return Boolean(
    current &&
    previous &&
    (
      current === previous ||
      current.includes(previous) ||
      previous.includes(current)
    )
  );
}

function tokenSet(value) {
  return new Set(
    cleanText(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/u)
      .filter((token) => token.length > 2)
  );
}

function jaccardSimilarity(left, right) {
  const first = tokenSet(left);
  const second = tokenSet(right);

  if (
    first.size === 0 ||
    second.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (const token of first) {
    if (second.has(token)) {
      intersection += 1;
    }
  }

  const union =
    first.size + second.size - intersection;

  return union > 0
    ? intersection / union
    : 0;
}

function createReflectiveTeachingState({
  requestData = {},
  history = [],
  learnerProfile = {},
  pedagogyPlan =
    requestData.pedagogyPlan || {},
  outcomeMemory =
    learnerProfile?.teachingOutcomes || [],
} = {}) {
  const plan = pedagogyPlan || {};
  const previousTutor =
    lastTutorMessage(history);
  const previousReply =
    cleanText(
      previousTutor?.text ||
      previousTutor?.content
    );
  const previousMetadata =
    previousTutor?.metadata || {};
  const previousTopic =
    topicFromMessage(previousTutor);
  const currentTopic =
    cleanText(
      plan.focusTopic ||
      plan.subject ||
      plan.relevantMemory?.subject
        ?.lastTopic
    ) || 'Current learning conversation';
  const confusion =
    plan.signals?.confusion === true ||
    plan.turnKind === 'confusion';
  const answerAttempt =
    plan.signals?.answerAttempt === true &&
    Boolean(cleanText(plan.activeQuestion));
  const topicContinuation =
    previousReply
      ? (
          sameTopic(
            currentTopic,
            previousTopic
          ) ||
          !previousTopic
        )
      : false;
  const previousRepresentation =
    previousReply
      ? inferRepresentation(
          previousReply,
          previousMetadata
        )
      : 'none';
  const previousAction =
    cleanText(
      previousMetadata?.tutorDecision
        ?.teachingAction?.kind ||
      previousMetadata?.reflection
        ?.selectedStrategy ||
      previousMetadata?.learningTwin?.skill
    ) || 'unknown';
  const repeatedDifficulty =
    confusion &&
    Boolean(previousReply) &&
    topicContinuation;
  const mustChangeRepresentation =
    repeatedDifficulty;
  const representationPreference =
    mustChangeRepresentation
      ? representationChoice(
          plan.subjectFamily,
          previousRepresentation,
          outcomeMemory
        )
      : {
          representation: '',
          usedMemory: false,
          descriptiveOnly: true,
          reason:
            'no-strategy-change-required',
          evidence: null,
        };
  const revalidationProbe =
    createBoundedRevalidationProbe({
      representationPreference,
      candidates:
        representationSequence(
          plan.subjectFamily
        ),
      previousRepresentation,
      history,
      topic: currentTopic,
      previousTutorMessageId:
        cleanText(previousTutor?.id),
    });
  const selectedRepresentation =
    revalidationProbe.active
      ? revalidationProbe
          .selectedRepresentation
      : representationPreference
          .representation;
  const supportLevel =
    boundedInteger(
      plan.supportLevel,
      0,
      3,
      0
    );
  const adjustedSupportLevel =
    mustChangeRepresentation
      ? Math.min(3, supportLevel + 1)
      : supportLevel;
  const outcome =
    answerAttempt
      ? 'current-answer-awaits-evaluation'
      : repeatedDifficulty
        ? 'previous-step-not-yet-effective'
        : confusion
          ? 'difficulty-reported-without-comparable-prior-step'
          : plan.signals?.understandingClaim
            ? 'understanding-claim-awaits-evidence'
            : 'effect-not-yet-observed';

  return {
    version: REFLECTION_VERSION,
    system: 'Slickk Reflective Teaching',
    topic: currentTopic,
    outcome,
    currentSignal: {
      confusion,
      answerAttempt,
      understandingClaim:
        plan.signals
          ?.understandingClaim === true,
    },
    previousStep: {
      available: Boolean(previousReply),
      topic: previousTopic,
      action: previousAction,
      representation:
        previousRepresentation,
      verifiedTutorTurn:
        Boolean(previousTutor),
      messageId:
        cleanText(previousTutor?.id),
      revalidationProbe:
        previousMetadata
          ?.reflection
          ?.revalidationProbe ||
        null,
    },
    revalidationProbe,
    outcomeMemory: {
      descriptiveOnly: true,
      observationCount:
        Array.isArray(outcomeMemory)
          ? outcomeMemory.reduce(
              (total, item) =>
                total +
                Math.max(
                  0,
                  Number(
                    item?.totalObservations
                  ) || 0
                ),
              0
            )
          : 0,
      usedForSelection:
        representationPreference
          .usedMemory === true,
      revalidationRequired:
        representationPreference
          .revalidationRequired === true,
      revalidationVersion:
        representationPreference
          .revalidationVersion || '',
      selectionReason:
        representationPreference.reason,
      evidence:
        representationPreference.evidence,
    },
    decision: {
      mustChangeRepresentation,
      selectedRepresentation,
      selectedStrategy:
        revalidationProbe.active
          ? 'bounded-strategy-revalidation-probe'
          : revalidationProbe.exhausted
            ? 'revalidation-probe-budget-exhausted'
            : mustChangeRepresentation
              ? 'change-representation-and-reduce-step'
              : 'continue-current-authoritative-plan',
      supportLevel:
        adjustedSupportLevel,
      maximumTeachingActions: 1,
      askAtMostOneQuestion: true,
    },
    evidencePolicy: {
      descriptiveOnly: true,
      mayChangeMastery: false,
      mayCreateMisconception: false,
      learnerPerformanceRequiresVerifiedAnswer:
        true,
    },
    persistence: {
      storeWithTutorMessage: true,
      countAsAssessmentEvidence: false,
    },
  };
}

function applyReflectiveTeachingPlan(
  pedagogyPlan = {},
  reflection = {}
) {
  const revalidationProbe =
    reflection?.revalidationProbe ||
    null;

  if (
    reflection?.decision
      ?.mustChangeRepresentation !== true
  ) {
    return {
      ...pedagogyPlan,
      revalidationProbe,
      reflection,
    };
  }

  const selected =
    cleanText(
      reflection.decision
        .selectedRepresentation
    );
  const probeTeachingMove =
    revalidationProbe?.active === true
      ? (
          'Run exactly one bounded strategy revalidation step. ' +
          `Use only ${selected || 'one alternative representation'}, ` +
          'teach one very small idea, ask one low-stakes ' +
          'evidence-producing question, then stop and wait. ' +
          'Probe delivery alone is not learner evidence.'
        )
      : revalidationProbe
          ?.exhausted === true
        ? (
            'The bounded strategy revalidation budget is exhausted. ' +
            'Do not repeat another internal probe. Use one smallest ' +
            'foundation-reset step, ask one low-stakes question, ' +
            'then stop and wait.'
          )
        : (
            'The previous teaching step did not resolve the difficulty. ' +
            `Change to ${selected || 'a different representation'}, ` +
            'reduce the step size, preserve the learning objective, ' +
            'and ask one very small evidence-producing question.'
          );

  return {
    ...pedagogyPlan,
    lessonState: 'scaffold',
    supportLevel:
      boundedInteger(
        reflection.decision.supportLevel,
        0,
        3,
        pedagogyPlan.supportLevel || 0
      ),
    teachingMove:
      probeTeachingMove,
    revalidationProbe,
    reflection,
  };
}

function auditReflectiveReply(
  reply,
  requestData = {},
  history = []
) {
  const reflection =
    requestData.reflection ||
    requestData.pedagogyPlan?.reflection ||
    {};
  const mustChange =
    reflection?.decision
      ?.mustChangeRepresentation === true;
  const issues = [];
  const previousTutor =
    lastTutorMessage(history);
  const previousReply =
    cleanText(
      previousTutor?.text ||
      previousTutor?.content
    );
  const text = cleanText(reply);

  if (
    mustChange &&
    containsInternalReflectionControl(text)
  ) {
    issues.push(
      'REFLECTION_INTERNAL_CONTROL_LEAK'
    );
  }

  const previousRepresentation =
    cleanText(
      reflection?.previousStep
        ?.representation
    );
  const selectedRepresentation =
    cleanText(
      reflection?.decision
        ?.selectedRepresentation
    );
  const similarity =
    previousReply
      ? jaccardSimilarity(
          previousReply,
          text
        )
      : 0;
  const usedRepresentation =
    inferRepresentation(text);

  if (mustChange) {
    if (!text) {
      issues.push(
        'REFLECTION_EMPTY_RESPONSE'
      );
    }

    if (
      previousReply &&
      similarity >= 0.72
    ) {
      issues.push(
        'REFLECTION_REPEATED_RESPONSE'
      );
    }

    if (
      previousRepresentation &&
      previousRepresentation !==
        'unclassified' &&
      usedRepresentation ===
        previousRepresentation
    ) {
      issues.push(
        'REFLECTION_REPEATED_REPRESENTATION'
      );
    }

    if (selectedRepresentation) {
      if (
        usedRepresentation ===
          'unclassified'
      ) {
        issues.push(
          'REFLECTION_REPRESENTATION_NOT_DEMONSTRATED'
        );
      } else if (
        usedRepresentation !==
          selectedRepresentation
      ) {
        issues.push(
          'REFLECTION_SELECTED_STRATEGY_NOT_USED'
        );
      }
    }
  }

  return {
    ok: issues.length === 0,
    version: REFLECTION_VERSION,
    required: mustChange,
    previousRepresentation,
    selectedRepresentation,
    usedRepresentation,
    similarity:
      Number(similarity.toFixed(3)),
    issues,
  };
}

function reflectionRepairInstruction(
  requestData = {},
  audit = {}
) {
  const reflection =
    requestData.reflection ||
    requestData.pedagogyPlan?.reflection ||
    {};

  if (
    reflection?.decision
      ?.mustChangeRepresentation !== true
  ) {
    return '';
  }

  return [
    'REFLECTIVE TEACHING REPAIR:',
    'The student remained confused after the previous teaching step.',
    `Previous representation: ${reflection.previousStep?.representation || 'unknown'}.`,
    `Required new representation: ${reflection.decision?.selectedRepresentation || 'a clearly different representation'}.`,
    `Detected reflection issues: ${JSON.stringify(audit?.issues || [])}.`,
    'Do not repeat the previous wording, example, question, or representation.',
    'Demonstrate the selected representation in the learner-facing reply; do not merely name or announce it.',
    'Reduce the step size, keep the same learning objective, ask at most one very small checking question, and stop.',
  ].join('\n');
}

const LEARNER_FACING_REPRESENTATIONS =
  Object.freeze({
    English: Object.freeze({
      'concrete-example':
        'a small everyday example',
      'visual-spatial':
        'a simple number line or diagram',
      'worked-step':
        'one short worked step',
      'verbal-rule':
        'one short rule in plain words',
      observation:
        'one thing to notice',
      'causal-model':
        'a simple cause-and-effect explanation',
      analogy:
        'a simple comparison',
      'context-example':
        'a short real-world situation',
      'contrast-example':
        'two small contrasting examples',
      'production-practice':
        'one small practice task',
      'symbolic-step':
        'one short calculation',
      fallback:
        'a new simple approach',
    }),
    Bangla: Object.freeze({
      'concrete-example':
        'একটি ছোট দৈনন্দিন উদাহরণ',
      'visual-spatial':
        'একটি সহজ সংখ্যা রেখা বা চিত্র',
      'worked-step':
        'একটি ছোট করে দেখানো ধাপ',
      'verbal-rule':
        'সহজ ভাষায় একটি ছোট নিয়ম',
      observation:
        'খেয়াল করার মতো একটি বিষয়',
      'causal-model':
        'সহজ কারণ ও ফলের ব্যাখ্যা',
      analogy:
        'একটি সহজ তুলনা',
      'context-example':
        'বাস্তব জীবনের একটি ছোট পরিস্থিতি',
      'contrast-example':
        'দুটি ছোট বিপরীত উদাহরণ',
      'production-practice':
        'একটি ছোট অনুশীলনের কাজ',
      'symbolic-step':
        'একটি ছোট হিসাবের ধাপ',
      fallback:
        'একটি নতুন সহজ পদ্ধতি',
    }),
    Banglish: Object.freeze({
      'concrete-example':
        'ekti chhoto doinondin udahoron',
      'visual-spatial':
        'ekti shohoj number line ba chobi',
      'worked-step':
        'ekti chhoto kore dekhano step',
      'verbal-rule':
        'shohoj bhashay ekti chhoto niyom',
      observation:
        'kheyal korar moto ekti bishoy',
      'causal-model':
        'shohoj karon o foler byakhya',
      analogy:
        'ekti shohoj tulona',
      'context-example':
        'bastob jiboner ekti chhoto poristhiti',
      'contrast-example':
        'duiti chhoto biporit udahoron',
      'production-practice':
        'ekti chhoto onushiloner kaj',
      'symbolic-step':
        'ekti chhoto hisaber step',
      fallback:
        'ekti notun shohoj poddhoti',
    }),
  });

const INTERNAL_REFLECTION_CONTROL_PATTERN =
  /REFLECTIVE_TEACHING_DATA|selectedRepresentation|previousRepresentation|change-representation-and-reduce-step|\b(?:concrete-example|visual-spatial|worked-step|verbal-rule|causal-model|context-example|contrast-example|production-practice|symbolic-step)\b/iu;

function reflectionLanguage(language) {
  const value =
    cleanText(language).toLowerCase();

  if (value.includes('banglish')) {
    return 'Banglish';
  }

  if (value.includes('bangla')) {
    return 'Bangla';
  }

  return 'English';
}

function learnerFacingRepresentation(
  representation,
  language
) {
  const languageKey =
    reflectionLanguage(language);
  const labels =
    LEARNER_FACING_REPRESENTATIONS[
      languageKey
    ];
  const key =
    cleanText(representation);

  return labels[key] || labels.fallback;
}

function containsInternalReflectionControl(
  reply
) {
  return INTERNAL_REFLECTION_CONTROL_PATTERN
    .test(cleanText(reply));
}

function numberTopicValue(topic) {
  const match = cleanText(topic).match(
    /\bnumber\s+(-?\d{1,6})\b/iu
  );
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isSafeInteger(value)
    ? value
    : null;
}

function countingSequence(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 10
  ) {
    return '';
  }

  return Array.from(
    { length: value },
    (_, index) => index + 1
  ).join(', ');
}

function demonstratedNumberReply({
  value,
  representation,
  language,
}) {
  const previous = value - 1;
  const sequence = countingSequence(value);
  const selected = cleanText(representation);

  if (language === 'Bangla') {
    const replies = {
      'concrete-example':
        sequence
          ? `${value}টি ছোট কাউন্টার এক সারিতে রাখো: ${sequence}। পুরো সারিটি ${value} বোঝায়। এখানে কয়টি কাউন্টার আছে?`
          : `${value}টি ছোট জিনিসের একটি দল ভাবো। দলটিতে মোট কয়টি জিনিস আছে?`,
      'visual-spatial':
        `একটি সংখ্যা রেখায় ${previous} থেকে এক ধাপ সামনে গেলে ${value}-এ পৌঁছাই। কোন সংখ্যায় পৌঁছালে?`,
      'worked-step':
        `${previous} থেকে শুরু করি এবং ১ যোগ করি: ${previous} + 1 = ${value}। ${previous}-এর পরের সংখ্যা কত?`,
      'verbal-rule':
        `সহজ ভাষায়, ${value} হলো ${previous}-এর চেয়ে এক বেশি। ${previous}-এর চেয়ে এক বেশি কত?`,
      observation:
        sequence
          ? `গুনে দেখো: ${sequence}। শেষে কোন সংখ্যাটি বললে?`
          : `${previous}-এর পরের সংখ্যাটি খেয়াল করো। সেটি কত?`,
      'causal-model':
        `${previous}টি জিনিসের সঙ্গে আর ১টি যোগ করলে মোট ${value} হয়, কারণ মোট সংখ্যা এক বাড়ে। নতুন মোট কত?`,
      analogy:
        `ভাবো একটি বাক্সে ঠিক ${value}টি টিকিট আছে; বাক্সের ${value} লেখা সংখ্যাটি মোট টিকিট বোঝায়। বাক্সে কয়টি টিকিট আছে?`,
      'context-example':
        `একটি ছোট গল্প: একটি ব্যাগে ${value}টি মার্বেল আছে। ব্যাগে মোট কয়টি মার্বেল আছে?`,
      'contrast-example':
        `${previous}টি কাউন্টার আর ${value}টি কাউন্টার তুলনা করো; দ্বিতীয় দলে একটি বেশি। কোন দলটি ${value} বোঝায়?`,
      'production-practice':
        `${value}টি ছোট জিনিস দিয়ে একটি দল বানাও। তোমার দলে কয়টি জিনিস থাকা উচিত?`,
      'symbolic-step':
        `${previous} + 1 = ${value}। ${previous} + 1 কত?`,
    };
    return replies[selected] ||
      `${previous}-এর সঙ্গে ১ যোগ করলে ${value} হয়। তাহলে ${previous}-এর পরের সংখ্যা কত?`;
  }

  if (language === 'Banglish') {
    const replies = {
      'concrete-example':
        sequence
          ? `${value}ti chhoto counter ek line-e rakho: ${sequence}. Puro line-ti ${value} bojhay. Ekhane koyti counter ache?`
          : `${value}ti chhoto jinis-er ekti group bhabo. Group-e mot koyti jinis ache?`,
      'visual-spatial':
        `Ekti number line-e ${previous} theke ek step shamne gele ${value}-e pouchhai. Kon number-e pouchhale?`,
      'worked-step':
        `${previous} theke shuru kori ebong 1 jog kori: ${previous} + 1 = ${value}. ${previous}-er porer number koto?`,
      'verbal-rule':
        `Shohoj bhashay, ${value} holo ${previous}-er cheye ek beshi. ${previous}-er cheye ek beshi koto?`,
      observation:
        sequence
          ? `Gune dekho: ${sequence}. Sheshe kon number-ti bolle?`
          : `${previous}-er porer number-ti kheyal koro. Seti koto?`,
      'causal-model':
        `${previous}ti jinis-er shathe aro 1ti jog korle mot ${value} hoy, karon total ek bare. Notun total koto?`,
      analogy:
        `Bhabo ekti box-e thik ${value}ti ticket ache; box-er ${value} label-ti mot ticket bojhay. Box-e koyti ticket ache?`,
      'context-example':
        `Ekti chhoto golpo: ekti bag-e ${value}ti marble ache. Bag-e mot koyti marble ache?`,
      'contrast-example':
        `${previous}ti counter ar ${value}ti counter tulona koro; ditiyo group-e ekti beshi. Kon group-ti ${value} bojhay?`,
      'production-practice':
        `${value}ti chhoto jinis diye ekti group banao. Tomar group-e koyti jinis thaka uchit?`,
      'symbolic-step':
        `${previous} + 1 = ${value}. ${previous} + 1 koto?`,
    };
    return replies[selected] ||
      `${previous}-er shathe 1 jog korle ${value} hoy. Tahole ${previous}-er porer number koto?`;
  }

  const replies = {
    'concrete-example':
      sequence
        ? `Put ${value} small counters in one row: ${sequence}. The whole row shows ${value}. How many counters are there?`
        : `Make one group containing ${value} small objects. How many objects are in the group?`,
    'visual-spatial':
      `Picture a number line and move one step from ${previous} to ${value}. Which number did you reach?`,
    'worked-step':
      `Start at ${previous} and add one: ${previous} + 1 = ${value}. What number comes after ${previous}?`,
    'verbal-rule':
      `In plain words, ${value} means one more than ${previous}. What is one more than ${previous}?`,
    observation:
      sequence
        ? `Count this sequence: ${sequence}. Which number did you say last?`
        : `Notice the number immediately after ${previous}. Which number is it?`,
    'causal-model':
      `Adding one object to ${previous} objects makes ${value}, because the total increases by one. What is the new total?`,
    analogy:
      `Think of a box holding exactly ${value} tickets; the label ${value} tells the total inside. How many tickets are in the box?`,
    'context-example':
      `Here is a short story: a bag contains ${value} marbles. How many marbles are in the bag?`,
    'contrast-example':
      `Compare ${previous} counters with ${value} counters; the second group has one more. Which group shows ${value}?`,
    'production-practice':
      `Make a group of ${value} small objects. How many objects should be in your group?`,
    'symbolic-step':
      `${previous} + 1 = ${value}. What is ${previous} + 1?`,
  };

  return replies[selected] ||
    `Add one to ${previous} to get ${value}. What number comes after ${previous}?`;
}

function demonstratedGeneralReply({
  topic,
  representation,
  language,
}) {
  const selected = cleanText(representation);
  const safeTopic = cleanText(topic) || 'this idea';

  if (language === 'Bangla') {
    const replies = {
      'concrete-example':
        `${safeTopic} নিয়ে একটি বাস্তব উদাহরণ ধরো এবং ধারণাটির সঙ্গে একটি বাস্তব বস্তু বা ঘটনা মিলাও। প্রথম সংযোগটি কী?`,
      'visual-spatial':
        `${safeTopic}-এর একটি ছোট চিত্র আঁকো: মূল ধারণাটি মাঝখানে, একটি সম্পর্কিত অংশ পাশে। কোন অংশটি আগে যুক্ত হবে?`,
      'worked-step':
        `${safeTopic} এক ধাপে করি: সবচেয়ে ছোট জানা অংশটি আলাদা করি। সেই অংশটি কী?`,
      'verbal-rule':
        `${safeTopic} সহজ ভাষায় বলি: আগে শুধু মূল অর্থটি ধরো। মূল অর্থটি কী?`,
      observation:
        `${safeTopic}-এ কী বদলায় আর কী একই থাকে তা খেয়াল করো। প্রথমে কোনটি চোখে পড়ে?`,
      'causal-model':
        `${safeTopic}-এর একটি ছোট কারণ → পরিবর্তন → ফল শৃঙ্খল ধরো। প্রথম কারণটি কী?`,
      analogy:
        `${safeTopic}-কে পরিচিত কোনো সহজ জিনিসের সঙ্গে তুলনা করো। কোন পরিচিত জিনিসটি সবচেয়ে কাছাকাছি?`,
      'context-example':
        `${safeTopic} ব্যবহার হয় এমন একটি ছোট দৈনন্দিন পরিস্থিতি ভাবো। প্রথম ঘটনাটি কী?`,
      'contrast-example':
        `${safeTopic}-এর একটি সঠিক আর একটি ভুল ছোট উদাহরণ পাশাপাশি রাখো। মূল পার্থক্যটি কী?`,
      'production-practice':
        `${safeTopic} নিয়ে নিজের একটি খুব ছোট উদাহরণ তৈরি করো। তোমার উদাহরণটি কী?`,
      'symbolic-step':
        `${safeTopic}-এর প্রথম চিহ্ন বা সূত্রের ধাপটি এক লাইনে লেখো। প্রথম অংশটি কী?`,
    };
    return replies[selected] ||
      `${safeTopic}-এর সবচেয়ে ছোট জানা অংশটি আলাদা করি। সেই অংশটি কী?`;
  }

  if (language === 'Banglish') {
    const replies = {
      'concrete-example':
        `${safeTopic} niye ekti real example dhoro ebong idea-r shathe ekti real object ba event milao. Prothom connection-ti ki?`,
      'visual-spatial':
        `${safeTopic}-er ekti chhoto chobi ako: main idea majhkhane, ekti related part pashe. Kon part-ti age jukto hobe?`,
      'worked-step':
        `${safeTopic} ek step-e kori: shobcheye chhoto jana part-ti alada kori. Shei part-ti ki?`,
      'verbal-rule':
        `${safeTopic} shohoj bhashay boli: age shudhu main meaning-ti dhoro. Main meaning-ti ki?`,
      observation:
        `${safeTopic}-e ki bodlay ar ki eki thake ta kheyal koro. Prothome konti chokhe pore?`,
      'causal-model':
        `${safeTopic}-er ekti chhoto cause → change → result chain dhoro. Prothom cause-ti ki?`,
      analogy:
        `${safeTopic}-ke porichito ekti shohoj jinisher shathe tulona koro. Kon jinis-ti shobcheye kachakachi?`,
      'context-example':
        `${safeTopic} use hoy emon ekti chhoto everyday situation bhabo. Prothom event-ti ki?`,
      'contrast-example':
        `${safeTopic}-er ekti correct ar ekti wrong example pasapashi rakho. Main difference-ti ki?`,
      'production-practice':
        `${safeTopic} niye nijer ekti khub chhoto example banao. Tomar example-ti ki?`,
      'symbolic-step':
        `${safeTopic}-er prothom sign ba formula step-ti ek line-e lekho. Prothom part-ti ki?`,
    };
    return replies[selected] ||
      `${safeTopic}-er shobcheye chhoto jana part-ti alada kori. Shei part-ti ki?`;
  }

  const replies = {
    'concrete-example':
      `Use one real case for ${safeTopic} and connect the idea to one real object or event. What is the first connection?`,
    'visual-spatial':
      `Draw a tiny map for ${safeTopic}: put the main idea in the middle and one related part beside it. Which part should connect first?`,
    'worked-step':
      `Take one step with ${safeTopic}: isolate only the smallest part you already know. What is that small part?`,
    'verbal-rule':
      `Say ${safeTopic} in plain words and keep only its main meaning. What is the main meaning?`,
    observation:
      `Notice what changes and what stays the same in ${safeTopic}. Which feature do you notice first?`,
    'causal-model':
      `Build one short chain for ${safeTopic}: cause → change → result. What is the first cause?`,
    analogy:
      `Compare ${safeTopic} with one familiar thing whose parts work similarly. Which familiar thing is the closest match?`,
    'context-example':
      `Place ${safeTopic} in one short everyday situation where the idea is used. What happens first?`,
    'contrast-example':
      `Put one correct and one incorrect small case of ${safeTopic} side by side. What is the key difference?`,
    'production-practice':
      `Create one very small example of ${safeTopic} yourself. What is your example?`,
    'symbolic-step':
      `Write the first symbol or formula step for ${safeTopic} on one line. What is the first part?`,
  };

  return replies[selected] ||
    `Isolate the smallest known part of ${safeTopic}. What is that part?`;
}

function demonstratedRepresentationReply(
  requestData = {},
  reflection = {}
) {
  const topic =
    cleanText(
      reflection.topic ||
      requestData.pedagogyPlan?.focusTopic ||
      requestData.subject
    ) || 'this idea';
  const representation =
    cleanText(
      reflection.decision?.selectedRepresentation
    );
  const language =
    reflectionLanguage(requestData.language);
  const numberValue =
    numberTopicValue(topic);

  return numberValue !== null
    ? demonstratedNumberReply({
        value: numberValue,
        representation,
        language,
      })
    : demonstratedGeneralReply({
        topic,
        representation,
        language,
      });
}

function numberTopicValue(topic) {
  const match = cleanText(topic).match(
    /\bnumber\s+(-?\d{1,6})\b/iu
  );
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isSafeInteger(value)
    ? value
    : null;
}

function countingSequence(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 10
  ) {
    return '';
  }

  return Array.from(
    { length: value },
    (_, index) => index + 1
  ).join(', ');
}

function demonstratedNumberReply({
  value,
  representation,
  language,
}) {
  const previous = value - 1;
  const sequence = countingSequence(value);
  const selected = cleanText(representation);

  if (language === 'Bangla') {
    const replies = {
      'concrete-example':
        sequence
          ? `${value}টি ছোট কাউন্টার এক সারিতে রাখো: ${sequence}। পুরো সারিটি ${value} বোঝায়। এখানে কয়টি কাউন্টার আছে?`
          : `${value}টি ছোট জিনিসের একটি দল ভাবো। দলটিতে মোট কয়টি জিনিস আছে?`,
      'visual-spatial':
        `একটি সংখ্যা রেখায় ${previous} থেকে এক ধাপ সামনে গেলে ${value}-এ পৌঁছাই। কোন সংখ্যায় পৌঁছালে?`,
      'worked-step':
        `${previous} থেকে শুরু করি এবং ১ যোগ করি: ${previous} + 1 = ${value}। ${previous}-এর পরের সংখ্যা কত?`,
      'verbal-rule':
        `সহজ ভাষায়, ${value} হলো ${previous}-এর চেয়ে এক বেশি। ${previous}-এর চেয়ে এক বেশি কত?`,
      observation:
        sequence
          ? `গুনে দেখো: ${sequence}। শেষে কোন সংখ্যাটি বললে?`
          : `${previous}-এর পরের সংখ্যাটি খেয়াল করো। সেটি কত?`,
      'causal-model':
        `${previous}টি জিনিসের সঙ্গে আর ১টি যোগ করলে মোট ${value} হয়, কারণ মোট সংখ্যা এক বাড়ে। নতুন মোট কত?`,
      analogy:
        `ভাবো একটি বাক্সে ঠিক ${value}টি টিকিট আছে; বাক্সের ${value} লেখা সংখ্যাটি মোট টিকিট বোঝায়। বাক্সে কয়টি টিকিট আছে?`,
      'context-example':
        `একটি ছোট গল্প: একটি ব্যাগে ${value}টি মার্বেল আছে। ব্যাগে মোট কয়টি মার্বেল আছে?`,
      'contrast-example':
        `${previous}টি কাউন্টার আর ${value}টি কাউন্টার তুলনা করো; দ্বিতীয় দলে একটি বেশি। কোন দলটি ${value} বোঝায়?`,
      'production-practice':
        `${value}টি ছোট জিনিস দিয়ে একটি দল বানাও। তোমার দলে কয়টি জিনিস থাকা উচিত?`,
      'symbolic-step':
        `${previous} + 1 = ${value}। ${previous} + 1 কত?`,
    };
    return replies[selected] ||
      `${previous}-এর সঙ্গে ১ যোগ করলে ${value} হয়। তাহলে ${previous}-এর পরের সংখ্যা কত?`;
  }

  if (language === 'Banglish') {
    const replies = {
      'concrete-example':
        sequence
          ? `${value}ti chhoto counter ek line-e rakho: ${sequence}. Puro line-ti ${value} bojhay. Ekhane koyti counter ache?`
          : `${value}ti chhoto jinis-er ekti group bhabo. Group-e mot koyti jinis ache?`,
      'visual-spatial':
        `Ekti number line-e ${previous} theke ek step shamne gele ${value}-e pouchhai. Kon number-e pouchhale?`,
      'worked-step':
        `${previous} theke shuru kori ebong 1 jog kori: ${previous} + 1 = ${value}. ${previous}-er porer number koto?`,
      'verbal-rule':
        `Shohoj bhashay, ${value} holo ${previous}-er cheye ek beshi. ${previous}-er cheye ek beshi koto?`,
      observation:
        sequence
          ? `Gune dekho: ${sequence}. Sheshe kon number-ti bolle?`
          : `${previous}-er porer number-ti kheyal koro. Seti koto?`,
      'causal-model':
        `${previous}ti jinis-er shathe aro 1ti jog korle mot ${value} hoy, karon total ek bare. Notun total koto?`,
      analogy:
        `Bhabo ekti box-e thik ${value}ti ticket ache; box-er ${value} label-ti mot ticket bojhay. Box-e koyti ticket ache?`,
      'context-example':
        `Ekti chhoto golpo: ekti bag-e ${value}ti marble ache. Bag-e mot koyti marble ache?`,
      'contrast-example':
        `${previous}ti counter ar ${value}ti counter tulona koro; ditiyo group-e ekti beshi. Kon group-ti ${value} bojhay?`,
      'production-practice':
        `${value}ti chhoto jinis diye ekti group banao. Tomar group-e koyti jinis thaka uchit?`,
      'symbolic-step':
        `${previous} + 1 = ${value}. ${previous} + 1 koto?`,
    };
    return replies[selected] ||
      `${previous}-er shathe 1 jog korle ${value} hoy. Tahole ${previous}-er porer number koto?`;
  }

  const replies = {
    'concrete-example':
      sequence
        ? `Put ${value} small counters in one row: ${sequence}. The whole row shows ${value}. How many counters are there?`
        : `Make one group containing ${value} small objects. How many objects are in the group?`,
    'visual-spatial':
      `Picture a number line and move one step from ${previous} to ${value}. Which number did you reach?`,
    'worked-step':
      `Start at ${previous} and add one: ${previous} + 1 = ${value}. What number comes after ${previous}?`,
    'verbal-rule':
      `In plain words, ${value} means one more than ${previous}. What is one more than ${previous}?`,
    observation:
      sequence
        ? `Count this sequence: ${sequence}. Which number did you say last?`
        : `Notice the number immediately after ${previous}. Which number is it?`,
    'causal-model':
      `Adding one object to ${previous} objects makes ${value}, because the total increases by one. What is the new total?`,
    analogy:
      `Think of a box holding exactly ${value} tickets; the label ${value} tells the total inside. How many tickets are in the box?`,
    'context-example':
      `Here is a short story: a bag contains ${value} marbles. How many marbles are in the bag?`,
    'contrast-example':
      `Compare ${previous} counters with ${value} counters; the second group has one more. Which group shows ${value}?`,
    'production-practice':
      `Make a group of ${value} small objects. How many objects should be in your group?`,
    'symbolic-step':
      `${previous} + 1 = ${value}. What is ${previous} + 1?`,
  };

  return replies[selected] ||
    `Add one to ${previous} to get ${value}. What number comes after ${previous}?`;
}

function demonstratedGeneralReply({
  topic,
  representation,
  language,
}) {
  const selected = cleanText(representation);
  const safeTopic = cleanText(topic) || 'this idea';

  if (language === 'Bangla') {
    const replies = {
      'concrete-example':
        `${safeTopic} নিয়ে একটি বাস্তব উদাহরণ ধরো এবং ধারণাটির সঙ্গে একটি বাস্তব বস্তু বা ঘটনা মিলাও। প্রথম সংযোগটি কী?`,
      'visual-spatial':
        `${safeTopic}-এর একটি ছোট চিত্র আঁকো: মূল ধারণাটি মাঝখানে, একটি সম্পর্কিত অংশ পাশে। কোন অংশটি আগে যুক্ত হবে?`,
      'worked-step':
        `${safeTopic} এক ধাপে করি: সবচেয়ে ছোট জানা অংশটি আলাদা করি। সেই অংশটি কী?`,
      'verbal-rule':
        `${safeTopic} সহজ ভাষায় বলি: আগে শুধু মূল অর্থটি ধরো। মূল অর্থটি কী?`,
      observation:
        `${safeTopic}-এ কী বদলায় আর কী একই থাকে তা খেয়াল করো। প্রথমে কোনটি চোখে পড়ে?`,
      'causal-model':
        `${safeTopic}-এর একটি ছোট কারণ → পরিবর্তন → ফল শৃঙ্খল ধরো। প্রথম কারণটি কী?`,
      analogy:
        `${safeTopic}-কে পরিচিত কোনো সহজ জিনিসের সঙ্গে তুলনা করো। কোন পরিচিত জিনিসটি সবচেয়ে কাছাকাছি?`,
      'context-example':
        `${safeTopic} ব্যবহার হয় এমন একটি ছোট দৈনন্দিন পরিস্থিতি ভাবো। প্রথম ঘটনাটি কী?`,
      'contrast-example':
        `${safeTopic}-এর একটি সঠিক আর একটি ভুল ছোট উদাহরণ পাশাপাশি রাখো। মূল পার্থক্যটি কী?`,
      'production-practice':
        `${safeTopic} নিয়ে নিজের একটি খুব ছোট উদাহরণ তৈরি করো। তোমার উদাহরণটি কী?`,
      'symbolic-step':
        `${safeTopic}-এর প্রথম চিহ্ন বা সূত্রের ধাপটি এক লাইনে লেখো। প্রথম অংশটি কী?`,
    };
    return replies[selected] ||
      `${safeTopic}-এর সবচেয়ে ছোট জানা অংশটি আলাদা করি। সেই অংশটি কী?`;
  }

  if (language === 'Banglish') {
    const replies = {
      'concrete-example':
        `${safeTopic} niye ekti real example dhoro ebong idea-r shathe ekti real object ba event milao. Prothom connection-ti ki?`,
      'visual-spatial':
        `${safeTopic}-er ekti chhoto chobi ako: main idea majhkhane, ekti related part pashe. Kon part-ti age jukto hobe?`,
      'worked-step':
        `${safeTopic} ek step-e kori: shobcheye chhoto jana part-ti alada kori. Shei part-ti ki?`,
      'verbal-rule':
        `${safeTopic} shohoj bhashay boli: age shudhu main meaning-ti dhoro. Main meaning-ti ki?`,
      observation:
        `${safeTopic}-e ki bodlay ar ki eki thake ta kheyal koro. Prothome konti chokhe pore?`,
      'causal-model':
        `${safeTopic}-er ekti chhoto cause → change → result chain dhoro. Prothom cause-ti ki?`,
      analogy:
        `${safeTopic}-ke porichito ekti shohoj jinisher shathe tulona koro. Kon jinis-ti shobcheye kachakachi?`,
      'context-example':
        `${safeTopic} use hoy emon ekti chhoto everyday situation bhabo. Prothom event-ti ki?`,
      'contrast-example':
        `${safeTopic}-er ekti correct ar ekti wrong example pasapashi rakho. Main difference-ti ki?`,
      'production-practice':
        `${safeTopic} niye nijer ekti khub chhoto example banao. Tomar example-ti ki?`,
      'symbolic-step':
        `${safeTopic}-er prothom sign ba formula step-ti ek line-e lekho. Prothom part-ti ki?`,
    };
    return replies[selected] ||
      `${safeTopic}-er shobcheye chhoto jana part-ti alada kori. Shei part-ti ki?`;
  }

  const replies = {
    'concrete-example':
      `Use one real case for ${safeTopic} and connect the idea to one real object or event. What is the first connection?`,
    'visual-spatial':
      `Draw a tiny map for ${safeTopic}: put the main idea in the middle and one related part beside it. Which part should connect first?`,
    'worked-step':
      `Take one step with ${safeTopic}: isolate only the smallest part you already know. What is that small part?`,
    'verbal-rule':
      `Say ${safeTopic} in plain words and keep only its main meaning. What is the main meaning?`,
    observation:
      `Notice what changes and what stays the same in ${safeTopic}. Which feature do you notice first?`,
    'causal-model':
      `Build one short chain for ${safeTopic}: cause → change → result. What is the first cause?`,
    analogy:
      `Compare ${safeTopic} with one familiar thing whose parts work similarly. Which familiar thing is the closest match?`,
    'context-example':
      `Place ${safeTopic} in one short everyday situation where the idea is used. What happens first?`,
    'contrast-example':
      `Put one correct and one incorrect small case of ${safeTopic} side by side. What is the key difference?`,
    'production-practice':
      `Create one very small example of ${safeTopic} yourself. What is your example?`,
    'symbolic-step':
      `Write the first symbol or formula step for ${safeTopic} on one line. What is the first part?`,
  };

  return replies[selected] ||
    `Isolate the smallest known part of ${safeTopic}. What is that part?`;
}

function demonstratedRepresentationReply(
  requestData = {},
  reflection = {}
) {
  const topic =
    cleanText(
      reflection.topic ||
      requestData.pedagogyPlan?.focusTopic ||
      requestData.subject
    ) || 'this idea';
  const representation =
    cleanText(
      reflection.decision?.selectedRepresentation
    );
  const language =
    reflectionLanguage(requestData.language);
  const numberValue =
    numberTopicValue(topic);

  return numberValue !== null
    ? demonstratedNumberReply({
        value: numberValue,
        representation,
        language,
      })
    : demonstratedGeneralReply({
        topic,
        representation,
        language,
      });
}

function reflectiveFallbackReply(
  requestData = {}
) {
  const reflection =
    requestData.reflection ||
    requestData.pedagogyPlan?.reflection ||
    {};

  if (
    reflection?.decision
      ?.mustChangeRepresentation !== true
  ) {
    return '';
  }

  return demonstratedRepresentationReply(
    requestData,
    reflection
  );
}

module.exports = {
  REFLECTION_VERSION,
  applyReflectiveTeachingPlan,
  auditReflectiveReply,
  createReflectiveTeachingState,
  inferRepresentation,
  jaccardSimilarity,
  lastTutorMessage,
  nextRepresentation,
  representationChoice,
  reflectionRepairInstruction,
  reflectiveFallbackReply,
};
