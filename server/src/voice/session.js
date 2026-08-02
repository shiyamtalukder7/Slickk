const TRANSITIONS = Object.freeze({
  idle: {
    START_LISTENING: 'listening',
    NETWORK_LOST: 'offline',
  },
  listening: {
    TRANSCRIPT_READY: 'thinking',
    SILENCE: 'idle',
    STOP: 'idle',
    NETWORK_LOST: 'offline',
  },
  thinking: {
    RESPONSE_READY: 'speaking',
    CANCEL: 'idle',
    NETWORK_LOST: 'offline',
    FAILURE: 'error',
  },
  speaking: {
    INTERRUPT: 'listening',
    PAUSE: 'paused',
    FINISHED: 'idle',
    NETWORK_LOST: 'offline',
  },
  paused: {
    RESUME: 'speaking',
    STOP: 'idle',
    NETWORK_LOST: 'offline',
  },
  offline: {
    NETWORK_RESTORED: 'idle',
    STOP: 'idle',
  },
  error: {
    RETRY: 'idle',
    STOP: 'idle',
  },
});

function transitionVoiceSession(state, event) {
  const next = TRANSITIONS[state]?.[event];

  if (!next) {
    const error = new Error(
      `Voice event ${event} is not allowed while ${state}.`
    );
    error.code = 'INVALID_VOICE_TRANSITION';
    throw error;
  }

  return {
    previous: state,
    state: next,
    event,
    privacyIndicator:
      next === 'listening'
        ? 'microphone-active'
        : next === 'speaking'
          ? 'audio-output'
          : 'inactive',
  };
}

function voiceActionDecision({
  action,
  confirmed = false,
}) {
  const consequential = new Set([
    'delete-learning-data',
    'share-with-guardian',
    'submit-assessment',
    'send-school-message',
  ]);
  const needsConfirmation = consequential.has(action);

  return {
    action,
    allowed: !needsConfirmation || confirmed,
    confirmationRequired:
      needsConfirmation && !confirmed,
  };
}

module.exports = {
  TRANSITIONS,
  transitionVoiceSession,
  voiceActionDecision,
};
