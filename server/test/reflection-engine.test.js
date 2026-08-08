const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyReflectiveTeachingPlan,
  auditReflectiveReply,
  createReflectiveTeachingState,
  reflectiveFallbackReply,
} = require('../src/reflection/engine');

function confusionPlan() {
  return {
    subjectKey: 'subject:mathematics',
    subjectFamily: 'mathematics',
    subject: 'Mathematics',
    focusTopic: 'Fractions',
    turnKind: 'confusion',
    lessonState: 'scaffold',
    supportLevel: 1,
    activeQuestion: '',
    signals: {
      confusion: true,
      understandingClaim: false,
      answerAttempt: false,
      needsClarification: false,
      practiceRequest: false,
    },
    relevantMemory: {
      subject: {
        lastTopic: 'Fractions',
      },
      activeMisconceptions: [],
    },
  };
}

function history() {
  return [
    {
      role: 'student',
      text: 'Explain fractions.',
    },
    {
      role: 'tutor',
      text:
        'For example, imagine sharing one pizza equally among four friends. What fraction does each friend receive?',
      metadata: {
        learningTwin: {
          topic: 'Fractions',
          skill:
            'Building a mental connection',
        },
        tutorDecision: {
          teachingAction: {
            kind:
              'build-mental-connection',
          },
        },
        reflection: {
          selectedRepresentation:
            'concrete-example',
        },
      },
    },
  ];
}

test(
  'repeated confusion changes representation and increases support',
  () => {
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand.',
        },
        history: history(),
        learnerProfile: {},
        pedagogyPlan:
          confusionPlan(),
      });

    assert.equal(
      reflection.outcome,
      'previous-step-not-yet-effective'
    );
    assert.equal(
      reflection.decision
        .mustChangeRepresentation,
      true
    );
    assert.equal(
      reflection.previousStep
        .representation,
      'concrete-example'
    );
    assert.equal(
      reflection.decision
        .selectedRepresentation,
      'visual-spatial'
    );
    assert.equal(
      reflection.decision.supportLevel,
      2
    );
    assert.equal(
      reflection.evidencePolicy
        .mayChangeMastery,
      false
    );
  }
);

test(
  'reflective plan preserves objective and changes only the teaching route',
  () => {
    const base = confusionPlan();
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand.',
        },
        history: history(),
        pedagogyPlan: base,
      });
    const adapted =
      applyReflectiveTeachingPlan(
        base,
        reflection
      );

    assert.equal(
      adapted.focusTopic,
      'Fractions'
    );
    assert.equal(
      adapted.lessonState,
      'scaffold'
    );
    assert.equal(
      adapted.supportLevel,
      2
    );
    assert.match(
      adapted.teachingMove,
      /visual-spatial/i
    );
  }
);

test(
  'answer attempts are not treated as failed teaching evidence',
  () => {
    const plan = {
      ...confusionPlan(),
      turnKind: 'answer',
      activeQuestion:
        'What is one half of eight?',
      signals: {
        ...confusionPlan().signals,
        confusion: false,
        answerAttempt: true,
      },
    };
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message: '4',
        },
        history: history(),
        pedagogyPlan: plan,
      });

    assert.equal(
      reflection.outcome,
      'current-answer-awaits-evaluation'
    );
    assert.equal(
      reflection.decision
        .mustChangeRepresentation,
      false
    );
  }
);

test(
  'reflection audit rejects repeated wording and representation',
  () => {
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand.',
        },
        history: history(),
        pedagogyPlan:
          confusionPlan(),
      });
    const requestData = {
      message:
        'I still do not understand.',
      language: 'English',
      pedagogyPlan: {
        ...confusionPlan(),
        reflection,
      },
      reflection,
    };
    const audit =
      auditReflectiveReply(
        history()[1].text,
        requestData,
        history()
      );

    assert.equal(audit.ok, false);
    assert.ok(
      audit.issues.includes(
        'REFLECTION_REPEATED_RESPONSE'
      )
    );
    assert.ok(
      audit.issues.includes(
        'REFLECTION_REPEATED_REPRESENTATION'
      )
    );
  }
);

test(
  'reflection audit accepts a changed visual representation',
  () => {
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand.',
        },
        history: history(),
        pedagogyPlan:
          confusionPlan(),
      });
    const requestData = {
      message:
        'I still do not understand.',
      language: 'English',
      pedagogyPlan: {
        ...confusionPlan(),
        reflection,
      },
      reflection,
    };
    const audit =
      auditReflectiveReply(
        'Draw a number line from zero to one and mark the halfway position. Where would one half go?',
        requestData,
        history()
      );

    assert.equal(audit.ok, true);
    assert.equal(
      audit.usedRepresentation,
      'visual-spatial'
    );
  }
);

test(
  'reflective fallback changes route without changing mastery',
  () => {
    const reflection =
      createReflectiveTeachingState({
        requestData: {
          message:
            'I still do not understand.',
        },
        history: history(),
        pedagogyPlan:
          confusionPlan(),
      });
    const reply =
      reflectiveFallbackReply({
        language: 'English',
        subject: 'Mathematics',
        pedagogyPlan: {
          ...confusionPlan(),
          reflection,
        },
        reflection,
      });

    assert.match(reply, /Draw a tiny map for Fractions/i);
    assert.match(reply, /Which part should connect first\?/i);
    assert.doesNotMatch(reply, /will not repeat it unchanged/i);
    assert.doesNotMatch(
      reply,
      /visual-spatial/i
    );
    assert.match(
      reply,
      /tiny map|main idea in the middle/i
    );
    assert.equal(
      (reply.match(/\?/g) || []).length,
      1
    );
  }
);
