import Database from 'better-sqlite3'
import type { OutcomeRow } from './aggregate'

export type ReputationDb = InstanceType<typeof Database>

// ─── Schema ───────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS outcome_rows (
    intentHash  TEXT    NOT NULL PRIMARY KEY,
    anchorId    TEXT    NOT NULL,
    filled      INTEGER NOT NULL,
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

/**
 * Appends a single outcome row.
 * Uses INSERT OR REPLACE so re-processing the same intentHash is idempotent.
 */
export function appendRow(db: ReputationDb, row: OutcomeRow): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO outcome_rows
      (intentHash, anchorId, filled, settleMs, slippage, recordedAt, disputed, disputed_reason)
    VALUES
      (@intentHash, @anchorId, @filled, @settleMs, @slippage, @recordedAt, @disputed, @disputed_reason)
  `)
  stmt.run({
    ...row,
    disputed: row.disputed ?? false,
    disputed_reason: row.disputed_reason ?? null,
  })
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns all outcome rows for a given anchor, ordered by recordedAt ascending.
 */
export function queryRows(db: ReputationDb, anchorId: string): OutcomeRow[] {
  const rows = db
    .prepare(
      `SELECT intentHash, anchorId, filled, settleMs, slippage, recordedAt
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
  }>

  return rows.map((r) => ({
    ...r,
    filled: r.filled === 1,
    disputed: r.disputed === 1,
    disputed_reason: r.disputed_reason ?? null,
  }))
}
