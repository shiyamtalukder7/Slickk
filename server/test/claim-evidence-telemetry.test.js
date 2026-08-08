'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  segmentStatusTelemetry,
} = require('../src/auditing/claim-evidence');

test(
  'segment telemetry contains IDs and statuses but no candidate text',
  () => {
    const segments = [
      {
        id: 'S1',
        text: 'PRIVATE_STUDENT_TEXT_ALPHA',
      },
      {
        id: 'S2',
        text: 'PRIVATE_BOOK_TEXT_BETA',
      },
      {
        id: 'S3',
        text: 'PRIVATE_TEXT_GAMMA',
      },
    ];

    const statuses = [
      'supported',
      'insufficient',
      'not-factual',
    ];

    const telemetry =
      segmentStatusTelemetry(
        segments,
        statuses
      );

    assert.deepEqual(
      telemetry,
      [
        'S1:supported',
        'S2:insufficient',
        'S3:not-factual',
      ]
    );

    const serialized =
      JSON.stringify(telemetry);

    assert.equal(
      serialized.includes(
        'PRIVATE_STUDENT_TEXT_ALPHA'
      ),
      false
    );

    assert.equal(
      serialized.includes(
        'PRIVATE_BOOK_TEXT_BETA'
      ),
      false
    );

    assert.equal(
      serialized.includes(
        'PRIVATE_TEXT_GAMMA'
      ),
      false
    );
  }
);

test(
  'segment telemetry fails closed when coverage lengths differ',
  () => {
    const telemetry =
      segmentStatusTelemetry(
        [
          { id: 'S1', text: 'hidden' },
          { id: 'S2', text: 'hidden' },
        ],
        [
          'supported',
        ]
      );

    assert.deepEqual(
      telemetry,
      []
    );
  }
);
