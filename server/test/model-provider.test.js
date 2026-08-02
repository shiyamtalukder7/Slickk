const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createModelProvider,
  SLICKK_LLM_IDENTITY,
} = require('../src/models/provider');

test('Slickk LLM identity is independent from its runtime provider', async () => {
  const calls = [];
  const provider = createModelProvider({
    kind: 'ollama',
    model: 'candidate-teacher',
    adapter: {
      health: async () => ({
        modelInstalled: true,
        installedModels: ['candidate-teacher'],
      }),
      generate: async (request) => {
        calls.push(['generate', request]);
        return { content: 'answer', metrics: {} };
      },
      stream: async (request) => {
        calls.push(['stream', request]);
        return { content: 'answer', metrics: {} };
      },
    },
  });

  assert.deepEqual(provider.identity, SLICKK_LLM_IDENTITY);
  assert.equal(provider.identity.id, 'slickk-llm');
  assert.equal(provider.runtime.provider, 'local-ollama');
  assert.equal(provider.runtime.model, 'candidate-teacher');
  assert.equal((await provider.checkHealth()).modelInstalled, true);

  await provider.generate({ messages: [] });
  await provider.stream({ messages: [], onToken() {} });
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ['generate', 'stream']
  );
});

test('unsupported providers fail explicitly instead of silently changing behavior', () => {
  assert.throws(
    () => createModelProvider({ kind: 'unknown-runtime' }),
    /Unsupported Slickk model provider/
  );
});
