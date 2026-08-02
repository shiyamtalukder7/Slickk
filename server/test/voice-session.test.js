const assert = require('node:assert/strict');
const test = require('node:test');

const {
  transitionVoiceSession,
  voiceActionDecision,
} = require('../src/voice/session');

test('voice sessions expose listening and interruption states', () => {
  const listening = transitionVoiceSession(
    'idle',
    'START_LISTENING'
  );
  const thinking = transitionVoiceSession(
    listening.state,
    'TRANSCRIPT_READY'
  );
  const speaking = transitionVoiceSession(
    thinking.state,
    'RESPONSE_READY'
  );
  const interrupted = transitionVoiceSession(
    speaking.state,
    'INTERRUPT'
  );

  assert.equal(
    listening.privacyIndicator,
    'microphone-active'
  );
  assert.equal(interrupted.state, 'listening');
});

test('network loss has an explicit recoverable state', () => {
  const offline = transitionVoiceSession(
    'speaking',
    'NETWORK_LOST'
  );

  assert.equal(offline.state, 'offline');
  assert.equal(
    transitionVoiceSession(
      offline.state,
      'NETWORK_RESTORED'
    ).state,
    'idle'
  );
});

test('voice requires confirmation for consequential actions', () => {
  assert.deepEqual(
    voiceActionDecision({
      action: 'delete-learning-data',
    }),
    {
      action: 'delete-learning-data',
      allowed: false,
      confirmationRequired: true,
    }
  );
});
