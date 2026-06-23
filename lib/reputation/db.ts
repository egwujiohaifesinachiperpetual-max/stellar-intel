import Database from 'better-sqlite3'
import type { OutcomeRow } from '@/types/reputation'

export type ReputationDb = InstanceType<typeof Database>

// ─── Schema ───────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS outcome_rows (
    intentHash  TEXT    NOT NULL PRIMARY KEY,
    anchorId    TEXT    NOT NULL,
    filled      INTEGER NOT NULL,
    settleMs    REAL,
    slippage    REAL,
    disputed    BOOLEAN NOT NULL DEFAULT FALSE,
    disputed_reason TEXT,
    recordedAt  INTEGER NOT NULL
  )
`

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Opens (or creates) a reputation SQLite database.
 * Pass `":memory:"` for an ephemeral in-process store suitable for tests.
 */
export function openDb(path: string = ':memory:'): ReputationDb {
  const db = new Database(path)
  db.exec(CREATE_TABLE_SQL)
  return db
}

// ─── Write ────────────────────────────────────────────────────────────────────

export function appendRow(db: ReputationDb, row: OutcomeRow): void {
  const stmt = db.prepare(`
    INSERT INTO outcome_rows
      (intentHash, anchorId, filled, settleMs, slippage, recordedAt, disputed, disputed_reason)
    VALUES
      (@intentHash, @anchorId, @filled, @settleMs, @slippage, @recordedAt, FALSE, NULL)
    ON CONFLICT(intentHash) DO UPDATE SET
      anchorId = excluded.anchorId,
      filled = excluded.filled,
      settleMs = excluded.settleMs,
      slippage = excluded.slippage,
      recordedAt = excluded.recordedAt
  `)
  stmt.run({
    ...row,
    filled: row.filled ? 1 : 0,
  })
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export function queryRows(db: ReputationDb, anchorId: string): OutcomeRow[] {
  const rows = db
    .prepare(
      `SELECT intentHash, anchorId, filled, settleMs, slippage, recordedAt, disputed, disputed_reason
       FROM outcome_rows
       WHERE anchorId = ?
       ORDER BY recordedAt ASC`,
    )
    .all(anchorId) as Array<{
    intentHash: string
    anchorId: string
    filled: number
    settleMs: number | null
    slippage: number | null
    recordedAt: number
    disputed: number
    disputed_reason: string | null
  }>

  return rows.map((r) => ({
    ...r,
    filled: r.filled === 1,
    disputed: r.disputed === 1,
    disputed_reason: r.disputed_reason ?? null,
  }))
}

/**
 * Sets the disputed flag and reason for a specific outcome row.
 */
export function disputeRow(db: ReputationDb, intentHash: string, reason: string): void {
  const stmt = db.prepare(`
    UPDATE outcome_rows
    SET disputed = 1, disputed_reason = ?
    WHERE intentHash = ?
  `)
  stmt.run(reason, intentHash)
}
