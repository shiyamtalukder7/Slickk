const {
  extractCheckingQuestion,
} = require('../mind-right/runtime');

const CLAIM_EVIDENCE_GENERATION_OPTIONS = Object.freeze({
  temperature: 0,
  top_p: 1,
  top_k: 1,
  repeat_penalty: 1,
  seed: 271828,
});

const CLAIM_STATUSES = Object.freeze([
  'supported',
  'contradicted',
  'insufficient',
  'not-factual',
]);

const MAX_EVIDENCE_SOURCES = 6;
const MAX_EVIDENCE_CHARS = 4200;
const MAX_SINGLE_EVIDENCE_CHARS = 1600;

function compactText(value) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function candidateSegments(reply) {
  const text = compactText(reply);

  if (!text) {
    return [];
  }

  const matches =
    text.match(
      /[^.!?]+(?:[.!?]+|$)/gu
    ) || [];

  return matches
    .map((segment) =>
      compactText(segment)
    )
    .filter(Boolean)
    .map((segment, index) => ({
      id: `S${index + 1}`,
      text: segment,
    }));
}

function checkingQuestionSegmentId(
  reply,
  segments = candidateSegments(reply)
) {
  const question =
    compactText(
      extractCheckingQuestion(reply)
    );

  if (!question) {
    return null;
  }

  const direct =
    segments.find(
      (segment) =>
        compactText(segment?.text) === question
    );

  if (direct) {
    return direct.id;
  }

  const containing =
    segments.find(
      (segment) => {
        const text =
          compactText(segment?.text);

        return (
          text &&
          (
            text.endsWith(question) ||
            question.endsWith(text)
          )
        );
      }
    );

  return containing?.id || null;
}

function normalizeEvidence(
  curriculumEvidence
) {
  if (
    !Array.isArray(curriculumEvidence)
  ) {
    return [];
  }

  const normalized = [];
  let remaining = MAX_EVIDENCE_CHARS;

  for (const source of curriculumEvidence) {
    if (
      normalized.length >=
        MAX_EVIDENCE_SOURCES ||
      remaining <= 0
    ) {
      break;
    }

    const content =
      compactText(source?.content);

    if (!content) {
      continue;
    }

    const allowed =
      Math.min(
        MAX_SINGLE_EVIDENCE_CHARS,
        remaining
      );

    const text =
      content.slice(0, allowed);

    if (!text) {
      continue;
    }

    const rawPage =
      source?.page;

    const pageValue =
      rawPage === null ||
      rawPage === undefined ||
      rawPage === ''
        ? null
        : Number(rawPage);

    normalized.push({
      id: `E${normalized.length + 1}`,
      citationId:
        compactText(source?.citationId),
      documentId:
        compactText(source?.documentId),
      chunkId:
        compactText(source?.chunkId),
      page:
        Number.isFinite(pageValue)
          ? pageValue
          : null,
      text,
    });

    remaining -= text.length;
  }

  return normalized;
}

function claimEvidenceSchema({
  segmentIds,
  evidenceIds,
}) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      statuses: {
        type: 'array',
        minItems: segmentIds.length,
        maxItems: segmentIds.length,
        items: {
          type: 'string',
          enum: CLAIM_STATUSES,
        },
      },
      evidenceIdsBySegment: {
        type: 'array',
        minItems: segmentIds.length,
        maxItems: segmentIds.length,
        items: {
          type: 'array',
          items: {
            type: 'string',
            enum: evidenceIds,
          },
        },
      },
    },
    required: [
      'statuses',
      'evidenceIdsBySegment',
    ],
  };
}

