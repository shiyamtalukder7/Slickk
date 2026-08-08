const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditClaimEvidenceShadow,
} = require('../src/auditing/claim-evidence');

test(
  'Claim Evidence requests its deterministic generation profile',
  async () => {
    let capturedRequest = null;

    const modelProvider = {
      async generate(request) {
        capturedRequest = request;

        return {
          content: JSON.stringify({
            statuses: [
              'supported',
            ],

            evidenceIdsBySegment: [
              [
                'E1',
              ],
            ],
          }),

          doneReason: 'stop',
        };
      },
    };

    const result =
      await auditClaimEvidenceShadow({
        reply:
          'The red switch activates the alarm.',

        curriculumEvidence: [
          {
            citationId: 'source-1',
            documentId: 'doc-1',
            chunkId: 'chunk-1',
            page: 1,

            content:
              'Pressing the red switch activates the alarm.',
          },
        ],

        modelProvider,

        phase:
          'deterministic-generation-test',
      });

    assert.ok(
      capturedRequest
    );

    assert.deepEqual(
      capturedRequest.generationOptions,
      {
        temperature: 0,
        top_p: 1,
        top_k: 1,
        repeat_penalty: 1,
        seed: 271828,
      }
    );

    assert.equal(
      result.verdict,
      'supported'
    );
  }
);
