const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  strFromU8,
  unzipSync,
} = require('fflate');

const BANBEIS_2024_DIRECTORY_PAGE =
  'https://banbeis.gov.bd/';

function cleanCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (
    typeof value === 'object' &&
    typeof value.text === 'string'
  ) {
    return value.text.trim();
  }

  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizedHeader(value) {
  return cleanCell(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const headers = row.map(normalizedHeader);

    return (
      headers.includes('EIIN_NO') &&
      headers.includes('INSTITUTE_NAME')
    );
  });
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(
        Number.parseInt(decimal, 10)
      )
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function textNodes(xml) {
  return [
    ...String(xml || '').matchAll(
      /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi
    ),
  ]
    .map((match) => decodeXml(match[1]))
    .join('');
}

function sharedStringsFrom(xml) {
  if (!xml) {
    return [];
  }

  return [
    ...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi),
  ].map((match) => textNodes(match[1]));
}

function columnIndex(reference) {
  const letters =
    String(reference || '').match(/^[A-Z]+/i)?.[0] || '';

  return [...letters.toUpperCase()].reduce(
    (total, letter) =>
      total * 26 + letter.charCodeAt(0) - 64,
    0
  ) - 1;
}

function rowsFromWorksheetXml(
  worksheetXml,
  sharedStrings = []
) {
  const rows = [];

  for (const rowMatch of worksheetXml.matchAll(
    /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi
  )) {
    const row = [];

    for (const cellMatch of rowMatch[1].matchAll(
      /<c\b([^>]*)>([\s\S]*?)<\/c>/gi
    )) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference =
        attributes.match(/\br="([^"]+)"/i)?.[1] || '';
      const type =
        attributes.match(/\bt="([^"]+)"/i)?.[1] || '';
      const rawValue =
        body.match(/<v>([\s\S]*?)<\/v>/i)?.[1] || '';
      const index = columnIndex(reference);
      let value = decodeXml(rawValue);

      if (type === 's') {
        value =
          sharedStrings[Number.parseInt(value, 10)] || '';
      } else if (type === 'inlineStr') {
        value = textNodes(body);
      }

      if (index >= 0) {
        row[index] = value;
      }
    }

    rows.push(row);
  }

  return rows;
}

function parseBanbeisWorkbookRows(
  rows,
  {
    category = 'Bangladesh education institution',
    sourceUrl = BANBEIS_2024_DIRECTORY_PAGE,
    sourceYear = '2024',
  } = {}
) {
  const headerIndex = findHeaderRow(rows);

  if (headerIndex < 0) {
    throw new Error(
      'The BANBEIS workbook did not contain EIIN_NO and INSTITUTE_NAME columns.'
    );
  }

  const headers = rows[headerIndex].map(normalizedHeader);
  const schools = [];
  const warnings = [];

  for (
    let rowIndex = headerIndex + 1;
    rowIndex < rows.length;
    rowIndex += 1
  ) {
    const values = rows[rowIndex];
    const record = Object.fromEntries(
      headers.map((header, index) => [
        header,
        cleanCell(values[index]),
      ])
    );
    const eiin = record.EIIN_NO.replace(/\D/g, '');
    const name = record.INSTITUTE_NAME;

    if (!eiin || !name) {
      if (values.some((value) => cleanCell(value))) {
        warnings.push(
          `Skipped workbook row ${rowIndex + 1} because EIIN or institution name was missing.`
        );
      }
      continue;
    }

    schools.push({
      id: `banbeis-${eiin}`,
      eiin,
      name,
      district: record.DISTRICT_NAME,
      upazila: record.THANA_NAME,
      address: record.POST_OFFICE_NAME,
      source: `BANBEIS 2024 ${category}`,
      sourceYear,
      sourceUrl,
      institutionType:
        record.INSTITUTE_TYPE_NAME || category,
      educationLevel: record.EDUCATION_LEVEL_NAME,
    });
  }

  return {
    schools,
    warnings,
  };
}

async function parseBanbeisWorkbook(
  filePath,
  options = {}
) {
  const archive = unzipSync(
    new Uint8Array(
      readFileSync(path.resolve(filePath))
    )
  );
  const worksheetPath = Object.keys(archive).find(
    (entry) =>
      /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry)
  );

  if (!worksheetPath) {
    throw new Error(
      'The BANBEIS workbook did not contain a worksheet.'
    );
  }
  const worksheetXml = strFromU8(
    archive[worksheetPath]
  );
  const sharedStrings = archive['xl/sharedStrings.xml']
    ? sharedStringsFrom(
        strFromU8(archive['xl/sharedStrings.xml'])
      )
    : [];

  return parseBanbeisWorkbookRows(
    rowsFromWorksheetXml(
      worksheetXml,
      sharedStrings
    ),
    options
  );
}

module.exports = {
  BANBEIS_2024_DIRECTORY_PAGE,
  cleanCell,
  columnIndex,
  decodeXml,
  findHeaderRow,
  normalizedHeader,
  parseBanbeisWorkbook,
  parseBanbeisWorkbookRows,
  rowsFromWorksheetXml,
  sharedStringsFrom,
  textNodes,
};
