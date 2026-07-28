const {
  mkdir,
  readFile,
  rename,
  writeFile,
} = require('node:fs/promises');
const path = require('node:path');

const {
  importPdfBuffer,
} = require('../documents/importer');
const {
  DEFAULT_MAX_PDF_BYTES,
  PdfDocumentError,
  validatePdfBuffer,
} = require('../documents/pdf');
const {
  createCurriculumStore,
} = require('../storage/curriculum');
const {
  ALLOWED_DOWNLOAD_HOSTS,
  toDirectDownloadUrl,
} = require('./nctb');

const COMPLETED_SYNC_STATUSES = new Set([
  'imported',
  'duplicate',
]);
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120000;
const DEFAULT_SYNC_LIMIT = 1;
const MAX_SYNC_LIMIT = 10;

class CatalogSyncError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'CatalogSyncError';
    this.code = code;
    this.status = status;
  }
}

function normalizedFilter(value) {
  return String(value || '').trim().toLowerCase();
}

function filterCatalogBooks(
  books,
  {
    grade,
    version,
    subject,
    language,
  } = {}
) {
  const filters = {
    grade: normalizedFilter(grade),
    version: normalizedFilter(version),
    subject: normalizedFilter(subject),
    language: normalizedFilter(language),
  };

  return books.filter((book) =>
    Object.entries(filters).every(
      ([field, expected]) =>
        !expected ||
        normalizedFilter(book[field]) === expected
    )
  );
}

function syncLimit(value) {
  const candidate =
    value === undefined ||
    value === null ||
    value === ''
      ? DEFAULT_SYNC_LIMIT
      : value;
  const parsed = Number.parseInt(
    candidate,
    10
  );

  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new CatalogSyncError(
      'The sync limit must be a positive number.',
      'INVALID_SYNC_LIMIT'
    );
  }

  return Math.min(MAX_SYNC_LIMIT, parsed);
}

function validateCatalogBook(book) {
  if (
    book?.provider !== 'NCTB' ||
    book?.country !== 'Bangladesh' ||
    book?.curriculum !== 'NCTB'
  ) {
    throw new CatalogSyncError(
      'Automatic sync accepts only verified Bangladesh NCTB catalog records.',
      'UNVERIFIED_CATALOG_PROVIDER'
    );
  }

  if (book.rights !== 'official-public') {
    throw new CatalogSyncError(
      'Automatic sync requires official-public document rights.',
      'CATALOG_RIGHTS_REQUIRED'
    );
  }

  let source;

  try {
    source = new URL(book.sourceUrl);
  } catch {
    throw new CatalogSyncError(
      'The catalog record has no valid official source URL.',
      'INVALID_CATALOG_SOURCE'
    );
  }

  if (source.hostname !== 'nctb.gov.bd') {
    throw new CatalogSyncError(
      'The catalog source is not an official NCTB page.',
      'UNVERIFIED_CATALOG_SOURCE'
    );
  }

  const downloadUrl = toDirectDownloadUrl(
    book.downloadUrl
  );

  if (!downloadUrl) {
    throw new CatalogSyncError(
      'The textbook download host is not verified.',
      'UNVERIFIED_DOWNLOAD_HOST'
    );
  }

  return {
    ...book,
    downloadUrl,
  };
}

function catalogBookFileName(book) {
  const safeId = String(book.id || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 80);

  if (!safeId) {
    throw new CatalogSyncError(
      'The catalog record has no safe identifier.',
      'INVALID_CATALOG_ID'
    );
  }

  return `${safeId}.pdf`;
}

async function responseBufferWithLimit(
  response,
  maximumBytes
) {
  const declaredLength = Number.parseInt(
    response.headers?.get?.('content-length') ||
      '0',
    10
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maximumBytes
  ) {
    throw new CatalogSyncError(
      'The remote PDF exceeds the local download limit.',
      'REMOTE_PDF_TOO_LARGE',
      413
    );
  }

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let byteCount = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      byteCount += chunk.length;

      if (byteCount > maximumBytes) {
        await reader.cancel();
        throw new CatalogSyncError(
          'The remote PDF exceeded the local download limit.',
          'REMOTE_PDF_TOO_LARGE',
          413
        );
      }

      chunks.push(chunk);
    }

    return Buffer.concat(chunks, byteCount);
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (buffer.length > maximumBytes) {
    throw new CatalogSyncError(
      'The remote PDF exceeded the local download limit.',
      'REMOTE_PDF_TOO_LARGE',
      413
    );
  }

  return buffer;
}

