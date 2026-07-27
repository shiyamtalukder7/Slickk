const assert = require('node:assert/strict');
const test = require('node:test');

const {
  calculateTokensPerSecond,
  nanosecondsToMilliseconds,
  normalizeModelNames,
} = require('../src/services/ollama');

test('nanosecondsToMilliseconds converts Ollama timings', () => {
  assert.equal(nanosecondsToMilliseconds(1_500_000), 2);
  assert.equal(nanosecondsToMilliseconds(undefined), null);
});

test('calculateTokensPerSecond reports generation speed', () => {
  assert.equal(
    calculateTokensPerSecond(20, 2_000_000_000),
    10
  );
});

test('normalizeModelNames accepts current Ollama model fields', () => {
  assert.deepEqual(
    normalizeModelNames({
      models: [
        { name: 'slickk-tutor:latest' },
        { model: 'qwen3:4b' },
        null,
      ],
    }),
    ['slickk-tutor:latest', 'qwen3:4b']
  );
});
