import { Client } from 'pg';
import { Database } from 'sqlite3';
import { run } from './sq3';

export async function createTableVotersIfNotExists(client: Client) {
  try {
    // Connect to your database
    await client.connect();

    // Query to create a new table
    const queryText = `
    CREATE TABLE IF NOT EXISTS voters (
        date TEXT,
        account_id TEXT,
        vp_in_use INTEGER,
        vp_idle INTEGER,
        meta_locked INTEGER,
        meta_unlocking INTEGER,
        meta_unlocked INTEGER,
        vp_in_validators INTEGER,
        vp_in_launches INTEGER,
        vp_in_ambassadors INTEGER,
        PRIMARY KEY (date, account_id)
    );`;

    // Execute the query
    const res = await client.query(queryText);

    console.log('Table is successfully created');
  } catch (err) {
    console.error('An error occurred', err);
  }
}
export async function createTableVotersSqLiteIfNotExists(db: Database) {
  await run(db, 
      `create table if not exists 
      voters (
      date text,
      account_id text,
      vp_in_use integer,
      vp_idle integer,
      meta_locked integer,
      meta_unlocking integer,
      meta_unlocked integer,
      vp_in_validators integer,
      vp_in_launches integer,
      vp_in_ambassadors integer,
      PRIMARY KEY (date, account_id)
      )`
  );
}

export type VotersRow = {
  date: string;
  account_id: string;
  vp_in_use: number;
  vp_idle: number;
  meta_locked: number;
  meta_unlocking: number;
  meta_unlocked: number;
  vp_in_validators: number;
  vp_in_launches: number;
  vp_in_ambassadors: number;
  //vp_in_others: number;
}