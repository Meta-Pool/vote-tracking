import * as sqlite3 from "sqlite3";
import { OnConflictArgs, buildInsert } from "./sqlBuilder";

// Hack to make sqlite3 look like node-postgresql
// and handle async / await operations

export async function open(filename: string, readOnly: boolean = false): Promise<sqlite3.Database> {
  return new Promise(function (resolve, reject) {
    const openMode = readOnly ? sqlite3.OPEN_READONLY : (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE)
    const db = new sqlite3.Database(filename, openMode, (err) => {
      if (err) {
        console.error("filename", filename)
        reject(err);
      }
      resolve(db);
    });
  });
}

export async function query(db: sqlite3.Database, sql: string, params: any): Promise<any> {
  return new Promise(function (resolve, reject) {
    db.all(sql, params, function (error, rows) {
      if (error)
        reject(error);
      else
        resolve({ rows: rows });
    });
  });
}

export async function run(db: sqlite3.Database, sql: string, params?: any): Promise<sqlite3.RunResult> {
  return new Promise(function (resolve, reject) {
    db.run(sql, params, function (error) {
      if (error) {
        console.error("err on db.run", sql)
        reject(error);
      }
      else
        resolve(this);
    });
  });
}



async function insertCommon(
  cmd: "insert" | "insert or replace",
  db: sqlite3.Database,
  table: string,
  rows: any[],
  onConflict?: OnConflictArgs,
  convertFn?: (key: string, value: any) => any)
  : Promise<sqlite3.RunResult> {
  await run(db, "begin transaction", undefined);
  for (let originalRow of rows) {
    // covert if required
    let row: Record<string, any>;
    if (convertFn) {
      row = {}
      for (let key in originalRow) {
        row[key] = convertFn(key, originalRow[key])
      }
    }
    else {
      row = originalRow
    }
    const { statement, values } = buildInsert("sq3", cmd, table, row,onConflict)
    await run(db, statement, values)
  }
  return run(db, "commit", undefined)
}

export async function insertRows(
  db: sqlite3.Database,
  table: string,
  rows: any[],
  convertFn?: (key: string, value: any) => any)
  : Promise<sqlite3.RunResult> {
  return insertCommon("insert", db, table, rows, undefined, convertFn)
}

export async function insertOrReplaceRows(
  db: sqlite3.Database,
  table: string,
  rows: any[],
  convertFn?: (key: string, value: any) => any)
  : Promise<sqlite3.RunResult> {
  return insertCommon("insert or replace", db, table, rows, undefined, convertFn)
}

export async function insertOnConflictUpdate(
  db: sqlite3.Database,
  table: string,
  rows: any[],
  onConflict?: OnConflictArgs,
  convertFn?: (key: string, value: any) => any)
  : Promise<sqlite3.RunResult> {
  return insertCommon("insert or replace", db, table, rows, onConflict, convertFn)
}