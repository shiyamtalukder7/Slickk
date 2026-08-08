'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyNotFactualSafetyFloor,
  deterministicClaimEvidenceVerdict,
} = require('../src/auditing/claim-evidence');

test(
  'declarative segment cannot escape as not-factual',
  () => {
    assert.equal(
      applyNotFactualSafetyFloor(
        'not-factual',
        'The ions are fixed in a crystal lattice.'
      ),
      'insufficient'
    );
  }
);

test(
  'question-shaped segment may retain not-factual status',
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

    assert.equal(
      applyNotFactualSafetyFloor(
        'not-factual',
        '????????',
        {
          allowNotFactual: true,
        }
      ),
      'not-factual'
    );
  }
);

test(
  'supported status is unchanged',
  () => {
    assert.equal(
      applyNotFactualSafetyFloor(
        'supported',
        'The ions are fixed in place.'
      ),
      'supported'
    );
  }
);

test(
  'deterministic verdict fails closed for declarative not-factual escape',
  () => {
    const result =
      deterministicClaimEvidenceVerdict({
        segments: [
          {
            id: 'S1',
            text:
              'The ions are fixed in a crystal lattice.',
          },
        ],
        audits: [
          {
            segmentId: 'S1',
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
      });

    assert.equal(
      result.coverage.ok,
      true
    );

    assert.deepEqual(
      result.statuses,
      ['insufficient']
    );

    assert.equal(
      result.verdict,
      'insufficient'
    );
  }
);
