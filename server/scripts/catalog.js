const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const {
  discoverNctbCatalogs,
} = require('../src/catalog/nctb');
const {
  BANGLADESH_CURRICULA,
} = require('../src/catalog/registry');
const {
  syncCatalogBooks,
} = require('../src/catalog/sync');

function parseArguments(values) {
  const result = {
    command: values[0] || 'help',
  };
  const booleanFlags = new Set([
    'dry-run',
    'force',
    'no-ocr',
    'offline',
    'no-bootstrap',
  ]);

  for (let index = 1; index < values.length; index += 1) {
    const item = values[index];

    if (!item.startsWith('--')) {
      continue;
    }

    const key = item.slice(2);

    if (booleanFlags.has(key)) {
      result[key] = true;
      continue;
    }

    result[key] = values[index + 1];
    index += 1;
  }

  return result;
}

function usage() {
  return [
    'Slickk Bangladesh curriculum catalog',
    '',
    'Commands:',
    '  registry',
    '  discover [--grade "Class 6"] [--version "English Version"]',
    '           [--offline] [--no-bootstrap] [--timeout-ms 20000]',
    '  sync [--grade "Class 1"] [--version "English Version"]',
    '       [--subject Mathematics] [--limit 1] [--dry-run]',
    '       [--no-ocr] [--ocr-language ben+eng] [--force]',
    '',
    'The discover command reads official NCTB catalogs and creates:',
    '  server/data/curriculum-catalog.json',
    '',
    'Discovery does not download or OCR textbooks.',
    'If live NCTB access fails, a verified official snapshot is used.',
    'Sync is sequential, resumable, rights-checked, and limited to 10 books per run.',
  ].join('\n');
}

function filterBooks(books, args) {
  const grade = String(args.grade || '')
    .trim()
    .toLowerCase();
  const version = String(args.version || '')
    .trim()
    .toLowerCase();

  return books.filter(
    (book) =>
      (!grade ||
        book.grade.toLowerCase() === grade) &&
      (!version ||
        book.version.toLowerCase() === version)
  );
}

async function discover(args) {
  const timeoutMs = Number.parseInt(
    args['timeout-ms'] || '20000',
    10
  );
  const result = await discoverNctbCatalogs({
    offline: Boolean(args.offline),
    allowBootstrap: !args['no-bootstrap'],
    timeoutMs:
      Number.isFinite(timeoutMs) &&
      timeoutMs >= 1000
        ? timeoutMs
        : 20000,
    onProgress(progress) {
      if (progress.catalog) {
        console.error(
          `Reading ${progress.catalog.grade} (${progress.completed + 1}/${progress.total})...`
        );
      }
    },
  });
  const books = filterBooks(result.books, args);
  const outputPath = path.join(
    __dirname,
    '..',
    'data',
    'curriculum-catalog.json'
  );
  const manifest = {
    schemaVersion: 1,
    country: 'Bangladesh',
    generatedAt: new Date().toISOString(),
    source: 'Official NCTB catalogs',
    bookCount: books.length,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    sources: result.sources,
    bootstrap: result.bootstrap,
    books,
    errors: result.errors,
    warnings: result.warnings,
  };

  await mkdir(path.dirname(outputPath), {
    recursive: true,
  });
  await writeFile(
    outputPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        ok: result.errors.length === 0,
        outputPath,
        bookCount: books.length,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        sources: result.sources,
        byVersion: {
          bangla: books.filter(
            (book) =>
              book.version === 'Bangla Version'
          ).length,
          english: books.filter(
            (book) =>
              book.version === 'English Version'
          ).length,
        },
        errors: result.errors,
        warnings: result.warnings,
      },
      null,
      2
    )
  );
}

async function sync(args) {
  const serverRoot = path.join(__dirname, '..');
  const manifestPath = path.resolve(
    args.manifest ||
      path.join(
        serverRoot,
        'data',
        'curriculum-catalog.json'
      )
  );
  const statePath = path.resolve(
    args.state ||
      path.join(
        serverRoot,
        'data',
        'curriculum-sync.json'
      )
  );
  const booksDirectory = path.resolve(
    args['books-dir'] ||
      path.join(serverRoot, 'books', 'catalog')
  );
  const result = await syncCatalogBooks({
    manifestPath,
    statePath,
    booksDirectory,
    filters: {
      grade: args.grade,
      version: args.version,
      subject: args.subject,
      language: args.language,
    },
    limit: args.limit || 1,
    force: Boolean(args.force),
    dryRun: Boolean(args['dry-run']),
    noOcr: Boolean(args['no-ocr']),
    ocrLanguage:
      args['ocr-language'] || 'ben+eng',
    onProgress(progress) {
      if (progress.phase === 'starting') {
        console.error(
          `Syncing ${progress.index}/${progress.total}: ${progress.book.grade} - ${progress.book.title} (${progress.book.version})`
        );
        return;
      }

      if (
        progress.phase === 'downloaded' ||
        progress.phase === 'download-reused'
      ) {
        console.error(
          progress.phase === 'downloaded'
            ? 'Official PDF downloaded and verified.'
            : 'Using the previously verified local PDF.'
        );
        return;
      }

      if (progress.phase === 'ocr-required') {
        console.error(
          `OCR is required for ${progress.ocrPageCount} of ${progress.pageCount} pages using ${progress.languages.join('+')}.`
        );
        return;
      }

      if (
        progress.phase === 'ocr-initializing'
      ) {
        console.error(
          'Initializing the local OCR engine...'
        );
        return;
      }

      if (
        progress.phase === 'ocr-recognizing' &&
        (progress.completedPages === 1 ||
          progress.completedPages % 10 === 0 ||
          progress.completedPages ===
            progress.totalPages)
      ) {
        console.error(
          `OCR pages: ${progress.completedPages}/${progress.totalPages}`
        );
        return;
      }

      if (progress.phase === 'failed') {
        console.error(
          `Failed: ${progress.error.code} - ${progress.error.message}`
        );
      }
    },
  });

  console.log(
    JSON.stringify(
      {
        ...result,
        manifestPath,
        statePath,
        booksDirectory,
      },
      null,
      2
    )
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArguments(
    process.argv.slice(2)
  );

  if (args.command === 'registry') {
    console.log(
      JSON.stringify(
        {
          country: 'Bangladesh',
          curricula: BANGLADESH_CURRICULA,
        },
        null,
        2
      )
    );
    return;
  }

  if (args.command === 'discover') {
    await discover(args);
    return;
  }

  if (args.command === 'sync') {
    await sync(args);
    return;
  }

  console.log(usage());
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: error.code || 'CATALOG_COMMAND_FAILED',
        error: error.message,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
