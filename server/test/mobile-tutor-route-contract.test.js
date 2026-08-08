const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'services',
  'tutor-stream.ts'
);

function source() {
  return readFileSync(sourcePath, 'utf8');
}

test('mobile tutor uses only the authoritative Mind Right gateway', () => {
  const text = source();

  assert.doesNotMatch(
    text,
    /requestTutorBrainResponse/
  );
  assert.match(
    text,
    /getSlickkApiUrl\s*\(\s*['"]\/api\/tutor['"]\s*\)/
  );
  assert.match(
    text,
    /expoFetch/
  );
});

test('mobile tutor preserves conversation and Learning Twin completion', () => {
  const text = source();

  assert.match(
    text,
    /conversationId\s*:\s*request\.conversationId/
  );
  assert.match(
    text,
    /callbacks\.onStart/
  );
  assert.match(
    text,
    /callbacks\.onComplete/
  );
  assert.match(
    text,
    /learningTwin/
  );
});
