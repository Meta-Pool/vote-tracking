import { Database } from "sqlite3";
import { run } from "./sq3";

export async function createTableVotersIfNotExists(db: Database) {
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
    date:string;
    account_id: string;
    vp_in_use: number;
    vp_idle: number;
    meta_locked: number;
    meta_unlocking: number;
    meta_unlocked: number;
    vp_in_validators: number;
    vp_in_launches: number;
    vp_in_ambassadors: number;
  }