export const APP_CODE = "vote-tracker"

export type AppDbVersion = {
  app_code: string;
  version: number;
  date_updated: string;
}

export const CREATE_TABLE_APP_DEB_VERSION = `
CREATE TABLE IF NOT EXISTS app_db_version (
  app_code TEXT,
  version INTEGER,
  date_updated TEXT,
  PRIMARY KEY (app_code)
)`;


export type VotersRow = {
  date: string;
  account_id: string;
  vp_in_use: number;
  vp_idle: number;
  vp_for_payment: number;
  meta_locked: number;
  meta_unlocking: number;
  meta_unlocked: number;
  vp_in_validators: number;
  vp_in_launches: number;
  vp_in_ambassadors: number;
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

export type AvailableClaims = {
  date: string;
  account_id: string;
  token_code: number, // 0=stNEAR
  claimable_amount: number,
}

export const CREATE_TABLE_AVAILABLE_CLAIMS = `
CREATE TABLE IF NOT EXISTS available_claims (
    date TEXT,
    account_id TEXT,
    token_code INTEGER,
    claimable_amount DOUBLE PRECISION,
    PRIMARY KEY (date, account_id, token_code)
)`;

export interface ENO {
  unix_timestamp: number
  epoch_id: string
  pool_id: string
  non_liquid_stake: number
  liquid_stake: number
}

export const CREATE_TABLE_ENO = `
CREATE TABLE IF NOT EXISTS eno (
  unix_timestamp INTEGER,
  epoch_id TEXT,
  pool_id TEXT,
  non_liquid_stake DOUBLE PRECISION,
  liquid_stake DOUBLE PRECISION,
  PRIMARY KEY (unix_timestamp, epoch_id, pool_id)
)`;

export interface ENODelegator {
  unix_timestamp: number
  epoch_id: string
  pool_id: string
  account_id: string
  stake: number
}

export interface ValidatorStakeHistory {
  unix_timestamp: number
  epoch_id: string
  pool_id: string
  stake: number
  reward_amount: number
  projected_apy_bp: number
}

export const CREATE_TABLE_ENO_BY_DELEGATOR = `
CREATE TABLE IF NOT EXISTS eno_by_delegator (
  unix_timestamp INTEGER,
  epoch_id TEXT,
  pool_id TEXT,
  account_id TEXT,
  stake DOUBLE PRECISION,
  PRIMARY KEY (unix_timestamp, epoch_id, pool_id, account_id)
)`;

export const CREATE_TABLE_VALIDATOR_STAKE_HISTORY = `
CREATE TABLE IF NOT EXISTS validator_stake_history (
  unix_timestamp INTEGER,
  epoch_id TEXT,
  pool_id TEXT,
  stake DOUBLE PRECISION,
  reward_amount DOUBLE PRECISION,
  projected_apy_bp INTEGER,
  PRIMARY KEY (unix_timestamp, epoch_id, pool_id)
)`;