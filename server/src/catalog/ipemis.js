const IPEMIS_PRIMARY_DIRECTORY_URL =
  'https://ipemis.dpe.gov.bd/search-school/?lang=en_EN';
const IPEMIS_PRIMARY_SEARCH_URL =
  'https://ipemis.dpe.gov.bd/load-lite-school-list';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function mapIpemisSchool(record) {
  const schoolId = cleanText(record?.schoolId);
  const schoolCode = cleanText(record?.schoolCode);

  if (!schoolId || !cleanText(record?.schoolName)) {
    return null;
  }

  return {
    id: `ipemis-${schoolId}`,
    eiin: '',
    schoolCode,
    name: cleanText(record.schoolName),
    nameBangla: cleanText(record.schoolNameLocal),
    district: cleanText(record.districtName),
    districtBangla: cleanText(record.districtNameLocal),
    upazila: cleanText(record.upazilaName),
    upazilaBangla: cleanText(record.upazilaNameLocal),
    address: cleanText(record.geoUnionName),
    institutionType:
      cleanText(record.schoolTypeName) ||
      'Primary school',
    educationLevel: 'Primary',
    source: 'DPE IPEMIS primary-school directory',
    sourceYear: '2025-2026',
    sourceUrl: IPEMIS_PRIMARY_DIRECTORY_URL,
  };
}

async function searchIpemisPrimarySchools(
  query,
  limit = 12,
  {
    fetchImpl = fetch,
    timeoutMs = 1800,
  } = {}
) {
  const normalized = cleanText(query);

  if (normalized.length < 2) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );
  const params = new URLSearchParams({
    draw: '1',
    start: '0',
    length: String(
      Math.min(30, Math.max(1, Number(limit) || 12))
    ),
    schoolName: normalized,
  });

  try {
    const response = await fetchImpl(
      `${IPEMIS_PRIMARY_SEARCH_URL}?${params}`,
      {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    const records = Array.isArray(payload?.aaData)
      ? payload.aaData
      : [];

    return records
      .map(mapIpemisSchool)
      .filter(Boolean)
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  IPEMIS_PRIMARY_DIRECTORY_URL,
  IPEMIS_PRIMARY_SEARCH_URL,
  mapIpemisSchool,
  searchIpemisPrimarySchools,
};
