const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { config } = require('../config');

const ENGLISH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'can',
  'do',
  'does',
  'explain',
  'for',
  'from',
  'help',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'on',
  'please',
  'teach',
  'that',
  'the',
  'this',
  'to',
  'what',
  'when',
  'where',
  'which',
  'why',
  'with',
]);
const BANGLA_STOP_WORDS = new Set([
  'আমি',
  'আমাকে',
  'আর',
  'এর',
  'এটি',
  'এই',
  'ও',
  'কি',
  'কী',
  'কেন',
  'করে',
  'থেকে',
  'দিয়ে',
  'না',
  'বোঝাও',
  'ব্যাখ্যা',
  'যে',
]);

class CurriculumStoreError extends Error {
  constructor(message, code, status = 500) {
    super(message);
    this.name = 'CurriculumStoreError';
    this.code = code;
    this.status = status;
  }
}

function cleanText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(
      /--\s*\d+\s+of\s+\d+\s*--/gi,
      ''
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function limitedText(value, fallback, maximum) {
  const text = cleanText(value);
  return (text || fallback).slice(0, maximum);
}

function entitlementRows(
  access,
  rights = 'licensed-user-copy'
) {
  if (rights !== 'licensed-user-copy') {
    return [];
  }

  const rows = [];
  const studentId = limitedText(
    access?.studentId,
    '',
    120
  );
  const schoolId = limitedText(
    access?.schoolId,
    '',
    180
  );

  if (studentId) {
    rows.push({
      principalType: 'student',
      principalId: studentId,
    });
  }

  if (schoolId) {
    rows.push({
      principalType: 'school',
      principalId: schoolId,
    });
  }

  if (rows.length === 0) {
    throw new CurriculumStoreError(
      'A licensed textbook must be assigned to a student or school.',
      'DOCUMENT_ENTITLEMENT_REQUIRED',
      400
    );
  }

  return rows;
}

function chunkPageText(
  text,
  maximumLength = 1400,
  overlapLength = 180
) {
  const normalized = cleanText(text);

  if (!normalized) {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(
      normalized.length,
      start + maximumLength
    );

    if (end < normalized.length) {
      const paragraphBreak =
        normalized.lastIndexOf('\n', end);
      const sentenceBreak = Math.max(
        normalized.lastIndexOf('. ', end),
        normalized.lastIndexOf('। ', end),
        normalized.lastIndexOf('? ', end)
      );
      const preferredBreak = Math.max(
        paragraphBreak,
        sentenceBreak
      );

      if (preferredBreak > start + maximumLength * 0.55) {
        end = preferredBreak + 1;
      }
    }

    const chunk = normalized.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(
      start + 1,
      end - overlapLength
    );
  }

  return chunks;
}

function buildFtsQuery(query) {
  const terms =
    String(query || '')
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{M}\p{N}]{2,}/gu) || [];
  const usefulTerms = [
    ...new Set(
      terms.filter(
        (term) =>
          !ENGLISH_STOP_WORDS.has(term) &&
          !BANGLA_STOP_WORDS.has(term)
      )
    ),
  ].slice(0, 14);

  return usefulTerms
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' OR ');
}

function gradeBandPlacement(grade) {
  const match = String(grade || '').match(
    /\b(\d{1,2})\b/
  );
  const number = match ? Number(match[1]) : null;

  if (!number || number < 1 || number > 12) {
    return '';
  }

  if (number <= 5) {
    return 'Class 1-5';
  }

  if (number <= 8) {
    return 'Class 6-8';
  }

  if (number <= 10) {
    return 'Class 9-10';
  }

  return 'Class 11-12';
}

