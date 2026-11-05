const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DEFAULT_READ_DB_PATH = path.join(__dirname, '..', 'read-model.db');

class ReadDatabase {
  constructor(dbPath = DEFAULT_READ_DB_PATH) {
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wallet_summary_view (
        wallet_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        current_balance INTEGER NOT NULL,
        total_deposits INTEGER NOT NULL,
        total_withdrawals INTEGER NOT NULL,
        transaction_count INTEGER NOT NULL,
        last_event_version INTEGER NOT NULL,
        last_updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transaction_audit_view (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        wallet_id TEXT NOT NULL,
        action TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_wallet ON transaction_audit_view(wallet_id);
    `);
  }

  upsertWallet(walletId, owner, currentBalance, totalDeposits, totalWithdrawals, txCount, version, updatedAt) {
    const stmt = this.db.prepare(`
      INSERT INTO wallet_summary_view (wallet_id, owner, current_balance, total_deposits, total_withdrawals, transaction_count, last_event_version, last_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_id) DO UPDATE SET
        owner = excluded.owner,
        current_balance = excluded.current_balance,
        total_deposits = excluded.total_deposits,
        total_withdrawals = excluded.total_withdrawals,
        transaction_count = excluded.transaction_count,
        last_event_version = excluded.last_event_version,
        last_updated_at = excluded.last_updated_at
    `);
    stmt.run(walletId, owner, currentBalance, totalDeposits, totalWithdrawals, txCount, version, updatedAt);
  }

  insertAuditLog(eventId, walletId, action, amount, balanceAfter, timestamp) {
    const stmt = this.db.prepare(`
      INSERT INTO transaction_audit_view (event_id, wallet_id, action, amount, balance_after, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(eventId, walletId, action, amount, balanceAfter, timestamp);
  }

  getWallet(walletId) {
    const stmt = this.db.prepare(`SELECT * FROM wallet_summary_view WHERE wallet_id = ?`);
    return stmt.get(walletId) || null;
  }

  getAllWallets() {
    const stmt = this.db.prepare(`SELECT * FROM wallet_summary_view ORDER BY current_balance DESC`);
    return stmt.all();
  }

  getAuditLogs(walletId) {
    const stmt = this.db.prepare(`SELECT * FROM transaction_audit_view WHERE wallet_id = ? ORDER BY id ASC`);
    return stmt.all(walletId);
  }

  reset() {
    this.db.exec(`
      DELETE FROM wallet_summary_view;
      DELETE FROM transaction_audit_view;
    `);
  }

  close() {
    this.db.close();
  }
}

module.exports = { ReadDatabase };
