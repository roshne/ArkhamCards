// Web stand-in for @op-engineering/op-sqlite (aliased in metro.config.js for web only).
// Implements the slice of op-sqlite that Database.ts's typeORMDriver uses, on sql.js.
// shortcut: databases live in memory, so they are rebuilt from the bundled card DB on every
// page load; persist to IndexedDB if the web build ever has to keep synced card data.
// @ts-expect-error sql.js ships no types for its dist files
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';

interface SqlJsStatement {
  bind(params: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}
interface SqlJsDatabase {
  prepare(sql: string): SqlJsStatement;
  exec(sql: string): { values: unknown[][] }[];
  getRowsModified(): number;
  close(): void;
}
interface SqlJs {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  insertId?: number;
  rowsAffected: number;
}

const sqlP: Promise<SqlJs> = initSqlJs();
const databases: { [name: string]: Promise<SqlJsDatabase> } = {};

function getDatabase(name: string): Promise<SqlJsDatabase> {
  if (!databases[name]) {
    databases[name] = sqlP.then((SQL) => new SQL.Database());
  }
  return databases[name];
}

// Swap the in-memory database behind `name` for a copy of `bytes`. Queries started after the
// swap, including on connections already open, use the new database. A transaction already in
// progress fails on its next statement, because the old database is closed; the only swap runs
// at startup, before any transaction.
export function replaceDatabase(name: string, bytes: Uint8Array): Promise<void> {
  const previous = databases[name];
  databases[name] = sqlP.then((SQL) => new SQL.Database(bytes));
  return Promise.all([previous, databases[name]]).then(([old]) => {
    old?.close();
  });
}

function run(db: SqlJsDatabase, sql: string, params?: unknown[]): QueryResult {
  // shortcut: prepare() runs only the first statement of a multi-statement string, where
  // op-sqlite runs them all. Nothing on web sends one; split the string if that changes.
  const statement = db.prepare(sql);
  try {
    // sql.js rejects undefined, which TypeORM passes for missing values.
    statement.bind((params || []).map((p) => (p === undefined ? null : p)));
    const rows: Record<string, unknown>[] = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    const rowsAffected = db.getRowsModified();
    const insertId = /^\s*insert/i.test(sql) ?
      Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0][0]) :
      undefined;
    return { rows, insertId, rowsAffected };
  } finally {
    statement.free();
  }
}

export function open({ name }: { name: string; location?: string }) {
  return {
    executeWithHostObjects: async(sql: string, params?: unknown[]) => run(await getDatabase(name), sql, params),
    execute: async(sql: string, params?: unknown[]) => run(await getDatabase(name), sql, params),
    transaction: async(fn: (tx: { execute: (sql: string, params?: unknown[]) => Promise<QueryResult> }) => Promise<void>) => {
      const db = await getDatabase(name);
      run(db, 'BEGIN');
      try {
        await fn({ execute: async(sql, params) => run(db, sql, params) });
        run(db, 'COMMIT');
      } catch (e) {
        run(db, 'ROLLBACK');
        throw e;
      }
    },
    close: () => undefined,
    attach: () => {
      throw new Error('ATTACH is not supported by the web SQLite shim');
    },
    detach: () => undefined,
  };
}

export type Transaction = Parameters<Parameters<ReturnType<typeof open>['transaction']>[0]>[0];
