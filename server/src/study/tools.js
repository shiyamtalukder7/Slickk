const { randomUUID } = require('node:crypto');

function sentenceParts(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
}

function sourceFor(region) {
  return {
    documentId: region.documentId,
    page: region.pageNumber,
    regionId: region.regionId,
    boundingBox: region.boundingBox,
  };
}

function keywordFor(text) {
  const words =
    String(text || '').match(/[\p{L}\p{M}\p{N}]{4,}/gu) ||
    [];

  return (
    words.find(
      (word) =>
        ![
          'this',
          'that',
          'with',
          'from',
          'have',
          'into',
          'their',
          'there',
          'which',
        ].includes(word.toLowerCase())
    ) || 'concept'
  );
}

function createStudyPack({
  title = 'Study pack',
  regions = [],
  language = 'English',
}) {
  const safeRegions = regions.filter(
    (region) =>
      String(region.text || '').trim() &&
      !region.safetyFindings?.length
  );
  const evidence = safeRegions.flatMap((region) =>
    sentenceParts(region.text)
      .slice(0, 3)
      .map((text) => ({
        text,
        source: sourceFor(region),
      }))
  );

  if (evidence.length === 0) {
    const error = new Error(
      'No safe, readable evidence is available for study tools.'
    );
    error.code = 'STUDY_EVIDENCE_REQUIRED';
    error.status = 422;
    throw error;
  }

  const notes = evidence.slice(0, 8).map((item) => ({
    id: randomUUID(),
    text: item.text,
    sources: [item.source],
  }));
  const flashcards = evidence
    .slice(0, 10)
    .map((item) => {
      const keyword = keywordFor(item.text);

      return {
        id: randomUUID(),
        front: `Explain “${keyword}”.`,
        back: item.text,
        sources: [item.source],
      };
    });
  const quiz = evidence.slice(0, 6).map((item) => ({
    id: randomUUID(),
    type: 'short-answer',
    prompt: `Using the source, explain: ${keywordFor(
      item.text
    )}.`,
    expectedAnswer: item.text,
    sources: [item.source],
  }));

  return {
    id: randomUUID(),
    title: String(title).slice(0, 160),
    language: String(language).slice(0, 50),
    generatedAt: new Date().toISOString(),
    editable: true,
    notes,
    flashcards,
    quiz,
  };
}

module.exports = {
  createStudyPack,
  keywordFor,
  sentenceParts,
};
