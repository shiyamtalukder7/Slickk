const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validateModelRequest,
  validateToolRequest,
} = require('../src/models/runtime');

test('model runtime preserves original input and bounds decoding', () => {
  const request = validateModelRequest({
    modality: 'text',
    input: 'Explain fractions',
    learnerContext: {
      studentId: 'student-1',
    },
    decoding: {
      maximumTokens: 100000,
    },
  });

  assert.equal(request.originalInput, 'Explain fractions');
  assert.equal(request.decoding.maximumTokens, 1024);
});

test('tool execution remains outside the model permission boundary', () => {
  assert.deepEqual(
    validateToolRequest(
      {
        tool: 'delete-data',
      },
      {
        allowedTools: ['delete-data'],
      }
    ),
    {
      valid: false,
      tool: 'delete-data',
      reason: 'confirmation-required',
    }
  );
});
