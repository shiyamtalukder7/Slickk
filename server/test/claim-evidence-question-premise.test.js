'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyNotFactualSafetyFloor,
  candidateSegments,
  checkingQuestionSegmentId,
  deterministicClaimEvidenceVerdict,
} = require('../src/auditing/claim-evidence');

test(
  'arbitrary question-shaped segment cannot escape as not-factual',
  () => {
    assert.equal(
      applyNotFactualSafetyFloor(
        'not-factual',
        'Is this another question?'
      ),
      'insufficient'
    );
  }
);

test(
  'identified checking question may retain not-factual',
  () => {
    assert.equal(
      applyNotFactualSafetyFloor(
        'not-factual',
        'What do you notice?',
        {
          allowNotFactual: true,
        }
      ),
      'not-factual'
    );
  }
);

test(
  'only shared checking-question segment receives exemption',
  () => {
    const reply =
      'Could this sentence be ignored? ' +
      'The verified teaching claim is here. ' +
      'What do you notice?';

    const segments =
      candidateSegments(reply);

    const checkingQuestionId =
      checkingQuestionSegmentId(
        reply,
        segments
      );

    assert.equal(
      checkingQuestionId,
      'S1'
    );

    // Mind Right's current shared extractor intentionally
    // identifies the first question because runtime policy
    // requires exactly one learner question.
    //
    // This test proves that deterministic exemption follows
    // that shared boundary rather than punctuation generally.
    const result =
      deterministicClaimEvidenceVerdict({
        segments,
        audits: [
          {
            segmentId: 'S1',
            status: 'not-factual',
            evidenceIds: [],
          },
          {
            segmentId: 'S2',
            status: 'supported',
            evidenceIds: ['E1'],
          },
          {
            segmentId: 'S3',
            status: 'not-factual',
            evidenceIds: [],
          },
        ],
        evidence: [
          {
            id: 'E1',
            text: 'verified evidence',
          },
        ],
        checkingQuestionId,
      });

    assert.deepEqual(
      result.statuses,
      [
        'not-factual',
        'supported',
        'insufficient',
      ]
    );

    assert.equal(
      result.verdict,
      'insufficient'
    );
  }
);

test(
  'normal final checking question is identified and can be premise-audited',
  () => {
    const reply =
      'The verified teaching claim is here. ' +
      'Why does the verified process happen?';

    const segments =
      candidateSegments(reply);

    const checkingQuestionId =
      checkingQuestionSegmentId(
        reply,
        segments
      );

    assert.equal(
      checkingQuestionId,
      'S2'
    );

    const result =
      deterministicClaimEvidenceVerdict({
        segments,
        audits: [
          {
            segmentId: 'S1',
            status: 'supported',
            evidenceIds: ['E1'],
          },
          {
            segmentId: 'S2',
            status: 'supported',
            evidenceIds: ['E1'],
          },
        ],
        evidence: [
          {
            id: 'E1',
            text: 'verified evidence',
          },
        ],
        checkingQuestionId,
      });

    assert.deepEqual(
      result.statuses,
      [
        'supported',
        'supported',
      ]
    );
  }
);
