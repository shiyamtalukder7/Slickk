const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { config } = require('../config');
const {
  masteryLevel,
  nextReviewDate,
  updateMastery,
} = require('../learning/mastery');
const {
  DEFAULT_STRATEGY_REVALIDATION_WINDOW_MS,
  STRATEGY_REVALIDATION_VERSION,
  normalizeTopicKey,
} = require('../outcomes/memory');

class ConversationStoreError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ConversationStoreError';
    this.code = code;
    this.status = status;
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function safeLearningText(
  value,
  fallback = '',
  maximumLength = 500
) {
  const text = String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!text) {
    return fallback;
  }

  const unsafe =
    /^(?:<\?xml\b|<!doctype\b|<html\b|<xml\b|```|[\[{]\s*["']?(?:reply|message|content|answer|text)["']?\s*:)/i.test(
      text
    ) ||
    /\b(?:MIND_RIGHT_DECISION_DATA|PEDAGOGY_PLAN_DATA|STUDENT_PROFILE_DATA|RELEVANT_LEARNER_MEMORY_DATA|CURRICULUM_EVIDENCE_DATA)\s*=/i.test(
      text
    ) ||
    text.toLowerCase() === 'default';

  return unsafe
    ? fallback
    : text.slice(0, maximumLength);
}

function titleFromMessage(message) {
  const title = String(message ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);

  return title || 'New learning conversation';
}

function mapConversation(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    studentId: row.student_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    text: row.content,
    mode: row.mode,
    metadata: safeJsonParse(row.metadata_json),
    createdAt: row.created_at,
  };
}

function mapSubjectProgress(row) {
  if (!row) {
    return null;
  }

  return {
    studentId: row.student_id,
    subjectKey: row.subject_key,
    subject: safeLearningText(
      row.subject,
      'General learning',
      120
    ),
    turns: row.turns,
    confusionSignals: row.confusion_signals,
    understandingClaims: row.understanding_claims,
    answerAttempts: row.answer_attempts,
    masteryScore: row.mastery_score,
    masteryEvidence: row.mastery_evidence,
    masteryLevel: masteryLevel(
      row.mastery_score,
      row.mastery_evidence
    ),
    correctAnswers: row.correct_answers,
    incorrectAnswers: row.incorrect_answers,
    hintsUsed: row.hints_used,
    supportLevel: row.support_level,
    lastTopic: safeLearningText(
      row.last_topic,
      '',
      120
    ),
    lastSkill: safeLearningText(
      row.last_skill,
      '',
      120
    ),
    lastMisconception: safeLearningText(
      row.last_misconception,
      '',
      500
    ),
    nextAction: safeLearningText(
      row.next_action,
      '',
      500
    ),
    nextReviewAt: row.next_review_at,
    lastStudiedAt: row.last_studied_at,
  };
}

function mapMisconception(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    subjectKey: row.subject_key,
    subject: safeLearningText(
      row.subject,
      'General learning',
      120
    ),
    topic: safeLearningText(
      row.topic,
      '',
      120
    ),
    incorrectBelief: safeLearningText(
      row.incorrect_belief,
      '',
      500
    ),
    correction: safeLearningText(
      row.correction,
      '',
      500
    ),
    status: row.status,
    detectedAt: row.detected_at,
    lastReviewedAt: row.last_reviewed_at,
  };
}

function createConversationStore(
  databasePath = config.databasePath
) {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });
  }

  const database = new DatabaseSync(databasePath, {
    timeout: 3000,
    enableForeignKeyConstraints: true,
  });

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
      content TEXT NOT NULL,
      mode TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS learner_profiles (
      student_id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      grade TEXT NOT NULL,
      language TEXT NOT NULL,
      education_profile_json TEXT NOT NULL DEFAULT '{}',
      total_turns INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS subject_progress (
      student_id TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      turns INTEGER NOT NULL DEFAULT 0,
      confusion_signals INTEGER NOT NULL DEFAULT 0,
      understanding_claims INTEGER NOT NULL DEFAULT 0,
      answer_attempts INTEGER NOT NULL DEFAULT 0,
      mastery_score REAL NOT NULL DEFAULT 0.25,
      mastery_evidence INTEGER NOT NULL DEFAULT 0,
      correct_answers INTEGER NOT NULL DEFAULT 0,
      incorrect_answers INTEGER NOT NULL DEFAULT 0,
      hints_used INTEGER NOT NULL DEFAULT 0,
      support_level INTEGER NOT NULL DEFAULT 0,
      last_topic TEXT NOT NULL DEFAULT '',
      last_skill TEXT NOT NULL DEFAULT '',
      last_misconception TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      next_review_at TEXT,
      last_studied_at TEXT NOT NULL,
      PRIMARY KEY (student_id, subject_key),
      FOREIGN KEY (student_id)
        REFERENCES learner_profiles(student_id)
        ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS misconceptions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      incorrect_belief TEXT NOT NULL,
      correction TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      detected_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      FOREIGN KEY (student_id)
        REFERENCES learner_profiles(student_id)
        ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS learning_events (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      topic TEXT NOT NULL,
      result TEXT NOT NULL,
      confidence REAL NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (student_id)
        REFERENCES learner_profiles(student_id)
        ON DELETE CASCADE,
      FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS teaching_outcome_events (
      id TEXT PRIMARY KEY,
      evidence_key TEXT NOT NULL UNIQUE,
      student_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      representation TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (
        outcome IN (
          'effective',
          'ineffective',
          'unknown'
        )
      ),
      source TEXT NOT NULL,
      confidence REAL NOT NULL,
      verified_evidence INTEGER NOT NULL DEFAULT 0,
      descriptive_only INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS wellbeing_check_ins (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      mood TEXT NOT NULL,
      school_day TEXT NOT NULL,
      needs_trusted_adult INTEGER NOT NULL DEFAULT 0,
      learning_pace TEXT NOT NULL,
      suggested_minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS messages_conversation_order
      ON messages(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS conversations_student_updated
      ON conversations(student_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS subject_progress_student_recent
      ON subject_progress(student_id, last_studied_at DESC);

    CREATE INDEX IF NOT EXISTS misconceptions_student_status
      ON misconceptions(student_id, status, detected_at DESC);

    CREATE INDEX IF NOT EXISTS learning_events_student_recent
      ON learning_events(student_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS teaching_outcome_student_topic
      ON teaching_outcome_events(
        student_id,
        subject_key,
        topic_key,
        created_at DESC
      );

    CREATE INDEX IF NOT EXISTS teaching_outcome_representation
      ON teaching_outcome_events(
        student_id,
        topic_key,
        representation,
        created_at DESC
      );

    CREATE INDEX IF NOT EXISTS wellbeing_student_recent
      ON wellbeing_check_ins(student_id, created_at DESC);
  `);

  const learnerProfileColumns = database
    .prepare('PRAGMA table_info(learner_profiles)')
    .all()
    .map((column) => column.name);

  if (
    !learnerProfileColumns.includes(
      'education_profile_json'
    )
  ) {
    database.exec(`
      ALTER TABLE learner_profiles
      ADD COLUMN education_profile_json TEXT NOT NULL DEFAULT '{}';
    `);
  }

  const statements = {
    insertCheckIn: database.prepare(`
      INSERT INTO wellbeing_check_ins (
        id, student_id, mood, school_day, needs_trusted_adult,
        learning_pace, suggested_minutes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    latestCheckIn: database.prepare(`
      SELECT mood, school_day, needs_trusted_adult, learning_pace,
        suggested_minutes, created_at
      FROM wellbeing_check_ins WHERE student_id = ?
      ORDER BY created_at DESC LIMIT 1
    `),
    findConversation: database.prepare(`
      SELECT id, student_id, title, created_at, updated_at
      FROM conversations
      WHERE id = ?
    `),
    insertConversation: database.prepare(`
      INSERT INTO conversations (
        id,
        student_id,
        title,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `),
    updateConversation: database.prepare(`
      UPDATE conversations
      SET updated_at = ?
      WHERE id = ?
    `),
    insertMessage: database.prepare(`
      INSERT INTO messages (
        id,
        conversation_id,
        role,
        content,
        mode,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    recentMessages: database.prepare(`
      SELECT
        id,
        conversation_id,
        role,
        content,
        mode,
        metadata_json,
        created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY rowid DESC
      LIMIT ?
    `),
    allMessages: database.prepare(`
      SELECT
        id,
        conversation_id,
        role,
        content,
        mode,
        metadata_json,
        created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY rowid ASC
      LIMIT ?
    `),
    listConversations: database.prepare(`
      SELECT id, student_id, title, created_at, updated_at
      FROM conversations
      WHERE student_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    findLearnerProfile: database.prepare(`
      SELECT
        student_id,
        student_name,
        grade,
        language,
        education_profile_json,
        total_turns,
        created_at,
        updated_at
      FROM learner_profiles
      WHERE student_id = ?
    `),
    upsertLearnerProfile: database.prepare(`
      INSERT INTO learner_profiles (
        student_id,
        student_name,
        grade,
        language,
        total_turns,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET
        student_name = excluded.student_name,
        grade = excluded.grade,
        language = excluded.language,
        total_turns = learner_profiles.total_turns + 1,
        updated_at = excluded.updated_at
    `),
    saveEducationProfile: database.prepare(`
      INSERT INTO learner_profiles (
        student_id,
        student_name,
        grade,
        language,
        education_profile_json,
        total_turns,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET
        student_name = excluded.student_name,
        grade = excluded.grade,
        language = excluded.language,
        education_profile_json =
          excluded.education_profile_json,
        updated_at = excluded.updated_at
    `),
    findSubjectProgress: database.prepare(`
      SELECT
        student_id,
        subject_key,
        subject,
        turns,
        confusion_signals,
        understanding_claims,
        answer_attempts,
        mastery_score,
        mastery_evidence,
        correct_answers,
        incorrect_answers,
        hints_used,
        support_level,
        last_topic,
        last_skill,
        last_misconception,
        next_action,
        next_review_at,
        last_studied_at
      FROM subject_progress
      WHERE student_id = ? AND subject_key = ?
    `),
    listSubjectProgress: database.prepare(`
      SELECT
        student_id,
        subject_key,
        subject,
        turns,
        confusion_signals,
        understanding_claims,
        answer_attempts,
        mastery_score,
        mastery_evidence,
        correct_answers,
        incorrect_answers,
        hints_used,
        support_level,
        last_topic,
        last_skill,
        last_misconception,
        next_action,
        next_review_at,
        last_studied_at
      FROM subject_progress
      WHERE student_id = ?
      ORDER BY last_studied_at DESC
      LIMIT 50
    `),
    upsertSubjectProgress: database.prepare(`
      INSERT INTO subject_progress (
        student_id,
        subject_key,
        subject,
        turns,
        confusion_signals,
        understanding_claims,
        answer_attempts,
        support_level,
        last_topic,
        last_skill,
        last_misconception,
        next_action,
        last_studied_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, subject_key) DO UPDATE SET
        subject = excluded.subject,
        turns = subject_progress.turns + 1,
        confusion_signals =
          subject_progress.confusion_signals +
          excluded.confusion_signals,
        understanding_claims =
          subject_progress.understanding_claims +
          excluded.understanding_claims,
        answer_attempts =
          subject_progress.answer_attempts +
          excluded.answer_attempts,
        support_level = excluded.support_level,
        last_topic = CASE
          WHEN excluded.last_topic <> ''
          THEN excluded.last_topic
          ELSE subject_progress.last_topic
        END,
        last_skill = CASE
          WHEN excluded.last_skill <> ''
          THEN excluded.last_skill
          ELSE subject_progress.last_skill
        END,
        last_misconception =
          excluded.last_misconception,
        next_action = CASE
          WHEN excluded.next_action <> ''
          THEN excluded.next_action
          ELSE subject_progress.next_action
        END,
        last_studied_at = excluded.last_studied_at
    `),
    insertMisconception: database.prepare(`
      INSERT INTO misconceptions (
        id,
        student_id,
        subject_key,
        subject,
        topic,
        incorrect_belief,
        correction,
        status,
        detected_at,
        last_reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL)
    `),
    activeMisconceptions: database.prepare(`
      SELECT
        id,
        student_id,
        subject_key,
        subject,
        topic,
        incorrect_belief,
        correction,
        status,
        detected_at,
        last_reviewed_at
      FROM misconceptions
      WHERE student_id = ? AND status = 'active'
      ORDER BY detected_at DESC
      LIMIT 20
    `),
    insertLearningEvent: database.prepare(`
      INSERT INTO learning_events (
        id,
        student_id,
        conversation_id,
        event_type,
        subject_key,
        topic,
        result,
        confidence,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertTeachingOutcomeEvent: database.prepare(`
      INSERT OR IGNORE INTO teaching_outcome_events (
        id,
        evidence_key,
        student_id,
        conversation_id,
        subject_key,
        subject,
        topic,
        topic_key,
        representation,
        outcome,
        source,
        confidence,
        verified_evidence,
        descriptive_only,
        metadata_json,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 1, ?, ?
      )
    `),
    teachingOutcomeMemory: database.prepare(`
      SELECT
        representation,
        SUM(
          CASE
            WHEN outcome = 'effective'
            THEN 1 ELSE 0
          END
        ) AS effective_count,
        SUM(
          CASE
            WHEN outcome = 'ineffective'
            THEN 1 ELSE 0
          END
        ) AS ineffective_count,
        SUM(
          CASE
            WHEN outcome = 'unknown'
            THEN 1 ELSE 0
          END
        ) AS unknown_count,
        SUM(
          CASE
            WHEN
              created_at >= ? AND
              outcome = 'effective'
            THEN 1 ELSE 0
          END
        ) AS recent_effective_count,
        SUM(
          CASE
            WHEN
              created_at >= ? AND
              outcome = 'ineffective'
            THEN 1 ELSE 0
          END
        ) AS recent_ineffective_count,
        SUM(
          CASE
            WHEN
              created_at >= ? AND
              outcome = 'unknown'
            THEN 1 ELSE 0
          END
        ) AS recent_unknown_count,
        MAX(created_at) AS last_observed_at,
        MAX(
          CASE
            WHEN outcome IN (
              'effective',
              'ineffective'
            )
            THEN created_at
            ELSE NULL
          END
        ) AS last_decisive_at
      FROM teaching_outcome_events
      WHERE
        student_id = ? AND
        subject_key = ? AND
        topic_key = ?
      GROUP BY representation
      ORDER BY last_observed_at DESC
      LIMIT ?
    `),
    updateAssessmentEvidence: database.prepare(`
      UPDATE subject_progress
      SET
        mastery_score = ?,
        mastery_evidence = mastery_evidence + 1,
        correct_answers = correct_answers + ?,
        incorrect_answers = incorrect_answers + ?,
        hints_used = hints_used + ?,
        next_review_at = ?,
        last_studied_at = ?
      WHERE student_id = ? AND subject_key = ?
    `),
  };

  function findConversation(id) {
    return mapConversation(
      statements.findConversation.get(id)
    );
  }

  function getOrCreateConversation({
    conversationId,
    studentId,
    firstMessage,
  }) {
    if (conversationId) {
      const existing = findConversation(conversationId);

      if (existing) {
        if (existing.studentId !== studentId) {
          throw new ConversationStoreError(
            'This conversation belongs to another student.',
            'CONVERSATION_FORBIDDEN',
            403
          );
        }

        return existing;
      }
    }

    const now = new Date().toISOString();
    const id = conversationId || randomUUID();

    statements.insertConversation.run(
      id,
      studentId,
      titleFromMessage(firstMessage),
      now,
      now
    );

    return findConversation(id);
  }

  function requireConversation(conversationId, studentId) {
    const conversation = findConversation(conversationId);

    if (!conversation) {
      throw new ConversationStoreError(
        'Conversation not found.',
        'CONVERSATION_NOT_FOUND',
        404
      );
    }

    if (conversation.studentId !== studentId) {
      throw new ConversationStoreError(
        'This conversation belongs to another student.',
        'CONVERSATION_FORBIDDEN',
        403
      );
    }

    return conversation;
  }

  function saveMessage({
    conversationId,
    role,
    text,
    mode = 'adaptive',
    metadata = {},
  }) {
    const now = new Date().toISOString();
    const messageId = randomUUID();

    database.exec('BEGIN IMMEDIATE');

    try {
      statements.insertMessage.run(
        messageId,
        conversationId,
        role,
        text,
        mode,
        JSON.stringify(metadata),
        now
      );
      statements.updateConversation.run(now, conversationId);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    return {
      id: messageId,
      conversationId,
      role,
      text,
      mode,
      metadata,
      createdAt: now,
    };
  }

  function getRecentMessages(conversationId, limit = 10) {
    return statements.recentMessages
      .all(conversationId, Math.min(30, Math.max(1, limit)))
      .reverse()
      .map(mapMessage);
  }

  function getMessages(
    conversationId,
    studentId,
    limit = 100
  ) {
    requireConversation(conversationId, studentId);

    return statements.allMessages
      .all(conversationId, Math.min(500, Math.max(1, limit)))
      .map(mapMessage);
  }

  function listConversations(studentId, limit = 30) {
    return statements.listConversations
      .all(studentId, Math.min(100, Math.max(1, limit)))
      .map(mapConversation);
  }

  function getLearnerProfile(studentId) {
    const row =
      statements.findLearnerProfile.get(studentId);
    const subjects =
      statements.listSubjectProgress
        .all(studentId)
        .map(mapSubjectProgress);
    const activeMisconceptions =
      statements.activeMisconceptions
        .all(studentId)
        .map(mapMisconception)
        .filter(
          (item) => item.incorrectBelief
        );

    return {
      studentId,
      studentName: row?.student_name || 'Student',
      grade: row?.grade || 'General',
      language: row?.language || 'English',
      educationProfile: safeJsonParse(
        row?.education_profile_json
      ),
      totalTurns: row?.total_turns || 0,
      createdAt: row?.created_at || null,
      updatedAt: row?.updated_at || null,
      subjects,
      activeMisconceptions,
    };
  }

  function saveEducationProfile({
    studentId,
    profile,
    language,
  }) {
    const now = new Date().toISOString();

    statements.saveEducationProfile.run(
      studentId,
      profile.studentName,
      profile.grade,
      language,
      JSON.stringify(profile),
      now,
      now
    );

    return getLearnerProfile(studentId);
  }

  function getTeachingOutcomeMemory({
    studentId,
    subjectKey,
    topic,
    limit = 8,
    now = Date.now(),
    freshnessWindowMs =
      DEFAULT_STRATEGY_REVALIDATION_WINDOW_MS,
    minimumDecisiveEvidence = 2,
    minimumEffectivenessRate = 0.67,
    minimumConsistency = 0.5,
  }) {
    const safeStudentId =
      safeLearningText(
        studentId,
        '',
        160
      );
    const safeSubjectKey =
      safeLearningText(
        subjectKey,
        'subject:general',
        160
      );
    const topicKey =
      normalizeTopicKey(topic);

    if (!safeStudentId) {
      return [];
    }

    const parsedNow =
      typeof now === 'string'
        ? Date.parse(now)
        : Number(now);
    const currentTime =
      Number.isFinite(parsedNow)
        ? parsedNow
        : Date.now();
    const requestedWindow =
      Number(freshnessWindowMs);
    const safeFreshnessWindowMs =
      Number.isFinite(requestedWindow)
        ? Math.min(
            365 * 24 * 60 * 60 * 1000,
            Math.max(
              60 * 60 * 1000,
              requestedWindow
            )
          )
        : DEFAULT_STRATEGY_REVALIDATION_WINDOW_MS;
    const cutoffAt =
      new Date(
        currentTime -
          safeFreshnessWindowMs
      ).toISOString();
    const safeMinimumEvidence =
      Math.max(
        2,
        Math.min(
          20,
          Number(
            minimumDecisiveEvidence
          ) || 2
        )
      );
    const safeEffectivenessRate =
      Math.min(
        0.95,
        Math.max(
          0.55,
          Number(
            minimumEffectivenessRate
          ) || 0.67
        )
      );
    const safeConsistency =
      Math.min(
        1,
        Math.max(
          0,
          Number(minimumConsistency) ||
            0.5
        )
      );

    return statements
      .teachingOutcomeMemory
      .all(
        cutoffAt,
        cutoffAt,
        cutoffAt,
        safeStudentId,
        safeSubjectKey,
        topicKey,
        Math.min(
          20,
          Math.max(1, Number(limit) || 8)
        )
      )
      .map((row) => {
        const effectiveCount =
          Math.max(
            0,
            Number(row.effective_count) ||
              0
          );
        const ineffectiveCount =
          Math.max(
            0,
            Number(
              row.ineffective_count
            ) || 0
          );
        const unknownCount =
          Math.max(
            0,
            Number(row.unknown_count) ||
              0
          );
        const decisiveCount =
          effectiveCount +
          ineffectiveCount;
        const recentEffectiveCount =
          Math.max(
            0,
            Number(
              row.recent_effective_count
            ) || 0
          );
        const recentIneffectiveCount =
          Math.max(
            0,
            Number(
              row.recent_ineffective_count
            ) || 0
          );
        const recentUnknownCount =
          Math.max(
            0,
            Number(
              row.recent_unknown_count
            ) || 0
          );
        const recentDecisiveCount =
          recentEffectiveCount +
          recentIneffectiveCount;
        const recentTotalObservations =
          recentDecisiveCount +
          recentUnknownCount;
        const recentEffectivenessRate =
          recentDecisiveCount > 0
            ? (
                recentEffectiveCount /
                recentDecisiveCount
              )
            : 0.5;
        const revalidationConfidence =
          recentDecisiveCount > 0
            ? (
                Math.abs(
                  recentEffectiveCount -
                    recentIneffectiveCount
                ) /
                recentDecisiveCount
              )
            : 0;
        const conflictingEvidence =
          recentEffectiveCount > 0 &&
          recentIneffectiveCount > 0;
        const stale =
          decisiveCount > 0 &&
          recentDecisiveCount === 0;
        const enoughEvidence =
          recentDecisiveCount >=
          safeMinimumEvidence;
        const consistentEnough =
          revalidationConfidence >=
          safeConsistency;
        const positive =
          recentEffectivenessRate >=
          safeEffectivenessRate;
        const negative =
          recentEffectivenessRate <=
          1 - safeEffectivenessRate;
        const revalidationEligible =
          enoughEvidence &&
          consistentEnough &&
          (positive || negative);
        const revalidationStatus =
          stale
            ? 'stale'
            : !enoughEvidence
              ? 'insufficient'
              : !consistentEnough
                ? 'conflicted'
                : positive
                  ? 'fresh-positive'
                  : negative
                    ? 'fresh-negative'
                    : 'conflicted';
        const revalidationReason =
          stale
            ? 'decisive-evidence-outside-freshness-window'
            : !enoughEvidence
              ? 'not-enough-recent-decisive-evidence'
              : !consistentEnough
                ? 'recent-effective-and-ineffective-evidence-conflict'
                : positive
                  ? 'recent-positive-evidence-revalidated'
                  : negative
                    ? 'recent-negative-evidence-revalidated'
                    : 'recent-evidence-not-decisive';

        return {
          representation:
            safeLearningText(
              row.representation,
              '',
              80
            ),
          effectiveCount,
          ineffectiveCount,
          unknownCount,
          decisiveCount,
          totalObservations:
            effectiveCount +
            ineffectiveCount +
            unknownCount,
          effectivenessRate:
            decisiveCount > 0
              ? Number(
                  (
                    effectiveCount /
                    decisiveCount
                  ).toFixed(3)
                )
              : 0.5,
          eligiblePreference:
            decisiveCount >= 2,
          descriptiveOnly: true,
          lastObservedAt:
            row.last_observed_at,
          lastDecisiveAt:
            row.last_decisive_at,
          recentEffectiveCount,
          recentIneffectiveCount,
          recentUnknownCount,
          recentDecisiveCount,
          recentTotalObservations,
          recentEffectivenessRate:
            Number(
              recentEffectivenessRate
                .toFixed(3)
            ),
          freshnessWindowMs:
            safeFreshnessWindowMs,
          freshnessCutoffAt:
            cutoffAt,
          conflictingEvidence,
          revalidationConfidence:
            Number(
              revalidationConfidence
                .toFixed(3)
            ),
          revalidationEligible,
          revalidationStatus,
          revalidationReason,
          revalidationVersion:
            STRATEGY_REVALIDATION_VERSION,
        };
      })
      .filter(
        (item) => item.representation
      )
      .sort(
        (left, right) =>
          String(
            right.lastObservedAt || ''
          ).localeCompare(
            String(
              left.lastObservedAt || ''
            )
          )
      );
  }

  function recordTeachingOutcome({
    evidenceKey,
    studentId,
    conversationId,
    subjectKey,
    subject,
    topic,
    representation,
    outcome,
    source,
    confidence = 0,
    verifiedEvidence = false,
    metadata = {},
  }) {
    const allowedOutcomes =
      new Set([
        'effective',
        'ineffective',
        'unknown',
      ]);
    const safeEvidenceKey =
      safeLearningText(
        evidenceKey,
        '',
        500
      );
    const safeStudentId =
      safeLearningText(
        studentId,
        '',
        160
      );
    const safeConversationId =
      safeLearningText(
        conversationId,
        '',
        160
      );
    const safeSubjectKey =
      safeLearningText(
        subjectKey,
        'subject:general',
        160
      );
    const safeSubject =
      safeLearningText(
        subject,
        'General learning',
        160
      );
    const safeTopic =
      safeLearningText(
        topic,
        safeSubject,
        160
      );
    const safeRepresentation =
      safeLearningText(
        representation,
        '',
        80
      );
    const safeOutcome =
      safeLearningText(
        outcome,
        '',
        40
      ).toLowerCase();
    const safeSource =
      safeLearningText(
        source,
        'unknown',
        120
      );

    if (
      !safeEvidenceKey ||
      !safeStudentId ||
      !safeConversationId ||
      !safeRepresentation ||
      !allowedOutcomes.has(
        safeOutcome
      )
    ) {
      throw new ConversationStoreError(
        'Teaching outcome evidence is incomplete.',
        'TEACHING_OUTCOME_INVALID',
        400
      );
    }

    requireConversation(
      safeConversationId,
      safeStudentId
    );

    const numericConfidence =
      Math.min(
        1,
        Math.max(
          0,
          Number(confidence) || 0
        )
      );
    const now =
      new Date().toISOString();

    statements
      .insertTeachingOutcomeEvent
      .run(
        randomUUID(),
        safeEvidenceKey,
        safeStudentId,
        safeConversationId,
        safeSubjectKey,
        safeSubject,
        safeTopic,
        normalizeTopicKey(safeTopic),
        safeRepresentation,
        safeOutcome,
        safeSource,
        numericConfidence,
        verifiedEvidence ? 1 : 0,
        JSON.stringify({
          ...metadata,
          descriptiveOnly: true,
          mayChangeMastery: false,
          mayCreateMisconception: false,
        }),
        now
      );

    return getTeachingOutcomeMemory({
      studentId: safeStudentId,
      subjectKey: safeSubjectKey,
      topic: safeTopic,
    });
  }

  function recordLearningTurn({
    studentId,
    studentName,
    grade,
    language,
    conversationId,
    pedagogyPlan,
    learningTwin,
  }) {
    const now = new Date().toISOString();
    const confidence = Math.min(
      1,
      Math.max(0, Number(learningTwin?.confidence) || 0)
    );
    const misconceptionPolicy =
      pedagogyPlan.decision
        ?.learningTwinPolicy || {};
    const verifiedMisconception =
      misconceptionPolicy.mayCreateMisconception === true &&
      learningTwin?.evidenceVerified === true &&
      confidence >= 0.5
        ? safeLearningText(
            learningTwin?.misconception,
            '',
            500
          )
        : '';
    const topic = safeLearningText(
      learningTwin?.topic ||
        pedagogyPlan.focusTopic ||
        pedagogyPlan.subject,
      pedagogyPlan.focusTopic ||
        pedagogyPlan.subject ||
        'General learning',
      120
    );
    const skill = safeLearningText(
      learningTwin?.skill,
      'Understanding',
      120
    );
    const nextAction = safeLearningText(
      learningTwin?.nextAction,
      '',
      500
    );
    const signals = pedagogyPlan.signals || {};
    const result = signals.confusion
      ? 'needs_support'
      : signals.answerAttempt
        ? 'answer_attempt'
        : signals.understandingClaim
          ? 'understanding_claim'
          : 'learning_turn';

    database.exec('BEGIN IMMEDIATE');

    try {
      statements.upsertLearnerProfile.run(
        studentId,
        studentName,
        grade,
        language,
        now,
        now
      );
      statements.upsertSubjectProgress.run(
        studentId,
        pedagogyPlan.subjectKey,
        pedagogyPlan.subject,
        signals.confusion ? 1 : 0,
        signals.understandingClaim ? 1 : 0,
        signals.answerAttempt ? 1 : 0,
        pedagogyPlan.supportLevel,
        topic,
        skill,
        verifiedMisconception,
        nextAction,
        now
      );
      statements.insertLearningEvent.run(
        randomUUID(),
        studentId,
        conversationId,
        pedagogyPlan.lessonState,
        pedagogyPlan.subjectKey,
        topic,
        result,
        confidence,
        JSON.stringify({
          turnKind: pedagogyPlan.turnKind,
          teachingMove: pedagogyPlan.teachingMove,
          masteryDelta:
            Number(learningTwin?.masteryDelta) || 0,
        }),
        now
      );

      if (verifiedMisconception) {
        statements.insertMisconception.run(
          randomUUID(),
          studentId,
          pedagogyPlan.subjectKey,
          pedagogyPlan.subject,
          topic,
          verifiedMisconception,
          '',
          now
        );
      }

      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    return getLearnerProfile(studentId);
  }

  function recordAssessmentEvidence({
    studentId,
    subjectKey,
    observation,
    hintsUsed = 0,
  }) {
    const current = mapSubjectProgress(
      statements.findSubjectProgress.get(
        studentId,
        subjectKey
      )
    );

    if (!current) {
      throw new ConversationStoreError(
        'Subject progress was not found for this student.',
        'SUBJECT_PROGRESS_NOT_FOUND',
        404
      );
    }

    const masteryScore = updateMastery(
      current.masteryScore,
      observation
    );
    const now = new Date();
    const result =
      statements.updateAssessmentEvidence.run(
        masteryScore,
        observation === 'correct' ? 1 : 0,
        observation === 'incorrect' ? 1 : 0,
        Math.max(0, Math.round(Number(hintsUsed) || 0)),
        nextReviewDate(
          masteryScore,
          observation,
          now
        ),
        now.toISOString(),
        studentId,
        subjectKey
      );

    if (result.changes !== 1) {
      throw new ConversationStoreError(
        'Mastery evidence could not be recorded.',
        'MASTERY_UPDATE_FAILED',
        500
      );
    }

    return getLearnerProfile(studentId);
  }

  function close() {
    if (database.isOpen) {
      database.close();
    }
  }

  function saveCheckIn(studentId, checkIn) {
    statements.insertCheckIn.run(
      randomUUID(), studentId, checkIn.mood, checkIn.schoolDay,
      checkIn.needsTrustedAdult ? 1 : 0, checkIn.learningPace,
      checkIn.suggestedMinutes, checkIn.createdAt
    );
    return getLatestCheckIn(studentId);
  }

  function getLatestCheckIn(studentId) {
    const row = statements.latestCheckIn.get(studentId);
    return row ? {
      mood: row.mood, schoolDay: row.school_day,
      needsTrustedAdult: Boolean(row.needs_trusted_adult),
      learningPace: row.learning_pace,
      suggestedMinutes: row.suggested_minutes,
      createdAt: row.created_at,
    } : null;
  }

  return {
    close,
    findConversation,
    getLearnerProfile,
    getTeachingOutcomeMemory,
    getLatestCheckIn,
    getMessages,
    getOrCreateConversation,
    getRecentMessages,
    listConversations,
    recordAssessmentEvidence,
    recordLearningTurn,
    recordTeachingOutcome,
    requireConversation,
    saveEducationProfile,
    saveCheckIn,
    saveMessage,
  };
}

module.exports = {
  ConversationStoreError,
  createConversationStore,
  safeLearningText,
  titleFromMessage,
};
