const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validateProductionConfig,
} = require('../src/config');

test('development configuration can run without deployment credentials', () => {
  const value = {
    nodeEnv: 'development',
    apiCredentials: [],
    databasePath: ':memory:',
  };

  assert.equal(validateProductionConfig(value), value);
});

test('production refuses to start without role-bound credentials', () => {
  assert.throws(
    () =>
      validateProductionConfig({
        nodeEnv: 'production',
        apiCredentials: [],
        databasePath: '/data/slickk.db',
      }),
    /requires at least one role-bound/
  );
});

test('production refuses an in-memory learner database', () => {
  assert.throws(
    () =>
      validateProductionConfig({
        nodeEnv: 'production',
        apiCredentials: [{}],
        databasePath: ':memory:',
      }),
    /requires a persistent/
  );
});

test('production accepts authenticated persistent configuration', () => {
  const value = {
    nodeEnv: 'production',
    apiCredentials: [{}],
    databasePath: '/data/slickk.db',
  };

  assert.equal(validateProductionConfig(value), value);
});
