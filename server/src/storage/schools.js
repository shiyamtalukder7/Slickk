const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { config } = require('../config');

class SchoolStoreError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'SchoolStoreError';
    this.code = code;
    this.status = status;
  }
}

function mapSchool(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    eiin: row.eiin,
    name: row.name,
    district: row.district,
    upazila: row.upazila,
    address: row.address,
    source: row.source,
    sourceYear: row.source_year,
    sourceUrl: row.source_url,
    updatedAt: row.updated_at,
  };
}

function createSchoolStore(
  databasePath = config.databasePath
) {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });
  }

  const database = new DatabaseSync(databasePath, {
    timeout: 3000,
  });

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      eiin TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT '',
      upazila TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      source_year TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS schools_eiin_unique
      ON schools(eiin)
      WHERE eiin <> '';

    CREATE INDEX IF NOT EXISTS schools_name_search
      ON schools(name COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS schools_location_search
      ON schools(district COLLATE NOCASE, upazila COLLATE NOCASE);
  `);

  const statements = {
    upsert: database.prepare(`
      INSERT INTO schools (
        id,
        eiin,
        name,
        district,
        upazila,
        address,
        source,
        source_year,
        source_url,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        eiin = excluded.eiin,
        name = excluded.name,
        district = excluded.district,
        upazila = excluded.upazila,
        address = excluded.address,
        source = excluded.source,
        source_year = excluded.source_year,
        source_url = excluded.source_url,
        updated_at = excluded.updated_at
    `),
    search: database.prepare(`
      SELECT *
      FROM schools
      WHERE
        name LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        eiin LIKE ? ESCAPE '\\' OR
        district LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        upazila LIKE ? ESCAPE '\\' COLLATE NOCASE
      ORDER BY
        CASE
          WHEN eiin = ? THEN 0
          WHEN name LIKE ? ESCAPE '\\' COLLATE NOCASE THEN 1
          ELSE 2
        END,
        name COLLATE NOCASE
      LIMIT ?
    `),
    count: database.prepare(`
      SELECT
        COUNT(*) AS school_count,
        COUNT(DISTINCT district) AS district_count,
        MAX(updated_at) AS updated_at
      FROM schools
    `),
    coverage: database.prepare(`
      SELECT
        SUM(
          CASE
            WHEN source LIKE 'BANBEIS%' THEN 1
            ELSE 0
          END
        ) AS banbeis_count,
        COUNT(
          DISTINCT CASE
            WHEN source LIKE 'BANBEIS%' THEN LOWER(district)
            ELSE NULL
          END
        ) AS banbeis_district_count,
        SUM(
          CASE
            WHEN source = 'DPE IPEMIS primary-school directory'
              THEN 1
            ELSE 0
          END
        ) AS primary_cached_count,
        SUM(
          CASE
            WHEN source =
              'Dhaka Education Board English-medium registry'
              THEN 1
            ELSE 0
          END
        ) AS english_medium_count
      FROM schools
    `),
  };

  function importSchools(schools) {
    if (!Array.isArray(schools) || schools.length === 0) {
      throw new SchoolStoreError(
        'No valid schools were supplied for import.',
        'SCHOOL_IMPORT_EMPTY'
      );
    }

    const now = new Date().toISOString();
    let importedCount = 0;

    database.exec('BEGIN IMMEDIATE');

    try {
      for (const school of schools) {
        const id = String(school.id || '').trim();
        const name = String(school.name || '').trim();

        if (!id || !name) {
          continue;
        }

        statements.upsert.run(
          id.slice(0, 180),
          String(school.eiin || '').trim().slice(0, 20),
          name.slice(0, 240),
          String(school.district || '').trim().slice(0, 120),
          String(school.upazila || '').trim().slice(0, 120),
          String(school.address || '').trim().slice(0, 300),
          String(school.source || 'Verified directory')
            .trim()
            .slice(0, 120),
          String(school.sourceYear || '').trim().slice(0, 20),
          String(school.sourceUrl || '').trim().slice(0, 2000),
          now
        );
        importedCount += 1;
      }

      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    return {
      importedCount,
      ...status(),
    };
  }

  function escapeLike(value) {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  function search(query, limit = 15) {
    const normalized = String(query || '').trim();

    if (normalized.length < 2) {
      return [];
    }

    if (normalized.length > 120) {
      throw new SchoolStoreError(
        'The school search is too long.',
        'INVALID_SCHOOL_QUERY'
      );
    }

    const escaped = escapeLike(normalized);
    const contains = `%${escaped}%`;
    const startsWith = `${escaped}%`;

    return statements.search
      .all(
        contains,
        startsWith,
        contains,
        contains,
        normalized,
        startsWith,
        Math.min(30, Math.max(1, Number(limit) || 15))
      )
      .map(mapSchool);
  }

  function status() {
    const row = statements.count.get();
    const coverage = statements.coverage.get();
    const banbeisDistrictCount =
      Number(coverage.banbeis_district_count) || 0;

    return {
      schoolCount: Number(row.school_count) || 0,
      districtCount:
        banbeisDistrictCount ||
        Number(row.district_count) ||
        0,
      banbeisInstitutionCount:
        Number(coverage.banbeis_count) || 0,
      banbeisDistrictCount,
      primaryCachedCount:
        Number(coverage.primary_cached_count) || 0,
      englishMediumSchoolCount:
        Number(coverage.english_medium_count) || 0,
      updatedAt: row.updated_at || null,
      manualSchoolEntrySupported: true,
    };
  }

  function close() {
    if (database.isOpen) {
      database.close();
    }
  }

  return {
    close,
    importSchools,
    search,
    status,
  };
}

module.exports = {
  SchoolStoreError,
  createSchoolStore,
};