function claimEvidenceMessages({
  segments,
  evidence,
  checkingQuestionId = null,
}) {
  const evidenceText =
    evidence
      .map(
        (item) =>
          `${item.id}: ${item.text}`
      )
      .join('\n');

  const segmentText =
    segments
      .map(
        (item) =>
          `${item.id}: ${item.text}`
      )
      .join('\n');

  return [
    {
      role: 'system',
      content: [
        'You are a strict claim-evidence auditor.',
        'Use only VERIFIED_EVIDENCE supplied below.',
        'Do not use outside knowledge.',
        '',
        'Judge every CANDIDATE_SEGMENT exactly once and in the supplied order.',
        `There are exactly ${segments.length} candidate segments.`,
        `The learner checking-question segment is ${checkingQuestionId || 'NONE'}.`,
        '',
        'For the learner checking-question segment, judge only its factual assertions or factual presuppositions.',
        'A question can contain a factual premise. If it does, verify that premise against VERIFIED_EVIDENCE.',
        'Do not mark the checking question not-factual merely because it is phrased as a question.',
        'Use not-factual for the checking question only when it contains no factual assertion or factual presupposition.',
        '',
        'Return JSON only with two arrays:',
        '1. statuses',
        '2. evidenceIdsBySegment',
        '',
        `Both arrays must contain exactly ${segments.length} entries.`,
        'Array position 1 corresponds to S1, position 2 to S2, and so on.',
        'Do not return segment IDs.',
        'Do not return explanations.',
        '',
        'Allowed statuses:',
        '- supported: the complete factual meaning is established by cited evidence.',
        '- contradicted: cited evidence establishes the opposite.',
        '- insufficient: the supplied evidence does not establish the complete factual meaning.',
        '- not-factual: greeting, instruction, or question containing no factual assertion.',
        '',
        'A mixed segment containing both supported and unsupported factual assertions is insufficient.',
        '',
        'COMPLETE-ENTAILMENT DISCIPLINE:',
        '- Judge the complete material factual meaning of the segment, not topical similarity.',
        '- Material details include the entity, mechanism, cause, relation, state or condition, quantity, direction, and qualifier.',
        '- Evidence supporting only the final outcome does not support an unsupported mechanism or cause stated by the candidate.',
        '- If the evidence establishes the outcome but does not establish a material mechanism, cause, entity, relation, condition, quantity, direction, or qualifier in the candidate, use insufficient.',
        'CONTRADICTION BOUNDARY:',
        '- contradicted requires verified evidence that is logically incompatible with a material factual detail in the candidate.',
        '- A different or additional mechanism, cause, event, condition, entity, relation, or qualifier is NOT automatically a contradiction.',
        '- If the candidate states a material detail that the evidence does not establish, but the evidence also does not negate or exclude that detail, use insufficient.',
        '- Use contradicted only when the evidence explicitly negates the candidate detail, establishes an incompatible alternative, or otherwise makes the candidate detail unable to be true at the same time.',
        '- Do not treat correlation, sequence, triggering events, alternative descriptions, or non-exclusive causes as contradictions merely because they differ from the candidate wording.',
        '- Example: candidate says "X happens because Y" and evidence only says "X happens when Z" => insufficient unless the evidence also establishes that Y is false or excluded.',
        '- Example: candidate says "X happens because Y" and evidence says "Y does not occur and X happens exclusively because Z" => contradicted.',
        '- Before returning supported, actively scan ALL VERIFIED_EVIDENCE for conflicts. Do not stop after finding one partially matching source.',
        '- supported requires every material factual detail in the complete segment to be established by the cited evidence.',
        '- Never certify a mixed sentence from evidence that establishes only part of that sentence.',
        '- Pattern example: candidate says "X occurs because Y" while evidence establishes only "X occurs" => insufficient.',
        '- Pattern example: candidate says "X occurs by A" while verified evidence establishes "X occurs by B" => contradicted.',
        '',
        'supported and contradicted must cite at least one evidence ID.',
        'insufficient and not-factual should normally use an empty evidence-ID array.',
      ].join('\n'),
    },
    {
      role: 'user',
      content:
        `VERIFIED_EVIDENCE:\n${evidenceText}\n\n` +
        `CANDIDATE_SEGMENTS:\n${segmentText}`,
    },
  ];
}

function parseAuditContent(rawText) {
  let text =
    String(rawText || '').trim();

  const fenced =
    text.match(
      /^```(?:json)?\s*([\s\S]*?)\s*```$/iu
    );

  if (fenced) {
    text = fenced[1].trim();
  }

  return JSON.parse(text);
}

function materializeAudits(
  parsed,
  segments
) {
  if (Array.isArray(parsed?.audits)) {
    return parsed.audits;
  }

  const statuses =
    Array.isArray(parsed?.statuses)
      ? parsed.statuses
      : [];

  const evidenceIdsBySegment =
    Array.isArray(
      parsed?.evidenceIdsBySegment
    )
      ? parsed.evidenceIdsBySegment
      : [];

  const count =
    Math.min(
      statuses.length,
      evidenceIdsBySegment.length,
      segments.length
    );

  return Array.from(
    { length: count },
    (_, index) => ({
      segmentId:
        segments[index]?.id || '',
      status:
        statuses[index],
      evidenceIds:
        Array.isArray(
          evidenceIdsBySegment[index]
        )
          ? evidenceIdsBySegment[index]
          : [],
    })
  );
}

function validateCoverage(
  segments,
  audits
) {
  const required =
    segments.map(
      (segment) => segment.id
    );

  const returned =
    Array.isArray(audits)
      ? audits.map(
          (item) =>
            String(
              item?.segmentId || ''
            )
        )
      : [];

  const missing =
    required.filter(
      (id) =>
        !returned.includes(id)
    );

  const unknown =
    returned.filter(
      (id) =>
        !required.includes(id)
    );

  const duplicates =
    returned.filter(
      (id, index) =>
        returned.indexOf(id) !== index
    );

  return {
    ok:
      missing.length === 0 &&
      unknown.length === 0 &&
      duplicates.length === 0 &&
      returned.length ===
        required.length,
    missing,
    unknown,
    duplicates,
  };
}

