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
export const CREATE_TABLE_VOTERS = `
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
)`;

export type VotersByContractAndRound = {
  date: string;
  contract: string;
  round: number,
  countVoters: number,
  totalVotes: number;
  proportionalMeta: number;
}

export const CREATE_TABLE_VOTERS_PER_DAY_CONTRACT_ROUND = `
CREATE TABLE IF NOT EXISTS voters_per_day_contract_round (
    date TEXT,
    contract TEXT,
    round INTEGER,
    countVoters INTEGER,
    totalVotes INTEGER,
    proportionalMeta INTEGER,
    PRIMARY KEY (date, contract, round)
)`;