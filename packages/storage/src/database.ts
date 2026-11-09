// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { DatabaseSync } from "node:sqlite";

export interface VerdictaDatabase {
  /** Raw handle for white-box tests and diagnostics. */
  raw(): DatabaseSync;
  close(): void;
}

interface Migration {
  readonly version: number;
  readonly statements: readonly string[];
}

/**
 * Versioned, forward-only migrations (coding-conventions section 6).
 * Recovery from the previous schema version is a test obligation.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE transition_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id),
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        at TEXT NOT NULL,
        owner TEXT NOT NULL,
        verdict TEXT,
        terminal_reason TEXT
      )`,
      `CREATE INDEX idx_transition_events_run ON transition_events(run_id)`,
    ],
  },
];

function currentVersion(db: DatabaseSync): number {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (table === undefined) return 0;
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as
    { v: number | null } | undefined;
  return row?.v ?? 0;
}

function migrate(db: DatabaseSync): void {
  const applied = currentVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version <= applied) continue;
    db.exec("BEGIN");
    try {
      for (const statement of migration.statements) {
        db.exec(statement);
      }
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function openDatabase(path: string): VerdictaDatabase {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return {
    raw: () => db,
    close: () => db.close(),
  };
}
