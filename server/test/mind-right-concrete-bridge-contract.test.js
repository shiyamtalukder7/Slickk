const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditMindRightReply,
  mindRightRepairInstruction,
} = require('../src/mind-right/runtime');

function requestFor(language = 'English') {
  return {
    message:
      'Explain why ionic compounds conduct electricity when molten.',
    language,
    subject: 'Chemistry',
    recentMessages: [],
    pedagogyPlan: {
      focusTopic: 'Chemistry',
      turnKind: 'new_topic',
      decision: {
        teachingAction: {
          kind: 'build-mental-connection',
          purpose:
            'Construct one useful connection between meaning, a concrete example, and the formal idea.',
          requiredStructure: [
            'state the core meaning',
            'give one concrete or familiar example',
            'connect the example to the formal idea',
            'ask one evidence-producing question',
          ],
          forbidden: [
            'generic offers to help',
            'multiple unrelated examples',
            'long lectures',
            'more than one question',
          ],
        },
      },
    },
  };
}

test(
  'explicit English concrete bridge passes concept construction',
  () => {
    const audit =
      auditMindRightReply(
        'Ionic compounds contain charged ions. ' +
          'For example, sodium chloride contains sodium and chloride ions. ' +
          'When it melts, those ions become free to move and carry charge. ' +
          'Why can molten sodium chloride conduct while solid sodium chloride cannot?',
        requestFor(),
        []
      );

    assert.equal(
      audit.ok,
      true,
      JSON.stringify(audit)
    );
  }
);

test(
  'Banglish concrete bridge is recognized',
  () => {
    const audit =
      auditMindRightReply(
        'Ionic compound e positive ar negative ion thake. ' +
          'Jemon, sodium chloride e sodium ar chloride ion thake. ' +
          'Molten hole ion gulo move korte pare ebong charge carry kore. ' +
          'Keno molten sodium chloride electricity conduct korte pare kintu solid pare na?',
        requestFor('Banglish'),
        []
      );

    assert.equal(
      audit.ok,
      true,
      JSON.stringify(audit)
    );
  }
);

test(
  'missing explicit concrete bridge still fails closed',
  () => {
    const audit =
      auditMindRightReply(
        'Ionic compounds contain charged particles held in a lattice. ' +
          'When the lattice melts, charged ions become free to move through the liquid. ' +
          'Why can molten ionic compounds conduct electricity?',
        requestFor(),
        []
      );

    assert.equal(audit.ok, false);

    assert.ok(
      audit.issues.includes(
        'CONCEPT_MISSING_CONCRETE_BRIDGE'
      )
    );
  }
);

test(
  'concrete bridge failure receives targeted repair guidance',
  () => {
    const instruction =
      mindRightRepairInstruction(
        requestFor(),
        {
          ok: false,
          issues: [
            'CONCEPT_MISSING_CONCRETE_BRIDGE',
          ],
        }
      );

    assert.match(
      instruction,
      /exactly one specific, learner-friendly example/i
    );

    assert.match(
      instruction,
      /For example,/i
    );

    assert.match(
      instruction,
      /explain how that example demonstrates the formal idea/i
    );
  }
);

test(
  'concept repair preserves evidence-producing closure',
  () => {
    const instruction =
      mindRightRepairInstruction(
        requestFor(),
        {
          ok: false,
          issues: [
            'CONCEPT_MISSING_CONCRETE_BRIDGE',
          ],
        }
      );

    assert.match(
      instruction,
      /requires learner evidence/i
    );

    assert.match(
      instruction,
      /Never use a preference question/i
    );
  }
);
