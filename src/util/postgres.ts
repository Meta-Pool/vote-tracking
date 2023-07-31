import { Client } from 'pg';
import { VotersRow } from './tables';

export async function insertOnConflictUpdate(
  client: Client,
  dbRows: VotersRow[]
) {
  for (const row of dbRows) {
    const query = `
      INSERT INTO voters (
        date,
        account_id,
        vp_in_use,
        vp_idle,
        meta_locked,
        meta_unlocking,
        meta_unlocked,
        vp_in_validators,
        vp_in_launches,
        vp_in_ambassadors
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (date, account_id)
      DO UPDATE SET
        vp_in_use = excluded.vp_in_use,
        vp_idle = excluded.vp_idle,
        meta_locked = excluded.meta_locked,
        meta_unlocking = excluded.meta_unlocking,
        meta_unlocked = excluded.meta_unlocked,
        vp_in_validators = excluded.vp_in_validators,
        vp_in_launches = excluded.vp_in_launches,
        vp_in_ambassadors = excluded.vp_in_ambassadors
      WHERE excluded.vp_in_use > voters.vp_in_use
    `;

    const values = [
      row.date,
      row.account_id,
      row.vp_in_use,
      row.vp_idle,
      row.meta_locked,
      row.meta_unlocking,
      row.meta_unlocked,
      row.vp_in_validators,
      row.vp_in_launches,
      row.vp_in_ambassadors
    ];

    try {
      await client.query(query, values);
    } catch (err) {
      console.error('An error occurred', err);
    }
  }
}

