const assert =
  require('node:assert/strict');
const test =
  require('node:test');

const {
  auditClaimEvidenceShadow,
  candidateSegments,
  deterministicClaimEvidenceVerdict,
  normalizeEvidence,
  validateCoverage,
} = require(
  '../src/auditing/claim-evidence'
);

test(
  'candidate segmentation creates mandatory ordered IDs',
  () => {
    const segments =
      candidateSegments(
        'Ions are fixed. Why? Ions can move!'
      );

    assert.deepEqual(
      segments.map(
        (item) => item.id
      ),
      [
        'S1',
        'S2',
        'S3',
      ]
    );

    assert.equal(
      segments[0].text,
      'Ions are fixed.'
    );

    assert.equal(
      segments[1].text,
      'Why?'
    );
  }
);

test(
  'verified curriculum evidence is normalized into internal IDs',
  () => {
    const evidence =
      normalizeEvidence([
        {
          citationId: 'private-source-id',
          content:
            'Ions are fixed in the solid lattice.',
        },
        {
          content:
            'Molten ions are free to move.',
        },
      ]);

    assert.deepEqual(
      evidence.map(
        (item) => item.id
      ),
      [
        'E1',
        'E2',
      ]
    );

    assert.equal(
      evidence[0].text,
      'Ions are fixed in the solid lattice.'
    );
  }
);

test(
  'coverage fails closed on a missing segment',
  () => {
    const segments = [
      {
        id: 'S1',
        text: 'One.',
      },
      {
        id: 'S2',
        text: 'Two.',
      },
    ];

    const coverage =
      validateCoverage(
        segments,
        [
          {
            segmentId: 'S1',
          },
        ]
      );

    assert.equal(
      coverage.ok,
      false
    );

    assert.deepEqual(
      coverage.missing,
      [
        'S2',
      ]
    );
  }
);

test(
  'Slickk computes supported verdict deterministically',
  () => {
    const final =
      deterministicClaimEvidenceVerdict({
        segments: [
          {
            id: 'S1',
            text: 'Fact.',
          },
          {
            id: 'S2',
            text: 'Question?',
          },
        ],
        evidence: [
          {
            id: 'E1',
            text: 'Fact.',
          },
        ],
        audits: [
          {
            segmentId: 'S1',
            status: 'supported',
            evidenceIds: [
              'E1',
            ],
          },
          {
            segmentId: 'S2',
            status: 'not-factual',
            evidenceIds: [],
          },
        ],
        checkingQuestionId: 'S2',
      });

    assert.equal(
      final.verdict,
      'supported'
    );
  }
);

test(
  'unsupported segment blocks deterministic release verdict',
  () => {
    const final =
      deterministicClaimEvidenceVerdict({
        segments: [
          {
            id: 'S1',
            text: 'Fact.',
          },
          {
            id: 'S2',
            text: 'Unsupported.',
          },
        ],
        evidence: [
          {
            id: 'E1',
            text: 'Fact.',
          },
        ],
        audits: [
          {
            segmentId: 'S1',
            status: 'supported',
            evidenceIds: [
              'E1',
            ],
          },
          {
            segmentId: 'S2',
            status: 'insufficient',
            evidenceIds: [],
          },
        ],
      });

    assert.equal(
      final.verdict,
      'insufficient'
    );
  }
);

test(
  'contradiction without cited evidence is downgraded to insufficient',
  () => {
    const final =
      deterministicClaimEvidenceVerdict({
        segments: [
          {
            id: 'S1',
            text: 'Claim.',
          },
        ],
        evidence: [
          {
            id: 'E1',
            text: 'Evidence.',
          },
        ],
        audits: [
          {
            segmentId: 'S1',
            status: 'contradicted',
            evidenceIds: [],
          },
        ],
      });

    assert.equal(
      final.verdict,
      'insufficient'
    );
  }
);

test(
  'shadow audit uses model provider but remains an internal result',
  async () => {
    let calls = 0;

    const modelProvider = {
      async generate(request) {
        calls += 1;

        assert.ok(
          Array.isArray(
            request.messages
          )
        );

        assert.equal(
          request.format.type,
          'object'
        );

        return {
          content:
            JSON.stringify({
              audits: [
                {
                  segmentId: 'S1',
                  status: 'supported',
                  evidenceIds: [
                    'E1',
                  ],
                },
                {
                  segmentId: 'S2',
                  status: 'not-factual',
                  evidenceIds: [],
                },
              ],
            }),
          metrics: {
            doneReason: 'stop',
          },
        };
      },
    };

    const originalLog =
      console.log;

    try {
      console.log = () => {};

      const result =
        await auditClaimEvidenceShadow({
          reply:
            'Molten ions can move. Can you explain why?',
          curriculumEvidence: [
            {
              content:
                'When an ionic compound is molten, its ions are free to move.',
            },
          ],
          modelProvider,
          phase: 'test',
        });

      assert.equal(
        calls,
        1
      );

      assert.equal(
        result.ran,
        true
      );

      assert.equal(
        result.verdict,
        'supported'
      );
    } finally {
      console.log =
        originalLog;
    }
  }
);

test(
  'shadow verifier failure never throws into tutoring',
  async () => {
    const originalWarn =
      console.warn;

    try {
      console.warn = () => {};

      const result =
        await auditClaimEvidenceShadow({
          reply:
            'Molten ions can move.',
          curriculumEvidence: [
            {
              content:
                'When molten, ions can move.',
            },
          ],
          modelProvider: {
            async generate() {
              const error =
                new Error(
                  'synthetic failure'
                );

              error.code =
                'SYNTHETIC_FAILURE';

              throw error;
            },
          },
          phase: 'test',
        });

      assert.equal(
        result.ran,
        false
      );

      assert.equal(
        result.reason,
        'verifier-error'
      );
    } finally {
      console.warn =
        originalWarn;
    }
  }
);
