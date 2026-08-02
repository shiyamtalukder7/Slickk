const { createHash } = require('node:crypto');

const { createEvidenceRegion } = require('./analysis');
const { importPdfBuffer } = require('./importer');
const {
  ocrImageBuffer,
  ocrLanguagesFromLabel,
} = require('./ocr');

const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;

function materialMetadata({
  fileName,
  studentId,
  profile,
  subject,
}) {
  return {
    title: String(fileName || 'Learning material').slice(0, 240),
    curriculum: String(
      profile?.curriculumTrack || 'Student-provided material'
    ),
    academicYear: String(new Date().getUTCFullYear()),
    grade: String(profile?.grade || 'General'),
    subject: String(subject || 'General'),
    language: String(
      profile?.teachingLanguage || 'English'
    ),
    version: 'Student copy',
    sourceUrl: '',
    rights: 'licensed-user-copy',
    access: {
      studentId,
      schoolId: profile?.school?.id || '',
    },
  };
}

function validateMaterialBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error(
      'The learning material is empty.'
    );
    error.code = 'EMPTY_MATERIAL';
    error.status = 400;
    throw error;
  }

  if (buffer.length > MAX_MATERIAL_BYTES) {
    const error = new Error(
      'The learning material exceeds the 25 MB limit.'
    );
    error.code = 'MATERIAL_TOO_LARGE';
    error.status = 413;
    throw error;
  }
}

async function analyzeMaterialBuffer({
  buffer,
  mimeType,
  fileName,
  studentId,
  profile,
  subject,
  store,
  recognizeImage = ocrImageBuffer,
  importPdf = importPdfBuffer,
}) {
  validateMaterialBuffer(buffer);
  const metadata = materialMetadata({
    fileName,
    studentId,
    profile,
    subject,
  });
  const normalizedMime = String(mimeType || '')
    .split(';')[0]
    .toLowerCase();

  if (normalizedMime === 'application/pdf') {
    const result = await importPdf({
      buffer,
      metadata,
      store,
    });

    return {
      kind: 'pdf',
      document: result.document,
      pageCount: result.pageCount,
      ocrPageCount: result.ocrPageCount,
      duplicate: result.duplicate,
    };
  }

  let page;

  if (normalizedMime.startsWith('image/')) {
    page = await recognizeImage(buffer, {
      languages: ocrLanguagesFromLabel(metadata.language),
    });
  } else if (normalizedMime === 'text/plain') {
    const text = buffer.toString('utf8').trim();
    page = {
      pageNumber: 1,
      text,
      regions: [
        createEvidenceRegion({
          pageNumber: 1,
          regionIndex: 0,
          text,
          source: 'text-file',
        }),
      ],
    };
  } else {
    const error = new Error(
      'This file type is not analyzable yet. Use an image, PDF, or plain-text file.'
    );
    error.code = 'UNSUPPORTED_MATERIAL_TYPE';
    error.status = 415;
    throw error;
  }

  if (!page.text) {
    const error = new Error(
      'No readable text was found. Retake the photo with clearer light and focus.'
    );
    error.code = 'MATERIAL_TEXT_UNAVAILABLE';
    error.status = 422;
    throw error;
  }

  const sha256 = createHash('sha256')
    .update(buffer)
    .digest('hex');
  const result = store.importDocument({
    metadata,
    pages: [page],
    pageCount: 1,
    sha256,
  });

  return {
    kind: normalizedMime.startsWith('image/')
      ? 'image'
      : 'text',
    document: result.document,
    pageCount: 1,
    ocrPageCount: normalizedMime.startsWith('image/')
      ? 1
      : 0,
    duplicate: result.duplicate,
    previewText: page.text.slice(0, 500),
    regions: page.regions.length,
  };
}

module.exports = {
  MAX_MATERIAL_BYTES,
  analyzeMaterialBuffer,
  materialMetadata,
  validateMaterialBuffer,
};
