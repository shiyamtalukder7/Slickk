const { createHash } = require('node:crypto');

const DEFAULT_MAX_PDF_BYTES = 40 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 800;

class PdfDocumentError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'PdfDocumentError';
    this.code = code;
    this.status = status;
  }
}

function validatePdfBuffer(
  buffer,
  maximumBytes = DEFAULT_MAX_PDF_BYTES
) {
  if (!Buffer.isBuffer(buffer)) {
    throw new PdfDocumentError(
      'The document must be provided as a PDF buffer.',
      'INVALID_PDF_BUFFER'
    );
  }

  if (buffer.length === 0) {
    throw new PdfDocumentError(
      'The PDF file is empty.',
      'EMPTY_PDF'
    );
  }

  if (buffer.length > maximumBytes) {
    throw new PdfDocumentError(
      `The PDF exceeds the ${Math.round(
        maximumBytes / 1024 / 1024
      )} MB local import limit.`,
      'PDF_TOO_LARGE',
      413
    );
  }

  if (
    buffer.subarray(0, 5).toString('ascii') !==
    '%PDF-'
  ) {
    throw new PdfDocumentError(
      'The file does not have a valid PDF signature.',
      'INVALID_PDF_SIGNATURE'
    );
  }

  return buffer;
}

function hashPdf(buffer) {
  return createHash('sha256')
    .update(buffer)
    .digest('hex');
}

function stripGeneratedPageMarkers(text) {
  return String(text || '')
    .replace(
      /--\s*\d+\s+of\s+\d+\s*--/gi,
      ''
    )
    .trim();
}

function hasMeaningfulText(text) {
  const symbols =
    stripGeneratedPageMarkers(text).match(
      /[\p{L}\p{M}\p{N}]/gu
    ) || [];

  return symbols.length >= 6;
}

function defaultParserFactory(buffer) {
  let PDFParse;

  try {
    ({ PDFParse } = require('pdf-parse'));
  } catch (error) {
    throw new PdfDocumentError(
      'PDF extraction is not installed. Run npm install in the server folder.',
      'PDF_EXTRACTOR_MISSING',
      503
    );
  }

  return new PDFParse({ data: buffer });
}

async function extractPdfPages(
  buffer,
  {
    parserFactory = defaultParserFactory,
    maximumBytes = DEFAULT_MAX_PDF_BYTES,
    maximumPages = DEFAULT_MAX_PAGES,
  } = {}
) {
  validatePdfBuffer(buffer, maximumBytes);
  const parser = await parserFactory(buffer);

  try {
    const information = await parser.getInfo();
    const totalPages = Number(information?.total);

    if (
      !Number.isInteger(totalPages) ||
      totalPages < 1
    ) {
      throw new PdfDocumentError(
        'The PDF page count could not be read.',
        'PDF_PAGE_COUNT_UNAVAILABLE',
        422
      );
    }

    if (totalPages > maximumPages) {
      throw new PdfDocumentError(
        `The PDF has ${totalPages} pages; the current limit is ${maximumPages}.`,
        'PDF_PAGE_LIMIT_EXCEEDED',
        413
      );
    }

    const pages = [];

    for (
      let pageNumber = 1;
      pageNumber <= totalPages;
      pageNumber += 1
    ) {
      const result = await parser.getText({
        partial: [pageNumber],
      });

      pages.push({
        pageNumber,
        text: stripGeneratedPageMarkers(
          result?.text
        ),
      });
    }

    return {
      pageCount: totalPages,
      pages,
      sha256: hashPdf(buffer),
    };
  } catch (error) {
    if (error instanceof PdfDocumentError) {
      throw error;
    }

    throw new PdfDocumentError(
      'The PDF could not be safely extracted.',
      'PDF_EXTRACTION_FAILED',
      422
    );
  } finally {
    await parser?.destroy?.();
  }
}

module.exports = {
  DEFAULT_MAX_PDF_BYTES,
  DEFAULT_MAX_PAGES,
  PdfDocumentError,
  defaultParserFactory,
  extractPdfPages,
  hasMeaningfulText,
  hashPdf,
  stripGeneratedPageMarkers,
  validatePdfBuffer,
};
