const path = require('node:path');

const {
  parseBanbeisWorkbook,
} = require('../src/catalog/banbeis-workbook');
const {
  createSchoolStore,
} = require('../src/storage/schools');

const CATEGORY_BY_FILE = Object.freeze({
  'banbeis-schools-2024.xlsx': 'schools',
  'banbeis-school-college-2024.xlsx':
    'schools and colleges',
  'banbeis-madrasah-2024.xlsx': 'madrasahs',
  'banbeis-government-technical-2024.xlsx':
    'government technical institutions',
  'banbeis-independent-technical-2024.xlsx':
    'technical institutions',
});

function parseArguments(values) {
  const files = [];

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];

    if (item === '--help') {
      return { help: true, files };
    }

    if (item === '--file' && values[index + 1]) {
      files.push(path.resolve(values[index + 1]));
      index += 1;
    }
  }

  return { help: false, files };
}

function usage() {
  return [
    'Import official BANBEIS workbook directories into Slickk.',
    '',
    'Usage:',
    '  node scripts/import-banbeis-workbooks.js --file <workbook.xlsx> [--file <workbook.xlsx> ...]',
    '',
    'Supported 2024 lists: schools, school-and-colleges, madrasahs, and technical institutions.',
    'Students can still choose “Other / My school is not listed” when an institution is absent.',
  ].join('\n');
}

async function main() {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  if (args.files.length === 0) {
    throw new Error(
      'Provide at least one official BANBEIS workbook with --file.'
    );
  }

  const byEiin = new Map();
  const warnings = [];
  const files = [];

  for (const file of args.files) {
    const fileName = path.basename(file).toLowerCase();
    const category =
      CATEGORY_BY_FILE[fileName] ||
      'education institutions';
    const parsed = await parseBanbeisWorkbook(file, {
      category,
      sourceUrl: 'https://banbeis.gov.bd/',
      sourceYear: '2024',
    });

    for (const school of parsed.schools) {
      byEiin.set(school.eiin, school);
    }

    warnings.push(...parsed.warnings);
    files.push({
      file,
      category,
      parsedCount: parsed.schools.length,
    });
  }

  const store = createSchoolStore();

  try {
    const imported = store.importSchools([
      ...byEiin.values(),
    ]);

    console.log(
      JSON.stringify(
        {
          ok: true,
          files,
          uniqueInstitutionCount: byEiin.size,
          warningCount: warnings.length,
          sampleWarnings: warnings.slice(0, 10),
          directory: imported,
          source: 'BANBEIS education institution lists',
          sourceYear: '2024',
          primaryDirectory:
            'Use the official DPE IPEMIS primary-school directory; bulk local import is not yet available.',
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
        code: 'BANBEIS_WORKBOOK_IMPORT_FAILED',
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
