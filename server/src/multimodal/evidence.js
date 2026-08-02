function validateMultimodalAnswer({
  claims = [],
  evidence = [],
}) {
  const evidenceById = new Map(
    evidence.map((item) => [item.evidenceId, item])
  );
  const findings = [];

  for (const item of evidence) {
    if (
      !item.documentId ||
      !Number.isInteger(item.page) ||
      !item.regionId ||
      !item.boundingBox
    ) {
      findings.push({
        type: 'incomplete-evidence-location',
        evidenceId: item.evidenceId,
      });
    }

    if (item.safetyFindings?.length) {
      findings.push({
        type: 'unsafe-source-region',
        evidenceId: item.evidenceId,
      });
    }
  }

  for (const claim of claims) {
    const citations = Array.isArray(claim.evidenceIds)
      ? claim.evidenceIds
      : [];

    if (
      citations.length === 0 ||
      citations.some((id) => !evidenceById.has(id))
    ) {
      findings.push({
        type: 'unsupported-claim',
        claimId: claim.claimId,
      });
    }
  }

  return {
    valid: findings.length === 0,
    findings,
    claims: claims.length,
    evidenceRegions: evidence.length,
  };
}

function accessibleVisualDescription(input) {
  const kind = String(input?.kind || 'visual');
  const summary = String(input?.summary || '').trim();
  const relationships = Array.isArray(
    input?.relationships
  )
    ? input.relationships
    : [];

  if (!summary) {
    const error = new Error(
      'An accessible visual description needs a factual summary.'
    );
    error.code = 'VISUAL_DESCRIPTION_REQUIRED';
    throw error;
  }

  return {
    kind,
    summary,
    relationships,
    source: input.source,
    generated: false,
  };
}

module.exports = {
  accessibleVisualDescription,
  validateMultimodalAnswer,
};
