import * as sqlite3 from "sqlite3";

// Hack to look like node-postgresql
// (and handle async / await operation)
export async function open(filename: string): Promise<sqlite3.Database> {
  return new Promise(function (resolve, reject) {
    const db = new sqlite3.Database(filename, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
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
  cmd: "insert"|"insert or replace",
  db: sqlite3.Database,
  table: string,
  rows: any[],
  onConflictWhere?: string,
  convertFn?: (key: string, value: any) => any)
  : Promise<sqlite3.RunResult> {
  await run(db, "begin transaction", undefined);
  for (let row of rows) {
    let fields = [], placeholders = [], values = []
    for (let key in row) {
      fields.push(key)
      placeholders.push("?")
      values.push(convertFn ? convertFn(key, row[key]) : row[key])
    }
    let statement = `${cmd} into ${table}(${fields.join(",")}) values (${placeholders.join(",")})`
    if (onConflictWhere) {
      statement = statement + " ON CONFLICT DO UPDATE SET "
      for (let field of fields) {
        statement = statement + `${field}=excluded.${field},`
      }
      // remove last comma
      statement = statement.slice(0,-1)
      statement = statement + " " + onConflictWhere
    }
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
    return insertCommon("insert",db,table,rows,"",convertFn)
  }

export async function insertOrReplaceRows(
  db: sqlite3.Database,
  table: string,
  rows: any[],
  convertFn?: (key: string, value: any) => any)
  : Promise<sqlite3.RunResult> {
    return insertCommon("insert or replace",db,table,rows,"",convertFn)
  }
  
export async function insertOnConflictUpdate(
  db: sqlite3.Database,
  table: string,
  rows: any[],
  onConflictWhere: string,
  convertFn?: (key: string, value: any) => any)
  : Promise<sqlite3.RunResult> {
    return insertCommon("insert or replace",db,table,rows,onConflictWhere,convertFn)
  }

    // export async function upsertRows(
//   db: sqlite3.Database,
//   table: string,
//   keys: string,
//   rows: any[],
//   convertFn?: (key: string, value: any) => any)
//   : Promise<sqlite3.RunResult> {
//   await run(db, "begin transaction", undefined);
//   for (let row of rows) {
//     let insertFields = [], insertPlaceholders = [], values = []
//     let updateValues = [], updatePlaceholders = []
//     for (let key in row) {
//       insertFields.push(key)
//       insertPlaceholders.push("?")
//       values.push(convertFn ? convertFn(key, row[key]) : row[key])
//     }
//     for (let key in row) {
//       updateFields.push(key)
//       updatePlaceholders.push("?")
//       values.push(convertFn ? convertFn(key, row[key]) : row[key])
//     }
//     await run(db, 
//       `insert into ${table}(${insertFields.join(",")})
//        values (${insertPlaceholders.join(",")})
       
//       `, values)
//   }
//   return run(db, "commit", undefined)
// }
