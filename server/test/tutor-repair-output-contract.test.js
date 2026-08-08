const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  TUTOR_RESULT_JSON_SCHEMA,
  TUTOR_REPAIR_RESULT_JSON_SCHEMA,
  safelyParseTutorResult,
} = require('../src/contracts/tutor');

test(
  'normal tutor output retains the complete structured contract',
  () => {
    assert.ok(
      TUTOR_RESULT_JSON_SCHEMA.required.includes(
        'reply'
      )
    );

    assert.ok(
      TUTOR_RESULT_JSON_SCHEMA.required.includes(
        'topic'
      )
    );

    assert.ok(
      TUTOR_RESULT_JSON_SCHEMA.required.includes(
        'skill'
      )
    );
  }
);

test(
  'repair output spends its structured contract only on reply',
  () => {
    assert.deepEqual(
      TUTOR_REPAIR_RESULT_JSON_SCHEMA.required,
      ['reply']
    );

    assert.deepEqual(
      Object.keys(
        TUTOR_REPAIR_RESULT_JSON_SCHEMA.properties
      ),
      ['reply']
    );

    assert.equal(
      TUTOR_REPAIR_RESULT_JSON_SCHEMA
        .additionalProperties,
      false
    );

    assert.equal(
      TUTOR_REPAIR_RESULT_JSON_SCHEMA
        .properties
        .reply
        .minLength,
      1
    );

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        TUTOR_REPAIR_RESULT_JSON_SCHEMA
          .properties
          .reply,
        'maxLength'
      ),
      false
    );
  }
);

test(
  'reply-only repair JSON is safely parsed into a tutor result',
  () => {
    const parsed =
      safelyParseTutorResult(
        JSON.stringify({
          reply:
            'Ionic compounds contain charged ions. ' +
            'For example, sodium chloride has sodium and chloride ions. ' +
            'When molten, those ions can move and carry charge. ' +
            'Why can molten sodium chloride conduct electricity while solid sodium chloride cannot?',
        })
      );

    assert.match(
      parsed.reply,
      /For example/i
    );

    assert.match(
      parsed.reply,
      /\?$/
    );

    assert.equal(
      parsed.topic,
      'General learning'
    );
  }
);

test(
  'typed runtime repair uses the reply-only schema exactly once',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          '../src/services/tutor.js'
        ),
        'utf8'
      );

    const askStart =
      source.indexOf(
        'async function askTutor('
      );

    const streamStart =
      source.indexOf(
        'async function streamTutor(',
        askStart
      );

    assert.ok(askStart >= 0);
    assert.ok(streamStart > askStart);

    const typed =
      source.slice(
        askStart,
        streamStart
      );

    const matches =
      typed.match(
        /format:\s*TUTOR_REPAIR_RESULT_JSON_SCHEMA/g
      ) || [];

    assert.equal(
      matches.length,
      1
    );

    assert.match(
      typed,
      /messagesWithRuntimeRepair[\s\S]*?format:\s*TUTOR_REPAIR_RESULT_JSON_SCHEMA/
    );
  }
);
