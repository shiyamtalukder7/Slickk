function validateModelRequest(request) {
  const modalities = [
    'text',
    'speech',
    'image',
    'document',
    'tool-result',
  ];

  if (
    !modalities.includes(request?.modality) ||
    !String(request?.input || '').trim() ||
    !request?.learnerContext?.studentId
  ) {
    const error = new Error(
      'Model requests require a supported modality, input, and permitted learner context.'
    );
    error.code = 'INVALID_MODEL_REQUEST';
    throw error;
  }

  return {
    modality: request.modality,
    originalInput: String(request.input),
    normalizedInput: String(request.input).normalize(
      'NFKC'
    ),
    learnerContext: request.learnerContext,
    evidence: Array.isArray(request.evidence)
      ? request.evidence
      : [],
    decoding: {
      maximumTokens: Math.min(
        1024,
        Math.max(
          32,
          Number(request.decoding?.maximumTokens) || 320
        )
      ),
      repetitionPenalty: Math.min(
        2,
        Math.max(
          1,
          Number(request.decoding?.repetitionPenalty) ||
            1.1
        )
      ),
    },
  };
}

function validateToolRequest(toolRequest, permissions) {
  const allowed = new Set(
    permissions?.allowedTools || []
  );
  const consequential = new Set([
    'delete-data',
    'submit-assessment',
    'share-record',
    'message-school',
  ]);
  const tool = String(toolRequest?.tool || '');
  const requiresConfirmation = consequential.has(tool);

  return {
    valid:
      allowed.has(tool) &&
      (!requiresConfirmation ||
        toolRequest?.confirmed === true),
    tool,
    reason: !allowed.has(tool)
      ? 'tool-not-permitted'
      : requiresConfirmation &&
          toolRequest?.confirmed !== true
        ? 'confirmation-required'
        : 'permitted',
  };
}

module.exports = {
  validateModelRequest,
  validateToolRequest,
};
