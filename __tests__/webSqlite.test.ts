import { describe, expect, it } from '@jest/globals';
// @ts-expect-error sql.js ships no types for its dist files
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import { open, replaceDatabase } from '../src/data/sqlite/webSqlite';

describe('webSqlite (op-sqlite stand-in for web)', () => {
  it('binds booleans and undefined, and reports insertId and rowsAffected', async() => {
    const db = open({ name: 'binding' });
    await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, flag INTEGER, note TEXT)');
    const insert = await db.execute('INSERT INTO t (flag, note) VALUES (?, ?)', [true, undefined]);
    expect(insert.insertId).toBe(1);
    expect(insert.rowsAffected).toBe(1);
    const select = await db.executeWithHostObjects('SELECT flag, note FROM t WHERE flag = ?', [true]);
    expect(select.rows).toEqual([{ flag: 1, note: null }]);
  });

  it('rolls a failed transaction back', async() => {
    const db = open({ name: 'tx' });
    await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await expect(db.transaction(async(tx) => {
      await tx.execute('INSERT INTO t (id) VALUES (1)');
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect((await db.execute('SELECT COUNT(*) AS n FROM t')).rows).toEqual([{ n: 0 }]);
  });

  it('swaps the database behind an open connection', async() => {
    const db = open({ name: 'swap' });
    await db.execute('CREATE TABLE empty_table (id INTEGER)');
    const SQL = await initSqlJs();
    const seed = new SQL.Database();
    seed.run("CREATE TABLE card (code TEXT); INSERT INTO card VALUES ('01001')");
    await replaceDatabase('swap', seed.export());
    expect((await db.execute('SELECT code FROM card')).rows).toEqual([{ code: '01001' }]);
    await expect(db.execute('SELECT * FROM empty_table')).rejects.toThrow(/no such table/);
  });
});
