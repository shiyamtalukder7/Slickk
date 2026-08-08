const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  generateTutorResult,
} = require('../src/services/ollama');

test(
  'ordinary tutor keeps existing sampling while verifier may use narrow overrides',
  async () => {
    const originalFetch = global.fetch;
    const bodies = [];

    global.fetch = async (_url, options) => {
      bodies.push(
        JSON.parse(options.body)
      );

      return {
        ok: true,

        async json() {
          return {
            message: {
              content: '{"ok":true}',
            },
            done_reason: 'stop',
          };
        },
      };
    };

    try {
      await generateTutorResult({
        messages: [
          {
            role: 'user',
            content: 'ordinary tutor',
          },
        ],
      });

      await generateTutorResult({
        messages: [
          {
            role: 'user',
            content: 'claim verifier',
          },
        ],

        generationOptions: {
          temperature: 0,
          top_p: 1,
          top_k: 1,
          repeat_penalty: 1,
          seed: 271828,

          // These are deliberately outside the
          // narrow override allow-list.
          num_ctx: 999999,
          num_predict: 999999,
        },
      });
    } finally {
      global.fetch = originalFetch;
    }

    assert.equal(
      bodies.length,
      2
    );

    const tutor =
      bodies[0].options;

    const verifier =
      bodies[1].options;

    // Existing tutor behavior must remain unchanged.
    assert.equal(
      tutor.temperature,
      0.25
    );

    assert.equal(
      tutor.top_p,
      0.9
    );

    assert.equal(
      tutor.repeat_penalty,
      1.08
    );

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        tutor,
        'seed'
      ),
      false
    );

    // Verifier-specific deterministic settings.
    assert.equal(
      verifier.temperature,
      0
    );

    assert.equal(
      verifier.top_p,
      1
    );

    assert.equal(
      verifier.top_k,
      1
    );

    assert.equal(
      verifier.repeat_penalty,
      1
    );

    assert.equal(
      verifier.seed,
      271828
    );

    // Context/output limits remain owned by Slickk config.
    assert.equal(
      verifier.num_ctx,
      tutor.num_ctx
    );

    assert.equal(
      verifier.num_predict,
      tutor.num_predict
    );

    assert.notEqual(
      verifier.num_ctx,
      999999
    );

    assert.notEqual(
      verifier.num_predict,
      999999
    );
  }
);

test(
  'streaming remains on ordinary tutor generation path',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../src/services/ollama.js'
        ),
        'utf8'
      );

    assert.match(
      source,
      /tutorRequestBody\(\s*messages\s*,\s*true\s*\)/
    );

    assert.doesNotMatch(
      source,
      /tutorRequestBody\(\s*messages\s*,\s*true\s*,[^)]*generationOptions/
    );
  }
);
