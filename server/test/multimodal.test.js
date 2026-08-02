const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validateMultimodalAnswer,
} = require('../src/multimodal/evidence');

test('multimodal claims require exact safe source regions', () => {
  const result = validateMultimodalAnswer({
    claims: [
      {
        claimId: 'claim-1',
        evidenceIds: ['figure-1'],
      },
    ],
    evidence: [
      {
        evidenceId: 'figure-1',
        documentId: 'science-book',
        page: 22,
        regionId: 'diagram-2',
        boundingBox: {
          x: 0.1,
          y: 0.2,
          width: 0.7,
          height: 0.5,
        },
        safetyFindings: [],
      },
    ],
  });

  assert.equal(result.valid, true);
});

test('unsafe document regions cannot ground model claims', () => {
  const result = validateMultimodalAnswer({
    claims: [
      {
        claimId: 'claim-1',
        evidenceIds: ['region-1'],
      },
    ],
    evidence: [
      {
        evidenceId: 'region-1',
        documentId: 'worksheet',
        page: 1,
        regionId: 'region-1',
        boundingBox: {},
        safetyFindings: [
          {
            type: 'prompt-injection',
          },
        ],
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.equal(
    result.findings[0].type,
    'unsafe-source-region'
  );
});
