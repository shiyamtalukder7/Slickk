const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { config } = require('../config');

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

    CREATE INDEX IF NOT EXISTS messages_conversation_order
      ON messages(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS conversations_student_updated
      ON conversations(student_id, updated_at DESC);
  `);

  const statements = {
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

  function close() {
    if (database.isOpen) {
      database.close();
    }
  }

  return {
    close,
    findConversation,
    getMessages,
    getOrCreateConversation,
    getRecentMessages,
    listConversations,
    requireConversation,
    saveMessage,
  };
}

module.exports = {
  ConversationStoreError,
  createConversationStore,
  titleFromMessage,
};
