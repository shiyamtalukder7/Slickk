const path = require('node:path');

const {
  importPdfFile,
} = require('../src/documents/importer');

function parseArguments(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];

    if (!item.startsWith('--')) {
      continue;
    }

    const key = item.slice(2);

    if (
      key === 'help' ||
      key === 'replace' ||
      key === 'no-ocr'
    ) {
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
    'Import a legally permitted textbook PDF into Slickk.',
    '',
    'Required:',
    '  --file <path>',
    '  --title <book title>',
    '  --academic-year <year>',
    '  --grade <grade>',
    '  --subject <subject>',
    '  --language <language>',
    '  --rights <official-public|licensed-user-copy|public-domain|open-license>',
    '',
    'Optional:',
    '  --curriculum <name>       Default: NCTB',
    '  --version <name>          Example: English Version',
    '  --source-url <official URL>',
    '  --school-id <profile school ID>  Required for a school-licensed copy',
    '  --student-id <student ID>         Required for a family/student-licensed copy',
    '  --ocr-language <codes>   Example: eng+ben',
    '  --replace                Replace an earlier import of the same PDF',
    '  --no-ocr                 Do not OCR image-only pages',
  ].join('\n');
}

function requireArguments(args, names) {
  const missing = names.filter(
    (name) => !String(args[name] || '').trim()
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required options: ${missing
        .map((name) => `--${name}`)
        .join(', ')}`
    );
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  requireArguments(args, [
    'file',
    'title',
    'academic-year',
    'grade',
    'subject',
    'language',
    'rights',
  ]);

  if (
    args.rights === 'licensed-user-copy' &&
    !String(args['school-id'] || '').trim() &&
    !String(args['student-id'] || '').trim()
  ) {
    throw new Error(
      'A licensed user copy requires --school-id or --student-id.'
    );
  }

  const filePath = path.resolve(args.file);
  const result = await importPdfFile({
    filePath,
    replace: Boolean(args.replace),
    noOcr: Boolean(args['no-ocr']),
    ocrLanguage: args['ocr-language'],
    metadata: {
      title: args.title,
      curriculum: args.curriculum || 'NCTB',
      academicYear: args['academic-year'],
      grade: args.grade,
      subject: args.subject,
      language: args.language,
      version: args.version || 'Unspecified',
      sourceUrl: args['source-url'] || '',
      rights: args.rights,
      access: {
        schoolId: args['school-id'] || '',
        studentId: args['student-id'] || '',
      },
    },
    onProgress(progress) {
      if (progress.phase === 'ocr-required') {
        console.error(
          `OCR is required for ${progress.ocrPageCount} of ${progress.pageCount} pages using ${progress.languages.join('+')}.`
        );
        return;
      }

      if (progress.phase === 'ocr-initializing') {
        console.error(
          'Initializing the local OCR engine...'
        );
        return;
      }

      if (
        progress.phase === 'ocr-recognizing' &&
        (progress.completedPages === 1 ||
          progress.completedPages % 5 === 0 ||
          progress.completedPages ===
            progress.totalPages)
      ) {
        console.error(
          `OCR pages: ${progress.completedPages}/${progress.totalPages}`
        );
      }
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        duplicate: result.duplicate,
        replaced: result.replaced,
        file: filePath,
        document: result.document,
        processing: {
          pageCount: result.pageCount,
          ocrPageCount: result.ocrPageCount,
        },
        entitlements:
          result.entitlements || undefined,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: error.code || 'PDF_IMPORT_FAILED',
        error: error.message,
      },
      null,
      2
    )
  );
  console.error('');
  console.error(usage());
  process.exitCode = 1;
});
