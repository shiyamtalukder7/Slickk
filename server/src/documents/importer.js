const { readFile } = require('node:fs/promises');

const {
  extractPdfPages,
  hasMeaningfulText,
  hashPdf,
  validatePdfBuffer,
} = require('./pdf');
const {
  ocrLanguagesFromLabel,
  ocrPdfPages,
} = require('./ocr');
const {
  createCurriculumStore,
} = require('../storage/curriculum');

const REQUIRED_METADATA = Object.freeze([
  'title',
  'academicYear',
  'grade',
  'subject',
  'language',
  'rights',
]);

function validateImportMetadata(metadata) {
  const missing = REQUIRED_METADATA.filter(
    (name) =>
      !String(metadata?.[name] || '').trim()
  );

  if (missing.length > 0) {
    const error = new Error(
      `Missing document metadata: ${missing.join(', ')}`
    );
    error.code = 'DOCUMENT_METADATA_REQUIRED';
    throw error;
  }

  return metadata;
}

async function importPdfBuffer({
  buffer,
  metadata,
  replace = false,
  noOcr = false,
  ocrLanguage,
  maximumBytes,
  store,
  createStore = createCurriculumStore,
  extractPages = extractPdfPages,
  recognizePages = ocrPdfPages,
  onProgress = () => {},
}) {
  validateImportMetadata(metadata);
  validatePdfBuffer(buffer, maximumBytes);
  const inputHash = hashPdf(buffer);
  const ownedStore = store || createStore();

  try {
    const existing =
      !replace &&
      ownedStore.findDocumentByHash?.(
        inputHash
      );

    if (existing) {
      const entitlements =
        ownedStore.grantDocumentEntitlements?.(
          existing.id,
          metadata.access,
          existing.rights
        ) || [];

      onProgress({
        phase: 'duplicate',
        document: existing,
      });

      return {
        document: existing,
        duplicate: true,
        replaced: false,
        sha256: inputHash,
        pageCount: existing.pageCount,
        ocrPageCount: 0,
        pagesNeedingOcr: 0,
        entitlements,
      };
    }

    onProgress({
      phase: 'extracting',
    });
    const extracted = await extractPages(
      buffer,
      {
        maximumBytes,
      }
    );
    let pages = extracted.pages;
    const pagesNeedingOcr = pages
      .filter(
        (page) => !hasMeaningfulText(page.text)
      )
      .map((page) => page.pageNumber);
    let ocrPageCount = 0;

    if (
      pagesNeedingOcr.length > 0 &&
      !noOcr
    ) {
      const languages = ocrLanguagesFromLabel(
        metadata.language,
        ocrLanguage
      );

      onProgress({
        phase: 'ocr-required',
        pageCount: extracted.pageCount,
        ocrPageCount: pagesNeedingOcr.length,
        languages,
      });
      const ocrResult = await recognizePages(
        buffer,
        {

          maximumBytes,          pageNumbers: pagesNeedingOcr,
          languages,
          onProgress(progress) {
            onProgress({
              ...progress,
              phase:
                progress.phase ===
                'initializing'
                  ? 'ocr-initializing'
                  : 'ocr-recognizing',
            });
          },
        }
      );
      const ocrByPage = new Map(
        ocrResult.pages.map((page) => [
          page.pageNumber,
          page,
        ])
      );

      pages = pages.map((page) => {
        const recognized = ocrByPage.get(
          page.pageNumber
        );

        return {
          pageNumber: page.pageNumber,
          text: recognized?.text ?? page.text,
          regions: recognized?.regions || [],
        };
      });
      ocrPageCount = ocrResult.pages.length;
    }

    onProgress({
      phase: 'indexing',
      pageCount: extracted.pageCount,
    });
    const result = ownedStore.importDocument({
      sha256: extracted.sha256,
      pageCount: extracted.pageCount,
      pages,
      replace,
      metadata,
    });

    onProgress({
      phase: 'complete',
      duplicate: result.duplicate,
      replaced: result.replaced,
    });

    return {
      ...result,
      sha256: extracted.sha256,
      pageCount: extracted.pageCount,
      ocrPageCount,
      pagesNeedingOcr:
        pagesNeedingOcr.length,
    };
  } finally {
    if (!store) {
      ownedStore.close();
    }
  }
}

async function importPdfFile({
  filePath,
  ...options
}) {
  const buffer = await readFile(filePath);
  const result = await importPdfBuffer({
    ...options,
    buffer,
  });

  return {
    ...result,
    filePath,
  };
}

module.exports = {
  REQUIRED_METADATA,
  importPdfBuffer,
  importPdfFile,
  validateImportMetadata,
};
