const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditReflectiveReply,
  reflectiveFallbackReply,
} = require('../src/reflection/engine');

const INTERNAL_LABELS =
  /bounded-revalidation-probe|revalidationProbe|selectedRepresentation|concrete-example|visual-spatial|worked-step|verbal-rule|causal-model|context-example|contrast-example|production-practice|symbolic-step/iu;

function request({
  representation = 'concrete-example',
  language = 'English',
  topic = 'Number 7',
} = {}) {
  return {
    language,
    reflection: {
      topic,
      previousStep: {
        representation: 'visual-spatial',
      },
      decision: {
        mustChangeRepresentation: true,
        selectedRepresentation: representation,
        selectedStrategy:
          'bounded-strategy-revalidation-probe',
        maximumTeachingActions: 1,
        askAtMostOneQuestion: true,
      },
      revalidationProbe: {
        active: true,
        version:
          'bounded-revalidation-probe-v1',
        attemptId: 'probe-test-one',
      },
    },
    pedagogyPlan: {
      focusTopic: topic,
    },
  };
}

test(
  'number probe demonstrates a concrete example instead of announcing it',
  () => {
    const input = request();
    const reply =
      reflectiveFallbackReply(input);

    assert.match(
      reply,
      /7 small counters/i
    );
    assert.match(
      reply,
      /1, 2, 3, 4, 5, 6, 7/u
    );
    assert.doesNotMatch(
      reply,
      /\bwe will use\b/i
    );
    assert.doesNotMatch(
      reply,
      INTERNAL_LABELS
    );
    assert.equal(
      (reply.match(/\?/gu) || []).length,
      1
    );

    const audit =
      auditReflectiveReply(
        reply,
        input,
        [
          {
            role: 'tutor',
            text:
              'Picture 7 on a number line.',
          },
        ]
      );

    assert.equal(audit.ok, true);
    assert.equal(
      audit.usedRepresentation,
      'concrete-example'
    );
  }
);

test(
  'number probe demonstrates one worked step',
  () => {
    const reply =
      reflectiveFallbackReply(
        request({
          representation: 'worked-step',
        })
      );

    assert.match(
      reply,
      /6 \+ 1 = 7/u
    );
    assert.match(
      reply,
      /What number comes after 6\?/i
    );
    assert.equal(
      (reply.match(/\?/gu) || []).length,
      1
    );
  }
);

test(
  'Bangla number probe demonstrates safely',
  () => {
    const reply =
      reflectiveFallbackReply(
        request({
          language: 'Bangla',
        })
      );

    assert.match(reply, /কাউন্টার/u);
    assert.match(
      reply,
      /1, 2, 3, 4, 5, 6, 7/u
    );
    assert.doesNotMatch(
      reply,
      INTERNAL_LABELS
    );
    assert.equal(
      (reply.match(/\?/gu) || []).length,
      1
    );
  }
);

test(
  'Banglish number probe demonstrates safely',
  () => {
    const reply =
      reflectiveFallbackReply(
        request({
          language: 'Banglish',
          representation: 'visual-spatial',
        })
      );

    assert.match(reply, /number line/i);
    assert.match(
      reply,
      /6 theke ek step/i
    );
    assert.doesNotMatch(
      reply,
      INTERNAL_LABELS
    );
    assert.equal(
      (reply.match(/\?/gu) || []).length,
      1
    );
  }
);

test(
  'general-topic fallback performs one visible action',
  () => {
    const reply =
      reflectiveFallbackReply(
        request({
          topic: 'Fractions',
          representation:
            'contrast-example',
        })
      );

    assert.match(
      reply,
      /one correct and one incorrect/i
    );
    assert.match(reply, /Fractions/i);
    assert.doesNotMatch(
      reply,
      /\bwe will use\b/i
    );
    assert.equal(
      (reply.match(/\?/gu) || []).length,
      1
    );
  }
);