function effectiveAuditStatus(
  audit,
  validEvidenceIds
) {
  const status =
    CLAIM_STATUSES.includes(
      audit?.status
    )
      ? audit.status
      : 'insufficient';

  const evidenceIds =
    Array.isArray(
      audit?.evidenceIds
    )
      ? audit.evidenceIds.filter(
          (id) =>
            validEvidenceIds.has(id)
        )
      : [];

  if (
    status === 'supported' &&
    evidenceIds.length === 0
  ) {
    return 'insufficient';
  }

  if (
    status === 'contradicted' &&
    evidenceIds.length === 0
  ) {
    return 'insufficient';
  }

  return status;
}

function applyNotFactualSafetyFloor(
  status,
  segmentText,
  {
    allowNotFactual = false,
  } = {}
) {
  if (status !== 'not-factual') {
    return status;
  }

  const text =
    compactText(segmentText);

  if (!text) {
    return 'insufficient';
  }

  // Only the deterministically identified learner checking
  // question may retain not-factual. Other segments fail
  // closed even when model output attempts to exempt them.
  return allowNotFactual
    ? 'not-factual'
    : 'insufficient';
}

function deterministicClaimEvidenceVerdict({
  segments,
  audits,
  evidence,
  checkingQuestionId = null,
}) {
  const coverage =
    validateCoverage(
      segments,
      audits
    );

  if (!coverage.ok) {
    return {
      verdict: 'insufficient',
      coverage,
      statuses: [],
    };
  }

  const validEvidenceIds =
    new Set(
      evidence.map(
        (item) => item.id
      )
    );

  const statuses =
    audits.map(
      (audit, index) =>
        applyNotFactualSafetyFloor(
          effectiveAuditStatus(
            audit,
            validEvidenceIds
          ),
          segments[index]?.text || '',
          {
            allowNotFactual:
              segments[index]?.id ===
              checkingQuestionId,
          }
        )
    );

  if (
    statuses.includes(
      'contradicted'
    )
  ) {
    return {
      verdict: 'contradicted',
      coverage,
      statuses,
    };
  }

  if (
    statuses.includes(
      'insufficient'
    )
  ) {
    return {
      verdict: 'insufficient',
      coverage,
      statuses,
    };
  }

  if (
    statuses.every(
      (status) =>
        status === 'not-factual'
    )
  ) {
    return {
      verdict: 'not-applicable',
      coverage,
      statuses,
    };
  }

  if (
    statuses.every(
      (status) =>
        status === 'supported' ||
        status === 'not-factual'
    )
  ) {
    return {
      verdict: 'supported',
      coverage,
      statuses,
    };
  }

  return {
    verdict: 'insufficient',
    coverage,
    statuses,
  };
}

function statusCounts(statuses) {
  const counts = {
    supported: 0,
    contradicted: 0,
    insufficient: 0,
    notFactual: 0,
  };

  for (const status of statuses) {
    if (status === 'supported') {
      counts.supported += 1;
    } else if (
      status === 'contradicted'
    ) {
      counts.contradicted += 1;
    } else if (
      status === 'insufficient'
    ) {
      counts.insufficient += 1;
    } else if (
      status === 'not-factual'
    ) {
      counts.notFactual += 1;
    }
  }

  return counts;
}

function evidenceIdentityTelemetry(
  evidence
) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  return evidence.map((item) => {
    const id =
      compactText(item?.id) || 'E?';

    const citationId =
      compactText(item?.citationId);

    const documentId =
      compactText(item?.documentId);

    const chunkId =
      compactText(item?.chunkId);

    const rawPage =
      item?.page;

    const page =
      rawPage === null ||
      rawPage === undefined ||
      rawPage === ''
        ? null
        : Number(rawPage);

    const parts = [id];

    if (citationId) {
      parts.push(
        `citation=${citationId}`
      );
    }

    if (documentId) {
      parts.push(
        `document=${documentId}`
      );
    }

    if (chunkId) {
      parts.push(
        `chunk=${chunkId}`
      );
    }

    if (Number.isFinite(page)) {
      parts.push(
        `page=${page}`
      );
    }

    return parts.join('|');
  });
}

