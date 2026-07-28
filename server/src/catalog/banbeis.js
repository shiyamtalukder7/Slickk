const BANBEIS_SCHOOL_DIRECTORY_URL =
  'https://banbeis.gov.bd/sites/default/files/files/banbeis.portal.gov.bd/page/9f4844bb_6b8a_471c_96e2_b27b3e3af175/LIST%20OF%20INSTITUTUTE1%281%29.pdf';

function cleanLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function valueAfterLabel(lines, label) {
  const line = lines.find((item) =>
    item.toLowerCase().startsWith(label.toLowerCase())
  );

  if (!line) {
    return '';
  }

  return cleanLine(line.slice(line.indexOf(':') + 1));
}

function indexOfLabel(lines, label, start = 0) {
  return lines.findIndex(
    (line, index) =>
      index >= start &&
      line.toLowerCase() === label.toLowerCase()
  );
}

function parseBanbeisSchoolPage(page) {
  const lines = String(page?.text || '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
  const eiinHeader = indexOfLabel(lines, 'Eiin');
  const nameHeader = indexOfLabel(
    lines,
    'Name of the Institution',
    eiinHeader + 1
  );
  const mobileHeader = indexOfLabel(
    lines,
    'Mobile',
    nameHeader + 1
  );
  const addressHeader = lines.findIndex(
    (line, index) =>
      index > mobileHeader &&
      /^Vil\/Road/i.test(line)
  );

  if (
    eiinHeader < 0 ||
    nameHeader <= eiinHeader ||
    mobileHeader <= nameHeader
  ) {
    return {
      schools: [],
      warning: `Page ${page?.pageNumber || '?'} did not contain a recognized BANBEIS table.`,
    };
  }

  const eiins = lines
    .slice(
      lines.lastIndexOf('Slno', eiinHeader) + 1,
      eiinHeader
    )
    .filter((line) => /^\d{6}$/.test(line));
  const names = lines
    .slice(eiinHeader + 1, nameHeader)
    .filter(
      (line) =>
        line.length >= 2 &&
        !/^\d+$/.test(line)
    );
  const addresses =
    addressHeader > mobileHeader
      ? lines.slice(mobileHeader + 1, addressHeader)
      : [];
  const district = valueAfterLabel(lines, 'District:');
  const upazila = valueAfterLabel(
    lines,
    'Upazila/Thana:'
  );
  const rowCount = Math.min(eiins.length, names.length);
  const schools = [];

  for (let index = 0; index < rowCount; index += 1) {
    const eiin = eiins[index];

    schools.push({
      id: `banbeis-${eiin}`,
      eiin,
      name: names[index],
      district,
      upazila,
      address: addresses[index] || '',
      source: 'BANBEIS institute directory',
      sourceYear: '2015',
      sourceUrl: BANBEIS_SCHOOL_DIRECTORY_URL,
    });
  }

  return {
    schools,
    warning:
      eiins.length === names.length
        ? null
        : `Page ${page?.pageNumber || '?'} had ${eiins.length} EIIN values and ${names.length} institution names; ${rowCount} matched rows were retained.`,
  };
}

function parseBanbeisSchoolPages(pages) {
  const byEiin = new Map();
  const warnings = [];

  for (const page of pages || []) {
    const parsed = parseBanbeisSchoolPage(page);

    for (const school of parsed.schools) {
      byEiin.set(school.eiin, school);
    }

    if (parsed.warning) {
      warnings.push(parsed.warning);
    }
  }

  return {
    schools: [...byEiin.values()],
    warnings,
  };
}

module.exports = {
  BANBEIS_SCHOOL_DIRECTORY_URL,
  parseBanbeisSchoolPage,
  parseBanbeisSchoolPages,
};
