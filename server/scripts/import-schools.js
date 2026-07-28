const { readFile } = require('node:fs/promises');
const path = require('node:path');

const {
  BANBEIS_SCHOOL_DIRECTORY_URL,
  parseBanbeisSchoolPages,
} = require('../src/catalog/banbeis');
const {
  extractPdfPages,
} = require('../src/documents/pdf');
const {
  createSchoolStore,
} = require('../src/storage/schools');

function parseArguments(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];

    if (!item.startsWith('--')) {
      continue;
    }

    const key = item.slice(2);

    if (key === 'help') {
      result.help = true;
      continue;
    }

    result[key] = values[index + 1];
    index += 1;
  }

  return result;
}

function usage() {
  return [
    'Import the official BANBEIS institute directory into Slickk.',
    '',
    'Required:',
    '  --file <path to official BANBEIS PDF>',
    '',
    `Official source: ${BANBEIS_SCHOOL_DIRECTORY_URL}`,
    '',
    'The source is labelled with its publication year. Students can always enter a newer or non-EIIN school manually.',
  ].join('\n');
}

async function main() {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!String(args.file || '').trim()) {
    throw new Error('Missing required option: --file');
  }

  const filePath = path.resolve(args.file);
  const buffer = await readFile(filePath);
  const extracted = await extractPdfPages(buffer, {
    maximumBytes: 120 * 1024 * 1024,
    maximumPages: 1500,
  });
  const parsed = parseBanbeisSchoolPages(extracted.pages);

  if (parsed.schools.length === 0) {
    throw new Error(
      'No BANBEIS school rows could be recognized in this PDF.'
    );
  }

  const store = createSchoolStore();

  try {
    const imported = store.importSchools(parsed.schools);

    console.log(
      JSON.stringify(
        {
          ok: true,
          file: filePath,
          pageCount: extracted.pageCount,
          parsedSchoolCount: parsed.schools.length,
          warningCount: parsed.warnings.length,
          sampleWarnings: parsed.warnings.slice(0, 10),
          directory: imported,
          sourceUrl: BANBEIS_SCHOOL_DIRECTORY_URL,
          sourceYear: '2015',
        },
        null,
        2
      )
    );
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: error.code || 'SCHOOL_IMPORT_FAILED',
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
