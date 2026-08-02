const {
  createHash,
  randomUUID,
} = require('node:crypto');

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }

  return value;
}

function manifestDigest(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function createTrainingRunManifest(input) {
  const required = [
    'codeRevision',
    'configuration',
    'dataset',
    'tokenizer',
    'baseModel',
  ];
  const missing = required.filter(
    (key) => !input?.[key]
  );

  if (missing.length > 0) {
    const error = new Error(
      `Training manifest is missing: ${missing.join(', ')}`
    );
    error.code = 'TRAINING_MANIFEST_INCOMPLETE';
    throw error;
  }

  const immutable = {
    codeRevision: input.codeRevision,
    configuration: input.configuration,
    dataset: input.dataset,
    tokenizer: input.tokenizer,
    baseModel: input.baseModel,
  };

  return {
    runId: input.runId || randomUUID(),
    schemaVersion: 1,
    ...immutable,
    digest: manifestDigest(immutable),
    createdAt: new Date().toISOString(),
  };
}

function evaluateCandidate({
  baseline,
  candidate,
  gates,
}) {
  const results = Object.entries(gates).map(
    ([metric, rule]) => {
      const baselineValue = Number(baseline[metric]);
      const candidateValue = Number(candidate[metric]);
      const threshold = Number(rule.threshold);
      const passed =
        rule.direction === 'maximum'
          ? candidateValue <= threshold
          : rule.direction === 'improve'
            ? candidateValue >=
              baselineValue + threshold
            : candidateValue >= threshold;

      return {
        metric,
        baseline: baselineValue,
        candidate: candidateValue,
        rule,
        passed,
      };
    }
  );

  return {
    passed: results.every((result) => result.passed),
    results,
    decision: results.every((result) => result.passed)
      ? 'eligible-for-human-review'
      : 'rejected',
  };
}

module.exports = {
  createTrainingRunManifest,
  evaluateCandidate,
  manifestDigest,
  stableValue,
};
