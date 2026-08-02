const { mkdirSync } = require('node:fs');
const path = require('node:path');

const { config } = require('../config');
const {
  defaultParserFactory,
  hashPdf,
  PdfDocumentError,
  validatePdfBuffer,
} = require('./pdf');
const {
  regionsFromRecognition,
} = require('./analysis');

const DEFAULT_OCR_WIDTH = 1600;

class OcrDocumentError extends Error {
  constructor(message, code, status = 422) {
    super(message);
    this.name = 'OcrDocumentError';
    this.code = code;
    this.status = status;
  }
}

function ocrLanguagesFromLabel(
  languageLabel,
  explicitLanguages
) {
  if (explicitLanguages) {
    const parsed = String(explicitLanguages)
      .toLowerCase()
      .split(/[+,\s]+/)
      .filter((code) => /^[a-z_]{3,12}$/.test(code));

    if (parsed.length > 0) {
      return [...new Set(parsed)];
    }
  }

  const label = String(languageLabel || '').toLowerCase();

  if (
    label.includes('bangla') ||
    label.includes('bengali') ||
    label.includes('বাংলা')
  ) {
    return ['ben', 'eng'];
  }

  return ['eng'];
}

async function defaultWorkerFactory(
  languages,
  logger
) {
  let createWorker;

  try {
    ({ createWorker } = require('tesseract.js'));
  } catch (error) {
    throw new OcrDocumentError(
      'OCR is not installed. Run npm install in the server folder.',
      'OCR_ENGINE_MISSING',
      503
    );
  }

  const cachePath = path.join(
    path.dirname(config.databasePath),
    'ocr-cache'
  );
  mkdirSync(cachePath, { recursive: true });

  return createWorker(languages, 1, {
    cachePath,
    logger,
  });
}

async function ocrPdfPages(
  buffer,
  {
    pageNumbers,
    languages = ['eng'],
    parserFactory = defaultParserFactory,
    workerFactory = defaultWorkerFactory,
    desiredWidth = DEFAULT_OCR_WIDTH,
    onProgress = () => {},
  } = {}
) {
  validatePdfBuffer(buffer);
  const parser = await parserFactory(buffer);
  let worker;

  try {
    const information = await parser.getInfo();
    const totalPages = Number(information?.total);

    if (
      !Number.isInteger(totalPages) ||
      totalPages < 1
    ) {
      throw new OcrDocumentError(
        'The PDF page count could not be read for OCR.',
        'OCR_PAGE_COUNT_UNAVAILABLE'
      );
    }

    const selectedPages = [
      ...new Set(
        (pageNumbers || []).map(Number)
      ),
    ]
      .filter(
        (pageNumber) =>
          Number.isInteger(pageNumber) &&
          pageNumber >= 1 &&
          pageNumber <= totalPages
      )
      .sort((left, right) => left - right);

    if (selectedPages.length === 0) {
      return {
        pageCount: totalPages,
        pages: [],
        sha256: hashPdf(buffer),
      };
    }

    onProgress({
      phase: 'initializing',
      completedPages: 0,
      totalPages: selectedPages.length,
    });
    worker = await workerFactory(
      languages,
      () => {}
    );
    const pages = [];

    for (
      let index = 0;
      index < selectedPages.length;
      index += 1
    ) {
      const pageNumber = selectedPages[index];
      const screenshot =
        await parser.getScreenshot({
          partial: [pageNumber],
          desiredWidth,
          imageDataUrl: false,
          imageBuffer: true,
        });
      const image = screenshot?.pages?.[0]?.data;

      if (!image) {
        throw new OcrDocumentError(
          `Page ${pageNumber} could not be rendered for OCR.`,
          'OCR_PAGE_RENDER_FAILED'
        );
      }

      const recognition = await worker.recognize(
        Buffer.from(image)
      );

      pages.push({
        pageNumber,
        text: String(
          recognition?.data?.text || ''
        ).trim(),
        regions: regionsFromRecognition(
          recognition,
          pageNumber
        ),
      });
      onProgress({
        phase: 'recognizing',
        pageNumber,
        completedPages: index + 1,
        totalPages: selectedPages.length,
      });
    }

    return {
      pageCount: totalPages,
      pages,
      sha256: hashPdf(buffer),
    };
  } catch (error) {
    if (
      error instanceof OcrDocumentError ||
      error instanceof PdfDocumentError
    ) {
      throw error;
    }

    throw new OcrDocumentError(
      'The scanned PDF could not be processed by the local OCR engine.',
      'OCR_FAILED'
    );
  } finally {
    await worker?.terminate?.();
    await parser?.destroy?.();
  }
}

async function ocrImageBuffer(
  buffer,
  {
    languages = ['eng'],
    workerFactory = defaultWorkerFactory,
  } = {}
) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new OcrDocumentError(
      'The image file is empty.',
      'EMPTY_IMAGE',
      400
    );
  }

  let worker;

  try {
    worker = await workerFactory(languages, () => {});
    const recognition = await worker.recognize(buffer);

    return {
      pageNumber: 1,
      text: String(recognition?.data?.text || '').trim(),
      regions: regionsFromRecognition(recognition, 1),
    };
  } catch (error) {
    if (error instanceof OcrDocumentError) {
      throw error;
    }

    throw new OcrDocumentError(
      'The image could not be processed by the local OCR engine.',
      'IMAGE_OCR_FAILED'
    );
  } finally {
    await worker?.terminate?.();
  }
}

module.exports = {
  DEFAULT_OCR_WIDTH,
  OcrDocumentError,
  defaultWorkerFactory,
  ocrLanguagesFromLabel,
  ocrImageBuffer,
  ocrPdfPages,
};
