const { randomUUID } = require('node:crypto');

const PROMPT_INJECTION_PATTERNS = Object.freeze([
  /\bignore\s+(all\s+)?(previous|prior)\s+instructions?\b/i,
  /\bsystem\s+prompt\b/i,
  /\bdeveloper\s+message\b/i,
  /\breveal\s+(your\s+)?(prompt|instructions?)\b/i,
  /\bact\s+as\s+(an?\s+)?(admin|developer|system)\b/i,
  /\bdo\s+not\s+cite\s+(this|the)\s+(page|document|source)\b/i,
]);

function cleanRegionText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizedBoundingBox(value = {}) {
  const x = Number(value.x ?? value.x0);
  const y = Number(value.y ?? value.y0);
  const width = Number(
    value.width ??
      (Number.isFinite(Number(value.x1))
        ? Number(value.x1) - x
        : 0)
  );
  const height = Number(
    value.height ??
      (Number.isFinite(Number(value.y1))
        ? Number(value.y1) - y
        : 0)
  );

  return {
    x: Number.isFinite(x) ? Math.max(0, x) : 0,
    y: Number.isFinite(y) ? Math.max(0, y) : 0,
    width: Number.isFinite(width)
      ? Math.max(0, width)
      : 0,
    height: Number.isFinite(height)
      ? Math.max(0, height)
      : 0,
  };
}

function classifyRegion(text) {
  const normalized = cleanRegionText(text);
  const equationSignals =
    normalized.match(
      /(?:[=+\-×÷*/^√∑∫]|[<>≤≥])|(?:\d+\s*\/\s*\d+)/g
    ) || [];
  const tableSignals =
    normalized.match(/\t|\|[^|]+\|| {3,}/g) || [];

  if (
    equationSignals.length >= 2 ||
    (equationSignals.length >= 1 &&
      /\d/.test(normalized))
  ) {
    return 'equation';
  }

  if (
    tableSignals.length >= 2 ||
    normalized
      .split('\n')
      .filter((line) => /\S+\s{2,}\S+/.test(line))
      .length >= 2
  ) {
    return 'table';
  }

  return 'text';
}

function promptInjectionFindings(text) {
  const normalized = cleanRegionText(text);

  return PROMPT_INJECTION_PATTERNS.flatMap(
    (pattern, index) =>
      pattern.test(normalized)
        ? [
            {
              code: `DOCUMENT_INSTRUCTION_${index + 1}`,
              severity: 'review',
            },
          ]
        : []
  );
}

function createEvidenceRegion({
  pageNumber,
  text,
  boundingBox,
  confidence,
  source = 'ocr',
  regionId = randomUUID(),
}) {
  const normalizedText = cleanRegionText(text);

  return {
    regionId,
    pageNumber,
    kind: classifyRegion(normalizedText),
    text: normalizedText,
    originalText: normalizedText,
    boundingBox: normalizedBoundingBox(boundingBox),
    confidence: Number.isFinite(Number(confidence))
      ? Math.max(
          0,
          Math.min(1, Number(confidence) / 100)
        )
      : null,
    source,
    corrected: false,
    correction: null,
    safetyFindings:
      promptInjectionFindings(normalizedText),
  };
}

function regionsFromRecognition(
  recognition,
  pageNumber
) {
  const blocks = Array.isArray(
    recognition?.data?.blocks
  )
    ? recognition.data.blocks
    : [];
  const regions = blocks
    .map((block) =>
      createEvidenceRegion({
        pageNumber,
        text: block.text,
        boundingBox: block.bbox,
        confidence: block.confidence,
      })
    )
    .filter((region) => region.text);

  if (regions.length > 0) {
    return regions;
  }

  const text = cleanRegionText(
    recognition?.data?.text
  );

  return text
    ? [
        createEvidenceRegion({
          pageNumber,
          text,
          boundingBox: {},
          confidence: recognition?.data?.confidence,
        }),
      ]
    : [];
}

function applyRegionCorrections(
  regions,
  corrections,
  {
    correctedBy = 'student',
    correctedAt = new Date().toISOString(),
  } = {}
) {
  const correctionsById = new Map(
    (corrections || []).map((correction) => [
      String(correction.regionId || ''),
      cleanRegionText(correction.text),
    ])
  );

  return regions.map((region) => {
    if (!correctionsById.has(region.regionId)) {
      return region;
    }

    const text = correctionsById.get(region.regionId);

    return {
      ...region,
      text,
      kind: classifyRegion(text),
      corrected: true,
      correction: {
        correctedBy,
        correctedAt,
        previousText: region.text,
      },
      safetyFindings: promptInjectionFindings(text),
    };
  });
}

function evidenceCitation(document, region) {
  return {
    citationId: `${document.id}:p${region.pageNumber}:${region.regionId}`,
    documentId: document.id,
    documentTitle: document.title,
    pageNumber: region.pageNumber,
    regionId: region.regionId,
    boundingBox: region.boundingBox,
    kind: region.kind,
  };
}

module.exports = {
  PROMPT_INJECTION_PATTERNS,
  applyRegionCorrections,
  classifyRegion,
  createEvidenceRegion,
  evidenceCitation,
  normalizedBoundingBox,
  promptInjectionFindings,
  regionsFromRecognition,
};
