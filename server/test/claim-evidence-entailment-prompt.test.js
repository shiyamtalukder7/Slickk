'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditClaimEvidenceShadow,
} = require('../src/auditing/claim-evidence');

test(
  'claim auditor receives universal complete-entailment discipline',
  async () => {
    let capturedMessages = null;

    const modelProvider = {
      async generate({
        messages,
      }) {
        capturedMessages = messages;

        return {
          content: JSON.stringify({
            statuses: [
              'insufficient',
            ],
            evidenceIdsBySegment: [
              [],
            ],
          }),
          doneReason: 'stop',
        };
      },
    };

    await auditClaimEvidenceShadow({
      reply:
        'The outcome occurs because of a particular mechanism.',
      curriculumEvidence: [
        {
          citationId: 'source-1',
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          page: 1,
          content:
            'The outcome occurs.',
        },
      ],
      modelProvider,
      phase: 'test',
    });

    assert.ok(
      Array.isArray(capturedMessages)
    );

    const systemPrompt =
      String(
        capturedMessages?.[0]?.content || ''
      );

    assert.match(
      systemPrompt,
      /COMPLETE-ENTAILMENT DISCIPLINE/
    );

    assert.match(
      systemPrompt,
      /complete material factual meaning/
    );

    assert.match(
      systemPrompt,
      /mechanism, cause, relation/
    );

    assert.match(
      systemPrompt,
      /actively scan ALL VERIFIED_EVIDENCE for conflicts/
    );

    assert.match(
      systemPrompt,
      /X occurs because Y/
    );

    assert.match(
      systemPrompt,
      /X occurs by A/
    );
  }
);

test(
  'entailment discipline remains domain generic',
  async () => {
    let capturedMessages = null;

    const modelProvider = {
      async generate({
        messages,
      }) {
        capturedMessages = messages;

        return {
          content: JSON.stringify({
            statuses: [
              'insufficient',
            ],
            evidenceIdsBySegment: [
              [],
            ],
          }),
          doneReason: 'stop',
        };
      },
    };

    await auditClaimEvidenceShadow({
      reply:
        'A generic factual candidate.',
      curriculumEvidence: [
        {
          content:
            'Generic verified evidence.',
        },
      ],
      modelProvider,
      phase: 'test',
    });

    const systemPrompt =
      String(
        capturedMessages?.[0]?.content || ''
      ).toLowerCase();

    for (const forbidden of [
      'ionic',
      'molten',
      'chloride',
      'electron',
      'chemistry',
    ]) {
      assert.equal(
        systemPrompt.includes(
          forbidden
        ),
        false
      );
    }
  }
);
