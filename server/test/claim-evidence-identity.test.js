'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evidenceIdentityTelemetry,
  normalizeEvidence,
} = require('../src/auditing/claim-evidence');

test(
  'normalized evidence preserves retrieval identity',
  () => {
    const result =
      normalizeEvidence([
        {
          citationId: 'source-1',
          documentId: 'doc-123',
          chunkId: 'chunk-456',
          page: 112,
          documentTitle: 'Private title',
          sourceUrl: 'https://private.invalid',
          content:
            'Verified curriculum evidence.',
        },
      ]);

    assert.equal(
      result.length,
      1
    );

    assert.deepEqual(
      {
        id: result[0].id,
        citationId: result[0].citationId,
        documentId: result[0].documentId,
        chunkId: result[0].chunkId,
        page: result[0].page,
      },
      {
        id: 'E1',
        citationId: 'source-1',
        documentId: 'doc-123',
        chunkId: 'chunk-456',
        page: 112,
      }
    );

    assert.equal(
      result[0].text,
      'Verified curriculum evidence.'
    );
  }
);

test(
  'identity telemetry excludes textbook text title and URL',
  () => {
    const telemetry =
      evidenceIdentityTelemetry([
        {
          id: 'E1',
          citationId: 'source-1',
          documentId: 'doc-123',
          chunkId: 'chunk-456',
          page: 112,
          text:
            'SECRET TEXT MUST NOT APPEAR',
          documentTitle:
            'PRIVATE TITLE MUST NOT APPEAR',
          sourceUrl:
            'https://private.invalid',
        },
      ]);

    assert.deepEqual(
      telemetry,
      [
        'E1|citation=source-1|document=doc-123|chunk=chunk-456|page=112',
      ]
    );

    const serialized =
      JSON.stringify(telemetry);

    assert.equal(
      serialized.includes(
        'SECRET TEXT'
      ),
      false
    );

    assert.equal(
      serialized.includes(
        'PRIVATE TITLE'
      ),
      false
    );

    assert.equal(
      serialized.includes(
        'private.invalid'
      ),
      false
    );
  }
);

test(
  'missing identity fails safely without inventing page zero',
  () => {
    const result =
      normalizeEvidence([
        {
          content:
            'Verified evidence.',
        },
      ]);

    assert.equal(
      result.length,
      1
    );

    assert.equal(
      result[0].citationId,
      ''
    );

    assert.equal(
      result[0].documentId,
      ''
    );

    assert.equal(
      result[0].chunkId,
      ''
    );

    assert.equal(
      result[0].page,
      null
    );

    assert.deepEqual(
      evidenceIdentityTelemetry(
        result
      ),
      ['E1']
    );
  }
);
