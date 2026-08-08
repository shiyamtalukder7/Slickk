const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditClaimEvidenceShadow,
} = require('../src/auditing/claim-evidence');

async function capturePrompt() {
  let capturedMessages = null;

  const modelProvider = {
    async generate({
      messages,
    }) {
      capturedMessages =
        messages;

      return {
        content: JSON.stringify({
          statuses: [
            'insufficient',
          ],

          evidenceIdsBySegment: [
            [],
          ],
        }),

        doneReason:
          'stop',
      };
    },
  };

  await auditClaimEvidenceShadow({
    reply:
      'The outcome occurs because mechanism Y operates.',

    curriculumEvidence: [
      {
        citationId:
          'source-1',

        documentId:
          'generic-doc',

        chunkId:
          'generic-chunk',

        page:
          1,

        content:
          'The outcome occurs when event Z happens.',
      },
    ],

    modelProvider,

    phase:
      'contradiction-boundary-test',
  });

  return String(
    capturedMessages?.[0]?.content ||
    ''
  );
}

test(
  'contradiction requires logical incompatibility',
  async () => {
    const prompt =
      await capturePrompt();

    assert.match(
      prompt,
      /CONTRADICTION BOUNDARY/
    );

    assert.match(
      prompt,
      /logically incompatible/
    );

    assert.match(
      prompt,
      /NOT automatically a contradiction/
    );

    assert.match(
      prompt,
      /does not negate or exclude/
    );

    assert.match(
      prompt,
      /unable to be true at the same time/
    );
  }
);

test(
  'different non-exclusive cause maps to insufficient in the verifier contract',
  async () => {
    const prompt =
      await capturePrompt();

    assert.match(
      prompt,
      /X happens because Y/
    );

    assert.match(
      prompt,
      /X happens when Z/
    );

    assert.match(
      prompt,
      /insufficient unless the evidence also establishes that Y is false or excluded/
    );
  }
);

test(
  'explicit exclusion remains contradiction',
  async () => {
    const prompt =
      await capturePrompt();

    assert.match(
      prompt,
      /Y does not occur/
    );

    assert.match(
      prompt,
      /exclusively because Z/
    );

    assert.match(
      prompt,
      /contradicted/
    );
  }
);

test(
  'contradiction semantics remain domain generic',
  async () => {
    const prompt =
      (
        await capturePrompt()
      ).toLowerCase();

    for (
      const forbidden
      of [
        'ionic',
        'chloride',
        'molten',
        'electron',
        'chemistry',
      ]
    ) {
      assert.equal(
        prompt.includes(
          forbidden
        ),
        false
      );
    }
  }
);
