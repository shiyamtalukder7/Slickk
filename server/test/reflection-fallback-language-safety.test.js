const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditReflectiveReply,
  reflectiveFallbackReply,
} = require('../src/reflection/engine');

const INTERNAL_LABELS = [
  'concrete-example',
  'visual-spatial',
  'worked-step',
  'verbal-rule',
  'observation',
  'causal-model',
  'analogy',
  'context-example',
  'contrast-example',
  'production-practice',
  'symbolic-step',
  'internal-secret-route',
];

const LANGUAGES = [
  'English',
  'Bangla',
  'Banglish',
];

function requestData(
  language,
  selectedRepresentation
) {
  return {
    language,
    subject: 'Mathematics',
    pedagogyPlan: {
      focusTopic: 'Number 5',
      masteryProbability: 0.42,
    },
    reflection: {
      topic: 'Number 5',
      previousStep: {
        representation:
          'visual-spatial',
      },
      decision: {
        mustChangeRepresentation: true,
        selectedRepresentation,
      },
      evidencePolicy: {
        descriptiveOnly: true,
        mayChangeMastery: false,
        mayCreateMisconception: false,
      },
    },
  };
}

test(
  'reflective fallback hides every internal representation label in all supported languages',
  () => {
    for (const language of LANGUAGES) {
      for (
        const label of INTERNAL_LABELS
      ) {
        const input =
          requestData(language, label);
        const before =
          structuredClone(input);
        const reply =
          reflectiveFallbackReply(input);

        assert.ok(reply);
        assert.equal(
          (
            reply.match(/\?/gu) || []
          ).length,
          1
        );
        assert.equal(
          reply
            .toLowerCase()
            .includes(
              label.toLowerCase()
            ),
          false,
          `${language} leaked ${label}`
        );
        assert.doesNotMatch(
          reply,
          /REFLECTIVE_TEACHING_DATA|selectedRepresentation|change-representation-and-reduce-step/iu
        );
        assert.deepEqual(
          input,
          before
        );
        assert.equal(
          input.pedagogyPlan
            .masteryProbability,
          0.42
        );
        assert.equal(
          input.reflection
            .evidencePolicy
            .mayChangeMastery,
          false
        );
        assert.equal(
          input.reflection
            .evidencePolicy
            .mayCreateMisconception,
          false
        );

        if (language === 'Bangla') {
          assert.match(
            reply,
            /[\u0980-\u09FF]/u
          );
        } else {
          assert.doesNotMatch(
            reply,
            /[\u0980-\u09FF]/u
          );
        }
      }
    }
  }
);

test(
  'reflection audit rejects unmistakable internal control tokens',
  () => {
    const input =
      requestData(
        'English',
        'visual-spatial'
      );
    const audit =
      auditReflectiveReply(
        (
          'I selected visual-spatial from ' +
          'REFLECTIVE_TEACHING_DATA. ' +
          'Where should five go?'
        ),
        input,
        [
          {
            role: 'tutor',
            text:
              'Five counters show the quantity. What do you notice?',
          },
        ]
      );

    assert.equal(audit.ok, false);
    assert.ok(
      audit.issues.includes(
        'REFLECTION_INTERNAL_CONTROL_LEAK'
      )
    );
  }
);
