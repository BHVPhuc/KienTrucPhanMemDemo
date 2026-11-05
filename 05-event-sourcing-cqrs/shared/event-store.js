const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'event-store.db');

class EventStore {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_stream (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT NOT NULL,
        stream_type TEXT NOT NULL,
        version INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT NOT NULL,
        UNIQUE(stream_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_stream_lookup ON event_stream(stream_id, version);

      CREATE TABLE IF NOT EXISTS snapshots (
        stream_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        state TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);
  }

  append(streamId, streamType, expectedVersion, eventType, payload, metadata = {}) {
    const nextVersion = expectedVersion + 1;
    const now = new Date().toISOString();
    const payloadJson = JSON.stringify(payload);
    const metadataJson = JSON.stringify(metadata);

    const stmt = this.db.prepare(`
      INSERT INTO event_stream (stream_id, stream_type, version, event_type, payload, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(streamId, streamType, nextVersion, eventType, payloadJson, metadataJson, now);
      
      const lastRowStmt = this.db.prepare('SELECT last_insert_rowid() AS id');
      const row = lastRowStmt.get();
      const eventId = row.id;

      return {
        eventId,
        streamId,
        streamType,
        version: nextVersion,
        eventType,
        payload,
        metadata,
        timestamp: now
      };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        const error = new Error(`Optimistic Concurrency Conflict: Stream '${streamId}' đã có version ${nextVersion}. Expected version ${expectedVersion}.`);
        error.code = 'CONCURRENCY_CONFLICT';
        throw error;
      }
      throw err;
    }
  }

  getEvents(streamId, fromVersion = 0) {
    const stmt = this.db.prepare(`
      SELECT event_id AS eventId, stream_id AS streamId, stream_type AS streamType,
             version, event_type AS eventType, payload, metadata, timestamp
      FROM event_stream
      WHERE stream_id = ? AND version > ?
      ORDER BY version ASC
    `);

    const rows = stmt.all(streamId, fromVersion);
    return rows.map(r => ({
      ...r,
      payload: JSON.parse(r.payload),
      metadata: r.metadata ? JSON.parse(r.metadata) : {}
    }));
  }

  getAllEvents(fromEventId = 0) {
    const stmt = this.db.prepare(`
      SELECT event_id AS eventId, stream_id AS streamId, stream_type AS streamType,
             version, event_type AS eventType, payload, metadata, timestamp
      FROM event_stream
      WHERE event_id > ?
      ORDER BY event_id ASC
    `);

    const rows = stmt.all(fromEventId);
    return rows.map(r => ({
      ...r,
      payload: JSON.parse(r.payload),
      metadata: r.metadata ? JSON.parse(r.metadata) : {}
    }));
  }

  saveSnapshot(streamId, version, state) {
    const now = new Date().toISOString();
    const stateJson = JSON.stringify(state);
    const stmt = this.db.prepare(`
      INSERT INTO snapshots (stream_id, version, state, timestamp)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(stream_id) DO UPDATE SET
        version = excluded.version,
        state = excluded.state,
        timestamp = excluded.timestamp
    `);
    stmt.run(streamId, version, stateJson, now);
  }

  getSnapshot(streamId) {
    const stmt = this.db.prepare(`
      SELECT stream_id AS streamId, version, state, timestamp
      FROM snapshots
      WHERE stream_id = ?
    `);
    const row = stmt.get(streamId);
    if (!row) return null;
    return {
      streamId: row.streamId,
      version: row.version,
      state: JSON.parse(row.state),
      timestamp: row.timestamp
    };
  }

  reset() {
    this.db.exec(`
      DELETE FROM event_stream;
      DELETE FROM snapshots;
    `);
  }

  close() {
    this.db.close();
  }
}

module.exports = { EventStore };
