const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditReflectiveReply,
  createReflectiveTeachingState,
} = require('../src/reflection/engine');

function plan() {
  return {
    subjectKey: 'subject:mathematics',
    subjectFamily: 'mathematics',
    subject: 'Mathematics',
    focusTopic: 'Number 5',
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
        lastTopic: 'Number 5',
      },
      activeMisconceptions: [],
    },
  };
}

function history() {
  return [
    {
      role: 'student',
      text: 'Explain the number 5.',
    },
    {
      role: 'tutor',
      text:
        'The number 5 represents a quantity of 5 and a position on a number line. For example, imagine 5 counters on a table. On the number line, 5 comes after 4 and before 6. Can you name another group of 5?',
      metadata: {
        learningTwin: {
          topic: 'Number 5',
          skill:
            'Building a mental connection',
        },
        reflection: {
          selectedRepresentation:
            'visual-spatial',
        },
      },
    },
  ];
}

function requestWithReflection() {
  const pedagogyPlan = plan();
  const reflection =
    createReflectiveTeachingState({
      requestData: {
        message:
          'I still do not understand the number 5.',
      },
      history: history(),
      pedagogyPlan,
    });

  return {
    reflection,
    requestData: {
      message:
        'I still do not understand the number 5.',
      language: 'English',
      pedagogyPlan: {
        ...pedagogyPlan,
        reflection,
      },
      reflection,
    },
  };
}

test(
  'exact mobile recovery response demonstrates the selected worked step',
  () => {
    const {
      reflection,
      requestData,
    } = requestWithReflection();

    assert.equal(
      reflection.previousStep
        .representation,
      'visual-spatial'
    );
    assert.equal(
      reflection.decision
        .selectedRepresentation,
      'worked-step'
    );

    const audit =
      auditReflectiveReply(
        (
          "Okay, let's start with something simple. " +
          'Do you know what comes right after the number 4?'
        ),
        requestData,
        history()
      );

    assert.equal(audit.ok, true);
    assert.equal(
      audit.usedRepresentation,
      'worked-step'
    );
    assert.deepEqual(
      audit.issues,
      []
    );
  }
);

test(
  'required reflection rejects a response with no demonstrable representation',
  () => {
    const {
      requestData,
    } = requestWithReflection();

    const audit =
      auditReflectiveReply(
        'Let us make it easier. What do you think?',
        requestData,
        history()
      );

    assert.equal(audit.ok, false);
    assert.ok(
      audit.issues.includes(
        'REFLECTION_REPRESENTATION_NOT_DEMONSTRATED'
      )
    );
  }
);

test(
  'generic make wording is not misclassified as production practice',
  () => {
    const {
      requestData,
    } = requestWithReflection();

    const audit =
      auditReflectiveReply(
        'Let us make it easier. What do you think?',
        requestData,
        history()
      );

    assert.equal(
      audit.usedRepresentation,
      'unclassified'
    );
    assert.ok(
      audit.issues.includes(
        'REFLECTION_REPRESENTATION_NOT_DEMONSTRATED'
      )
    );
    assert.ok(
      !audit.issues.includes(
        'REFLECTION_SELECTED_STRATEGY_NOT_USED'
      )
    );
  }
);