async function downloadCatalogPdf(
  book,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
    maximumBytes = DEFAULT_MAX_PDF_BYTES,
  } = {}
) {
  const verified = validateCatalogBook(book);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetchImpl(
      verified.downloadUrl,
      {
        headers: {
          Accept:
            'application/pdf,application/octet-stream;q=0.9,*/*;q=0.5',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new CatalogSyncError(
        `The textbook download returned HTTP ${response.status}.`,
        'TEXTBOOK_DOWNLOAD_HTTP_ERROR',
        502
      );
    }

    if (response.url) {
      const finalUrl = new URL(response.url);

      if (
        !ALLOWED_DOWNLOAD_HOSTS.has(
          finalUrl.hostname
        )
      ) {
        throw new CatalogSyncError(
          'The textbook download redirected to an unverified host.',
          'UNVERIFIED_DOWNLOAD_REDIRECT'
        );
      }
    }

    const buffer = await responseBufferWithLimit(
      response,
      maximumBytes
    );

    validatePdfBuffer(buffer, maximumBytes);
    return {
      buffer,
      downloadUrl: verified.downloadUrl,
      finalUrl:
        response.url || verified.downloadUrl,
    };
  } catch (error) {
    if (
      error instanceof CatalogSyncError ||
      error instanceof PdfDocumentError
    ) {
      throw error;
    }

    throw new CatalogSyncError(
      'The official textbook could not be downloaded.',
      error?.name === 'AbortError'
        ? 'TEXTBOOK_DOWNLOAD_TIMEOUT'
        : 'TEXTBOOK_DOWNLOAD_FAILED',
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(
      await readFile(filePath, 'utf8')
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    if (error instanceof SyntaxError) {
      throw new CatalogSyncError(
        `The JSON file is invalid: ${filePath}`,
        'INVALID_SYNC_JSON'
      );
    }

    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });
  const temporaryPath = `${filePath}.tmp`;

  await writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
  await rename(temporaryPath, filePath);
}

async function loadCatalogManifest(filePath) {
  const manifest = await readJsonFile(
    filePath,
    null
  );

  if (
    !manifest ||
    !Array.isArray(manifest.books)
  ) {
    throw new CatalogSyncError(
      'Generate the curriculum catalog before syncing books.',
      'CURRICULUM_CATALOG_REQUIRED'
    );
  }

  return manifest;
}

function emptySyncState() {
  return {
    schemaVersion: 1,
    updatedAt: null,
    items: {},
  };
}

async function loadSyncState(filePath) {
  const state = await readJsonFile(
    filePath,
    emptySyncState()
  );

  if (
    state.schemaVersion !== 1 ||
    typeof state.items !== 'object' ||
    state.items === null
  ) {
    throw new CatalogSyncError(
      'The curriculum sync state is not supported.',
      'INVALID_SYNC_STATE'
    );
  }

  return state;
}

function pendingCatalogBooks(
  books,
  state,
  { force = false } = {}
) {
  if (force) {
    return books;
  }

  return books.filter(
    (book) =>
      !COMPLETED_SYNC_STATUSES.has(
        state.items[book.id]?.status
      )
  );
}

async function localOrDownloadedPdf(
  book,
  booksDirectory,
  options
) {
  await mkdir(booksDirectory, {
    recursive: true,
  });
  const filePath = path.join(
    booksDirectory,
    catalogBookFileName(book)
  );

  try {
    const existing = await readFile(filePath);

    validatePdfBuffer(existing);
    return {
      buffer: existing,
      filePath,
      reused: true,
      downloadUrl: book.downloadUrl,
      finalUrl: book.downloadUrl,
    };
  } catch (error) {
    if (
      error.code !== 'ENOENT' &&
      error.code !== 'INVALID_PDF_SIGNATURE' &&
      error.code !== 'EMPTY_PDF'
    ) {
      throw error;
    }
  }

  const downloaded = await downloadCatalogPdf(
    book,
    options
  );
  const temporaryPath = `${filePath}.download`;

  await writeFile(
    temporaryPath,
    downloaded.buffer
  );
  await rename(temporaryPath, filePath);

  return {
    ...downloaded,
    filePath,
    reused: false,
  };
}

function metadataFromCatalogBook(book) {
  return {
    title: book.title,
    curriculum: book.curriculum,
    academicYear: book.academicYear,
    grade: book.grade,
    subject: book.subject,
    language: book.language,
    version: book.version,
    sourceUrl: book.sourceUrl,
    rights: book.rights,
  };
}

function safeError(error) {
  return {
    code:
      error?.code || 'CATALOG_SYNC_FAILED',
    message:
      error?.message ||
      'The catalog item could not be synced.',
  };
}

async function syncCatalogBooks({
  manifestPath,
  statePath,
  booksDirectory,
  filters = {},
  limit = DEFAULT_SYNC_LIMIT,
  force = false,
  dryRun = false,
  noOcr = false,
  ocrLanguage = 'ben+eng',
  fetchImpl = fetch,
  createStore = createCurriculumStore,
  importBuffer = importPdfBuffer,
  onProgress = () => {},
}) {
  const manifest = await loadCatalogManifest(
    manifestPath
  );
  const state = await loadSyncState(statePath);
  const matching = filterCatalogBooks(
    manifest.books,
    filters
  );
  const pending = pendingCatalogBooks(
    matching,
    state,
    { force }
  );
  const selected = pending.slice(
    0,
    syncLimit(limit)
  );

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      matchingCount: matching.length,
      pendingCount: pending.length,
      selectedCount: selected.length,
      selected: selected.map((book) => ({
        id: book.id,
        title: book.title,
        grade: book.grade,
        subject: book.subject,
        version: book.version,
      })),
      importedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      results: [],
    };
  }

  const store = createStore();
  const results = [];

  try {
    for (
      let index = 0;
      index < selected.length;
      index += 1
    ) {
      const book = validateCatalogBook(
        selected[index]
      );
      const previous =
        state.items[book.id] || {};
      const startedAt = new Date().toISOString();

      state.items[book.id] = {
        ...previous,
        id: book.id,
        title: book.title,
        grade: book.grade,
        subject: book.subject,
        version: book.version,
        status: 'processing',
        attempts:
          Number(previous.attempts || 0) + 1,
        startedAt,
        updatedAt: startedAt,
      };
      state.updatedAt = startedAt;
      await writeJsonFile(statePath, state);
      onProgress({
        phase: 'starting',
        index: index + 1,
        total: selected.length,
        book,
      });

      try {
        const downloaded =
          await localOrDownloadedPdf(
            book,
            booksDirectory,
            { fetchImpl }
          );

        onProgress({
          phase: downloaded.reused
            ? 'download-reused'
            : 'downloaded',
          index: index + 1,
          total: selected.length,
          book,
          filePath: downloaded.filePath,
        });
        const imported = await importBuffer({
          buffer: downloaded.buffer,
          metadata:
            metadataFromCatalogBook(book),
          noOcr,
          ocrLanguage,
          store,
          onProgress(progress) {
            onProgress({
              ...progress,
              index: index + 1,
              total: selected.length,
              book,
            });
          },
        });
        const status = imported.duplicate
          ? 'duplicate'
          : 'imported';
        const completedAt =
          new Date().toISOString();
        const itemResult = {
          id: book.id,
          title: book.title,
          grade: book.grade,
          subject: book.subject,
          version: book.version,
          status,
          filePath: downloaded.filePath,
          sha256: imported.sha256,
          documentId: imported.document.id,
          pageCount: imported.pageCount,
          ocrPageCount: imported.ocrPageCount,
        };

        state.items[book.id] = {
          ...state.items[book.id],
          ...itemResult,
          completedAt,
          updatedAt: completedAt,
        };
        results.push(itemResult);
      } catch (error) {
        const failedAt = new Date().toISOString();
        const failure = safeError(error);
        const itemResult = {
          id: book.id,
          title: book.title,
          grade: book.grade,
          subject: book.subject,
          version: book.version,
          status: 'failed',
          error: failure,
        };

        state.items[book.id] = {
          ...state.items[book.id],
          ...itemResult,
          failedAt,
          updatedAt: failedAt,
        };
        results.push(itemResult);
        onProgress({
          phase: 'failed',
          index: index + 1,
          total: selected.length,
          book,
          error: failure,
        });
      }

      state.updatedAt = new Date().toISOString();
      await writeJsonFile(statePath, state);
    }
  } finally {
    store.close();
  }

  const importedCount = results.filter(
    (item) => item.status === 'imported'
  ).length;
  const duplicateCount = results.filter(
    (item) => item.status === 'duplicate'
  ).length;
  const failedCount = results.filter(
    (item) => item.status === 'failed'
  ).length;

  return {
    ok: failedCount === 0,
    dryRun: false,
    matchingCount: matching.length,
    pendingCount: pending.length,
    selectedCount: selected.length,
    importedCount,
    duplicateCount,
    failedCount,
    results,
  };
}

module.exports = {
  COMPLETED_SYNC_STATUSES,
  CatalogSyncError,
  DEFAULT_DOWNLOAD_TIMEOUT_MS,
  DEFAULT_SYNC_LIMIT,
  MAX_SYNC_LIMIT,
  catalogBookFileName,
  downloadCatalogPdf,
  emptySyncState,
  filterCatalogBooks,
  loadCatalogManifest,
  loadSyncState,
  metadataFromCatalogBook,
  pendingCatalogBooks,
  responseBufferWithLimit,
  safeError,
  syncCatalogBooks,
  syncLimit,
  validateCatalogBook,
  writeJsonFile,
};
