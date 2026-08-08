'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractCheckingQuestion,
} = require('../src/mind-right/runtime');

const {
  candidateSegments,
  checkingQuestionSegmentId,
} = require('../src/auditing/claim-evidence');

test(
  'shared extractor returns final learner question',
  () => {
    const reply =
      'Ions are fixed in the solid lattice. ' +
      'When molten, the ions can move. ' +
      'Why can molten sodium chloride conduct electricity?';

    assert.equal(
      extractCheckingQuestion(reply),
      'Why can molten sodium chloride conduct electricity?'
    );
  }
);

test(
  'shared extractor returns empty string when no question exists',
  () => {
    assert.equal(
      extractCheckingQuestion(
        'Ions are fixed in the solid lattice.'
      ),
      ''
    );
  }
);

test(
  'claim evidence identifies the checking-question segment',
  () => {
    const reply =
      'Ions are fixed in the solid lattice. ' +
      'Molten ions can move. ' +
      'Explain why the molten compound conducts electricity?';

    const segments =
      candidateSegments(reply);

    assert.equal(
      segments.length,
      3
    );

    assert.equal(
      checkingQuestionSegmentId(
        reply,
        segments
      ),
      'S3'
    );
  }
);

test(
  'question boundary does not change teaching segment IDs',
  () => {
    const reply =
      'First factual statement. ' +
      'Second factual statement. ' +
      'What evidence supports the second statement?';

    const segments =
      candidateSegments(reply);

    assert.deepEqual(
      segments.map((segment) => segment.id),
      ['S1', 'S2', 'S3']
    );

    assert.equal(
      checkingQuestionSegmentId(
        reply,
        segments
      ),
      'S3'
    );
  }
);

test(
  'no checking question produces no special segment',
  () => {
    const reply =
      'First factual statement. Second factual statement.';

    assert.equal(
      checkingQuestionSegmentId(reply),
      null
    );
  }
);
