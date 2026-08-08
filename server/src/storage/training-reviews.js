const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { config } = require('../config');
const {
  buildApprovedDataset,
  reviewTrainingCandidate,
} = require('../training/review');

class TrainingReviewStoreError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'TrainingReviewStoreError';
    this.code = code;
    this.status = status;
  }
}

function parseRow(row) {
  if (!row) return null;

  return JSON.parse(row.payload_json);
}

function createTrainingReviewStore(databasePath = config.databasePath) {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath, { timeout: 3000 });
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS training_reviews (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      split TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS training_reviews_status
      ON training_reviews(status, updated_at DESC);
  `);

  const statements = {
    insert: database.prepare(`
      INSERT INTO training_reviews (
        id, status, split, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `),
    byId: database.prepare(`
      SELECT * FROM training_reviews WHERE id = ?
    `),
    listAll: database.prepare(`
      SELECT * FROM training_reviews
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    listByStatus: database.prepare(`
      SELECT * FROM training_reviews
      WHERE status = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    update: database.prepare(`
      UPDATE training_reviews
      SET status = ?, payload_json = ?, updated_at = ?
      WHERE id = ?
    `),
    approved: database.prepare(`
      SELECT * FROM training_reviews
      WHERE status = 'educator-approved'
      ORDER BY id
    `),
    counts: database.prepare(`
      SELECT status, COUNT(*) AS count
      FROM training_reviews
      GROUP BY status
    `),
  };

  function enqueue(candidate) {
    if (
      !candidate?.id ||
      candidate.status !== 'awaiting-reviewed-response' ||
      !String(candidate.generatedResponse || '').trim()
    ) {
      throw new TrainingReviewStoreError(
        'A complete generated candidate awaiting review is required.',
        'TRAINING_REVIEW_CANDIDATE_INVALID'
      );
    }

    if (candidate.containsRawPrivateData === true) {
      throw new TrainingReviewStoreError(
        'Raw private student data cannot enter the review queue.',
        'TRAINING_REVIEW_PRIVATE_DATA_BLOCKED'
      );
    }

    const now = new Date().toISOString();

    try {
      statements.insert.run(
        String(candidate.id).slice(0, 180),
        candidate.status,
        candidate.split === 'evaluation' ? 'evaluation' : 'training',
        JSON.stringify(candidate),
        now,
        now
      );
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE constraint')) {
        throw new TrainingReviewStoreError(
          'That training candidate is already in the review queue.',
          'TRAINING_REVIEW_DUPLICATE',
          409
        );
      }
      throw error;
    }

    return candidate;
  }

  function get(id) {
    const candidate = parseRow(statements.byId.get(String(id || '')));
    if (!candidate) {
      throw new TrainingReviewStoreError(
        'Training review candidate was not found.',
        'TRAINING_REVIEW_NOT_FOUND',
        404
      );
    }
    return candidate;
  }

  function list({ status = '', limit = 50 } = {}) {
    const boundedLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const rows = status
      ? statements.listByStatus.all(String(status), boundedLimit)
      : statements.listAll.all(boundedLimit);
    return rows.map(parseRow);
  }

  function review(id, decision) {
    const current = get(id);
    let reviewed;

    try {
      reviewed = reviewTrainingCandidate(current, decision);
    } catch (error) {
      throw new TrainingReviewStoreError(
        error.message,
        error.code || 'TRAINING_REVIEW_INVALID'
      );
    }

    statements.update.run(
      reviewed.status,
      JSON.stringify(reviewed),
      reviewed.review.reviewedAt,
      reviewed.id
    );
    return reviewed;
  }

  function exportDataset(options = {}) {
    return buildApprovedDataset(
      statements.approved.all().map(parseRow),
      options
    );
  }

  function status() {
    return Object.fromEntries(
      statements.counts
        .all()
        .map((row) => [row.status, Number(row.count)])
    );
  }

  function close() {
    if (database.isOpen) database.close();
  }

  return { close, enqueue, exportDataset, get, list, review, status };
}

module.exports = {
  TrainingReviewStoreError,
  createTrainingReviewStore,
};