function mapDocument(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    curriculum: row.curriculum,
    academicYear: row.academic_year,
    grade: row.grade,
    subject: row.subject,
    language: row.language,
    version: row.version,
    sourceUrl: row.source_url,
    rights: row.rights,
    sha256: row.sha256,
    pageCount: row.page_count,
    chunkCount: row.chunk_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createCurriculumStore(
  databasePath = config.databasePath
) {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });
  }

  const database = new DatabaseSync(databasePath, {
    timeout: 5000,
    enableForeignKeyConstraints: true,
  });

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS curriculum_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      curriculum TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      grade TEXT NOT NULL,
      subject TEXT NOT NULL,
      language TEXT NOT NULL,
      version TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      rights TEXT NOT NULL,
      sha256 TEXT NOT NULL UNIQUE,
      page_count INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS curriculum_pages (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (document_id)
        REFERENCES curriculum_documents(id)
        ON DELETE CASCADE,
      UNIQUE (document_id, page_number)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS curriculum_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (document_id)
        REFERENCES curriculum_documents(id)
        ON DELETE CASCADE,
      UNIQUE (document_id, page_number, chunk_index)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS curriculum_document_entitlements (
      document_id TEXT NOT NULL,
      principal_type TEXT NOT NULL
        CHECK (principal_type IN ('student', 'school')),
      principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (
        document_id,
        principal_type,
        principal_id
      ),
      FOREIGN KEY (document_id)
        REFERENCES curriculum_documents(id)
        ON DELETE CASCADE
    ) STRICT;

    CREATE VIRTUAL TABLE IF NOT EXISTS curriculum_chunks_fts
    USING fts5(
      chunk_id UNINDEXED,
      document_id UNINDEXED,
      title,
      subject,
      grade,
      language,
      content,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE INDEX IF NOT EXISTS curriculum_documents_filter
      ON curriculum_documents(
        curriculum,
        academic_year,
        grade,
        subject,
        language
      );

    CREATE INDEX IF NOT EXISTS curriculum_pages_document
      ON curriculum_pages(document_id, page_number);

    CREATE INDEX IF NOT EXISTS curriculum_chunks_document
      ON curriculum_chunks(document_id, page_number, chunk_index);

    CREATE INDEX IF NOT EXISTS curriculum_entitlements_principal
      ON curriculum_document_entitlements(
        principal_type,
        principal_id,
        document_id
      );
  `);

  const statements = {
    documentByHash: database.prepare(`
      SELECT *
      FROM curriculum_documents
      WHERE sha256 = ?
    `),
    documentById: database.prepare(`
      SELECT *
      FROM curriculum_documents
      WHERE id = ?
    `),
    deleteFtsByDocument: database.prepare(`
      DELETE FROM curriculum_chunks_fts
      WHERE document_id = ?
    `),
    deleteDocument: database.prepare(`
      DELETE FROM curriculum_documents
      WHERE id = ?
    `),
    insertDocument: database.prepare(`
      INSERT INTO curriculum_documents (
        id,
        title,
        curriculum,
        academic_year,
        grade,
        subject,
        language,
        version,
        source_url,
        rights,
        sha256,
        page_count,
        chunk_count,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertPage: database.prepare(`
      INSERT INTO curriculum_pages (
        id,
        document_id,
        page_number,
        content
      ) VALUES (?, ?, ?, ?)
    `),
    insertChunk: database.prepare(`
      INSERT INTO curriculum_chunks (
        id,
        document_id,
        page_number,
        chunk_index,
        content
      ) VALUES (?, ?, ?, ?, ?)
    `),
    insertFtsChunk: database.prepare(`
      INSERT INTO curriculum_chunks_fts (
        chunk_id,
        document_id,
        title,
        subject,
        grade,
        language,
        content
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertEntitlement: database.prepare(`
      INSERT OR IGNORE INTO curriculum_document_entitlements (
        document_id,
        principal_type,
        principal_id,
        created_at
      ) VALUES (?, ?, ?, ?)
    `),
    documentEntitlements: database.prepare(`
      SELECT
        principal_type,
        principal_id,
        created_at
      FROM curriculum_document_entitlements
      WHERE document_id = ?
      ORDER BY principal_type, principal_id
    `),
    listDocuments: database.prepare(`
      SELECT d.*
      FROM curriculum_documents AS d
      WHERE d.status = 'ready'
        AND (
          d.rights <> 'licensed-user-copy' OR
          EXISTS (
            SELECT 1
            FROM curriculum_document_entitlements AS e
            WHERE e.document_id = d.id
              AND (
                (
                  e.principal_type = 'student' AND
                  e.principal_id = ?
                ) OR
                (
                  e.principal_type = 'school' AND
                  e.principal_id = ?
                )
              )
          )
        )
      ORDER BY d.updated_at DESC
      LIMIT ?
    `),
    search: database.prepare(`
      SELECT
        f.chunk_id,
        f.document_id,
        f.title,
        f.subject,
        f.grade,
        f.language,
        f.content,
        c.page_number,
        d.curriculum,
        d.academic_year,
        d.version,
        d.source_url,
        d.rights,
        bm25(
          curriculum_chunks_fts,
          0.0,
          0.0,
          1.4,
          1.2,
          0.8,
          0.6,
          2.0
        ) AS rank
      FROM curriculum_chunks_fts AS f
      JOIN curriculum_chunks AS c
        ON c.id = f.chunk_id
      JOIN curriculum_documents AS d
        ON d.id = f.document_id
      WHERE curriculum_chunks_fts MATCH ?
        AND d.status = 'ready'
        AND (? = '' OR d.curriculum = ?)
        AND (? = '' OR d.version = ?)
        AND (
          ? = '' OR
          d.grade = ? OR
          d.grade = ?
        )
        AND (? = '' OR d.subject = ?)
        AND (? = '' OR d.language = ?)
        AND (
          d.rights <> 'licensed-user-copy' OR
          EXISTS (
            SELECT 1
            FROM curriculum_document_entitlements AS e
            WHERE e.document_id = d.id
              AND (
                (
                  e.principal_type = 'student' AND
                  e.principal_id = ?
                ) OR
                (
                  e.principal_type = 'school' AND
                  e.principal_id = ?
                )
              )
          )
        )
      ORDER BY rank
      LIMIT ?
    `),
  };

  function importDocument({
    metadata,
    pages,
    pageCount,
    sha256,
    replace = false,
  }) {
    const rights = limitedText(
      metadata?.rights,
      '',
      80
    );
    const entitlements = entitlementRows(
      metadata?.access,
      rights
    );
    const existing = mapDocument(
      statements.documentByHash.get(sha256)
    );

    if (existing && !replace) {
      const existingEntitlements =
        grantDocumentEntitlements(
        existing.id,
        metadata?.access,
        existing.rights
      );

      return {
        document: existing,
        duplicate: true,
        replaced: false,
        entitlements: existingEntitlements,
      };
    }

    const normalizedPages = pages
      .map((page, index) => ({
        pageNumber:
          Number(page.pageNumber) || index + 1,
        text: cleanText(page.text),
      }))
      .filter((page) => page.text);

    if (normalizedPages.length === 0) {
      throw new CurriculumStoreError(
        'The PDF contains no extractable text. OCR is required for this book.',
        'PDF_TEXT_UNAVAILABLE',
        422
      );
    }

    const chunks = normalizedPages.flatMap((page) =>
      chunkPageText(page.text).map(
        (content, chunkIndex) => ({
          id: randomUUID(),
          pageNumber: page.pageNumber,
          chunkIndex,
          content,
        })
      )
    );
    const now = new Date().toISOString();
    const documentId = randomUUID();
    const normalizedMetadata = {
      title: limitedText(
        metadata.title,
        'Untitled textbook',
        240
      ),
      curriculum: limitedText(
        metadata.curriculum,
        'Unspecified curriculum',
        120
      ),
      academicYear: limitedText(
        metadata.academicYear,
        'Unspecified',
        40
      ),
      grade: limitedText(
        metadata.grade,
        'General',
        80
      ),
      subject: limitedText(
        metadata.subject,
        'General',
        120
      ),
      language: limitedText(
        metadata.language,
        'Unspecified',
        50
      ),
      version: limitedText(
        metadata.version,
        'Unspecified',
        80
      ),
      sourceUrl: limitedText(
        metadata.sourceUrl,
        '',
        2000
      ),
      rights: limitedText(
        metadata.rights,
        '',
        80
      ),
    };

    if (
      ![
        'official-public',
        'licensed-user-copy',
        'public-domain',
        'open-license',
      ].includes(normalizedMetadata.rights)
    ) {
      throw new CurriculumStoreError(
        'Document rights must be confirmed before indexing.',
        'DOCUMENT_RIGHTS_REQUIRED',
        400
      );
    }

    database.exec('BEGIN IMMEDIATE');

    try {
      if (existing) {
        statements.deleteFtsByDocument.run(
          existing.id
        );
        statements.deleteDocument.run(existing.id);
      }

      statements.insertDocument.run(
        documentId,
        normalizedMetadata.title,
        normalizedMetadata.curriculum,
        normalizedMetadata.academicYear,
        normalizedMetadata.grade,
        normalizedMetadata.subject,
        normalizedMetadata.language,
        normalizedMetadata.version,
        normalizedMetadata.sourceUrl,
        normalizedMetadata.rights,
        sha256,
        Math.max(
          Number(pageCount) || 0,
          ...normalizedPages.map(
            (page) => page.pageNumber
          )
        ),
        chunks.length,
        'ready',
        now,
        now
      );

      for (const page of normalizedPages) {
        statements.insertPage.run(
          randomUUID(),
          documentId,
          page.pageNumber,
          page.text
        );
      }

      for (const chunk of chunks) {
        statements.insertChunk.run(
          chunk.id,
          documentId,
          chunk.pageNumber,
          chunk.chunkIndex,
          chunk.content
        );
        statements.insertFtsChunk.run(
          chunk.id,
          documentId,
          normalizedMetadata.title,
          normalizedMetadata.subject,
          normalizedMetadata.grade,
          normalizedMetadata.language,
          chunk.content
        );
      }

      for (const entitlement of entitlements) {
        statements.insertEntitlement.run(
          documentId,
          entitlement.principalType,
          entitlement.principalId,
          now
        );
      }

      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    return {
      document: mapDocument(
        statements.documentById.get(documentId)
      ),
      duplicate: false,
      replaced: Boolean(existing),
      entitlements:
        getDocumentEntitlements(documentId),
    };
  }

  function listDocuments(
    limit = 100,
    access = {}
  ) {
    return statements.listDocuments
      .all(
        limitedText(access.studentId, '', 120),
        limitedText(access.schoolId, '', 180),
        Math.min(500, Math.max(1, limit))
      )
      .map(mapDocument);
  }

  function findDocumentByHash(sha256) {
    return mapDocument(
      statements.documentByHash.get(
        String(sha256 || '')
      )
    );
  }

  function grantDocumentEntitlements(
    documentId,
    access,
    rights = 'licensed-user-copy'
  ) {
    const rows = entitlementRows(access, rights);
    const now = new Date().toISOString();

    for (const row of rows) {
      statements.insertEntitlement.run(
        documentId,
        row.principalType,
        row.principalId,
        now
      );
    }

    return statements.documentEntitlements
      .all(documentId)
      .map((row) => ({
        principalType: row.principal_type,
        principalId: row.principal_id,
        createdAt: row.created_at,
      }));
  }

  function getDocumentEntitlements(documentId) {
    return statements.documentEntitlements
      .all(documentId)
      .map((row) => ({
        principalType: row.principal_type,
        principalId: row.principal_id,
        createdAt: row.created_at,
      }));
  }

  function search(query, limit = 5, filters = {}) {
    const ftsQuery = buildFtsQuery(query);

    if (!ftsQuery) {
      return [];
    }

    const curriculum = limitedText(
      filters.curriculum,
      '',
      120
    );
    const version = limitedText(
      filters.version,
      '',
      80
    );
    const grade = limitedText(
      filters.grade,
      '',
      80
    );
    const gradeBand = gradeBandPlacement(grade);
    const subject = limitedText(
      filters.subject,
      '',
      120
    );
    const language = limitedText(
      filters.language,
      '',
      50
    );
    const studentId = limitedText(
      filters.studentId,
      '',
      120
    );
    const schoolId = limitedText(
      filters.schoolId,
      '',
      180
    );

    return statements.search
      .all(
        ftsQuery,
        curriculum,
        curriculum,
        version,
        version,
        grade,
        grade,
        gradeBand,
        subject,
        subject,
        language,
        language,
        studentId,
        schoolId,
        Math.min(10, Math.max(1, limit))
      )
      .map((row, index) => ({
        citationId: `source-${index + 1}`,
        documentId: row.document_id,
        chunkId: row.chunk_id,
        documentTitle: row.title,
        curriculum: row.curriculum,
        academicYear: row.academic_year,
        grade: row.grade,
        subject: row.subject,
        language: row.language,
        version: row.version,
        page: row.page_number,
        sourceUrl: row.source_url,
        rights: row.rights,
        excerpt: row.content.slice(0, 700),
        content: row.content,
        relevance: Number(
          Math.abs(Number(row.rank) || 0).toFixed(4)
        ),
      }));
  }

  function close() {
    if (database.isOpen) {
      database.close();
    }
  }

  return {
    close,
    findDocumentByHash,
    getDocumentEntitlements,
    grantDocumentEntitlements,
    importDocument,
    listDocuments,
    search,
  };
}

module.exports = {
  CurriculumStoreError,
  buildFtsQuery,
  chunkPageText,
  cleanText,
  createCurriculumStore,
  entitlementRows,
  gradeBandPlacement,
};