function segmentEvidenceTelemetry(
  segments,
  audits,
  evidence
) {
  if (
    !Array.isArray(segments) ||
    !Array.isArray(audits) ||
    segments.length !== audits.length
  ) {
    return [];
  }

  const validEvidenceIds =
    new Set(
      Array.isArray(evidence)
        ? evidence.map(
            (item) => item.id
          )
        : []
    );

  return segments.map(
    (segment, index) => {
      const ids =
        Array.isArray(
          audits[index]?.evidenceIds
        )
          ? audits[index].evidenceIds.filter(
              (id) =>
                validEvidenceIds.has(id)
            )
          : [];

      return `${segment.id}:${
        ids.length > 0
          ? ids.join(',')
          : '-'
      }`;
    }
  );
}

function segmentStatusTelemetry(
  segments,
  statuses
) {
  if (
    !Array.isArray(segments) ||
    !Array.isArray(statuses) ||
    segments.length !== statuses.length
  ) {
    return [];
  }

  return segments.map(
    (segment, index) => {
      const status =
        CLAIM_STATUSES.includes(
          statuses[index]
        )
          ? statuses[index]
          : 'insufficient';

      return `${segment.id}:${status}`;
    }
  );
}

async function auditClaimEvidenceShadow({
  reply,
  curriculumEvidence,
  modelProvider,
  signal,
  phase = 'typed',
}) {
  const evidence =
    normalizeEvidence(
      curriculumEvidence
    );

  const segments =
    candidateSegments(reply);

  const checkingQuestionId =
    checkingQuestionSegmentId(
      reply,
      segments
    );

  if (evidence.length === 0) {
    return {
      ran: false,
      reason: 'no-verified-evidence',
    };
  }

  if (segments.length === 0) {
    return {
      ran: false,
      reason: 'no-candidate-segments',
    };
  }

  try {
    const result =
      await modelProvider.generate({
        generationOptions:
          CLAIM_EVIDENCE_GENERATION_OPTIONS,
        messages:
          claimEvidenceMessages({
            segments,
            evidence,
            checkingQuestionId,
          }),
        format:
          claimEvidenceSchema({
            segmentIds:
              segments.map(
                (item) => item.id
              ),
            evidenceIds:
              evidence.map(
                (item) => item.id
              ),
          }),
        signal,
      });

    const parsed =
      parseAuditContent(
        result.content
      );

    const audits =
      materializeAudits(
        parsed,
        segments
      );

    const final =
      deterministicClaimEvidenceVerdict({
        segments,
        audits,
        evidence,
        checkingQuestionId,
      });

    const counts =
      statusCounts(
        final.statuses
      );

    const event = {
      checkingQuestionSegmentId:
        checkingQuestionId,
      level:
        final.verdict ===
          'supported' ||
        final.verdict ===
          'not-applicable'
          ? 'info'
          : 'warn',
      event:
        'claim-evidence-shadow',
      phase,
      mode: 'shadow',
      verdict:
        final.verdict,
      coverageOk:
        final.coverage.ok,
      segments:
        segments.length,
      evidenceSources:
        evidence.length,
      evidenceIdentities:
        evidenceIdentityTelemetry(
          evidence
        ),
      supported:
        counts.supported,
      contradicted:
        counts.contradicted,
      insufficient:
        counts.insufficient,
      notFactual:
        counts.notFactual,
      segmentStatuses:
        segmentStatusTelemetry(
          segments,
          final.statuses
        ),
      segmentEvidenceIds:
        segmentEvidenceTelemetry(
          segments,
          audits,
          evidence
        ),
      missingIds:
        final.coverage.missing.length,
      unknownIds:
        final.coverage.unknown.length,
      duplicateIds:
        final.coverage.duplicates.length,
      doneReason:
        result?.metrics?.doneReason ||
        null,
    };

    if (event.level === 'warn') {
      console.warn(
        JSON.stringify(event)
      );
    } else {
      console.log(
        JSON.stringify(event)
      );
    }

    return {
      ran: true,
      verdict:
        final.verdict,
      coverage:
        final.coverage,
      statuses:
        final.statuses,
      counts,
    };
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event:
          'claim-evidence-shadow',
        phase,
        mode: 'shadow',
        verdict: 'error',
        errorCode:
          typeof error?.code ===
            'string'
            ? error.code
            : 'CLAIM_EVIDENCE_SHADOW_ERROR',
      })
    );

    return {
      ran: false,
      reason: 'verifier-error',
    };
  }
}

module.exports = {

  evidenceIdentityTelemetry,
  checkingQuestionSegmentId,
  applyNotFactualSafetyFloor,  CLAIM_STATUSES,
  auditClaimEvidenceShadow,
  candidateSegments,
  claimEvidenceMessages,
  claimEvidenceSchema,
  deterministicClaimEvidenceVerdict,
  materializeAudits,
  normalizeEvidence,
  segmentEvidenceTelemetry,
  segmentStatusTelemetry,
  validateCoverage,
};
