import { existsSync, mkdirSync, readFile, readFileSync, rmdirSync, writeFileSync } from "fs";
import { MpDaoVoteContract, VoterInfo } from "./contracts/mpdao-vote";
import { setRpcUrl, yton } from "near-api-lite";
import { argv, cwd, env } from "process";
import { APP_CODE, AvailableClaims, CREATE_TABLE_APP_DEB_VERSION, CREATE_TABLE_AVAILABLE_CLAIMS, CREATE_TABLE_ENO, CREATE_TABLE_ENO_BY_DELEGATOR, CREATE_TABLE_VALIDATOR_STAKE_HISTORY, CREATE_TABLE_VOTERS, CREATE_TABLE_VOTERS_PER_DAY_CONTRACT_ROUND, ENO, ENODelegator, ValidatorStakeHistory, VotersByContractAndRound, VotersRow } from "./util/tables";
import { setRecentlyFreezedFoldersVotes } from "./votesSetter";
import * as sq3 from './util/sq3';
import { Database as SqLiteDatabase } from "sqlite3";


import { Client } from 'pg';
import { join } from "path";
import { OnConflictArgs, buildInsert } from "./util/sqlBuilder";
import { getPgConfig } from "./util/postgres";
import { consoleShowVotesFor } from "./votesFor";
import { isoTruncDate, toNumber } from "./util/convert";
import { isDryRun, setGlobalDryRunMode } from "./contracts/base-smart-contract";
import { showMigrated } from "./migration/show-migrated";
import { showClaimsStNear } from "./claims/show-claims-stnear";
import { computeAsDate } from "./compute-as-date";
import { homedir } from "os";
import { generateDelegatorTableDataSince, generateTableDataByDelegatorSince, getValidatorArrayStakeHistorySince, getENOsContracts, getDelegatorGroupContracts } from "./ENOs/delegators";
import { saveVoteSnapshotIntoSqliteDb } from "./migration/saveVoteSnapshotIntoSqliteDb";


type ByContractAndRoundInfoType = {
    contract: string;
    round: number,
    countVoters: number,
    totalVotes: number;
    proportionalMpDao: number;
}
type MetaVoteMetricsType = {
    metaVoteUserCount: number;
    totalLocked: number;
    totalUnlocking: number;
    totalUnLocked: number;
    totalVotingPower: number;
    totalVotingPowerUsed: number;
    votesPerContractAndRound: ByContractAndRoundInfoType[];

    totalLocking30d: number;
    totalLocking60d: number;
    totalLocking90d: number;
    totalLocking120d: number;
    totalLocking180d: number;
    totalLocking240d: number;
    totalLocking300d: number;

    totalUnlocking7dOrLess: number;
    totalUnlocking15dOrLess: number;
    totalUnlocking30dOrLess: number;
    totalUnlocking60dOrLess: number;
    totalUnlocking90dOrLess: number;
    totalUnlocking120dOrLess: number;
    totalUnlocking180dOrLess: number;
    totalUnlocking240dOrLess: number;
    totalUnlockingMores240d: number;
}

type EnoPersistentData = {
    lastRecordedTimestamp: number
    lastRecordedTimestampByDelegator: number
    lastRecordedStakeHistory: number
}

export async function processMpDaoVote(allVoters: VoterInfo[], decimals = 6, dateString: string | undefined = undefined):
    Promise<{
        metrics: MetaVoteMetricsType,
        dbRows: VotersRow[],
        dbRows2: VotersByContractAndRound[],
        extraMetrics: {
            totalLockedB: bigint;
            totalUnlockingB: bigint;
            totalUnLockedB: bigint,
        }
    }> {

    if (!dateString) {
        // subtract 30 seconds, so the cron running 2023-03-30 00:04 registers "end of day data" for 2023-03-29
        dateString = (new Date(Date.now() - 30000).toISOString()).slice(0, 10)
    }

    //---
    let totalLocked = BigInt(0)
    let totalUnlocking = BigInt(0)
    let totalUnlocked = BigInt(0)
    let totalVotingPower = 0
    let totalVotingPowerUsed = 0
    let votesPerContractAndRound: ByContractAndRoundInfoType[] = []

    //const E24 = BigInt("1" + "0".repeat(24))
    const E6 = BigInt("1" + "0".repeat(6))

    let totalLocking30d = 0
    let totalLocking60d = 0
    let totalLocking90d = 0
    let totalLocking120d = 0
    let totalLocking180d = 0
    let totalLocking240d = 0
    let totalLocking300d = 0

    let totalUnlocking7dOrLess = 0
    let totalUnlocking15dOrLess = 0
    let totalUnlocking30dOrLess = 0
    let totalUnlocking60dOrLess = 0
    let totalUnlocking90dOrLess = 0
    let totalUnlocking120dOrLess = 0
    let totalUnlocking180dOrLess = 0
    let totalUnlocking240dOrLess = 0
    let totalUnlockingMores240d = 0

    let countLockedAndUnlocking = 0
    let dbRows: VotersRow[] = []

    // NOTE: only users WITH LOCKING POSITIONS are registered here
    // migration grace period (no need to vote to gey paid) until July 1st for the NEAR side
    // waiver including August for the eth side
    const isGracePeriodNEARSide = isoTruncDate() < "2024-06-01"
    const extendGracePeriodForEthBased = isoTruncDate() < "2024-09-01"

    console.log("processMetaVote, allVoters.length:", allVoters.length)

    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;
        const voterIsEthMirror = voter.voter_id.endsWith(".evmp.near") || voter.voter_id.endsWith(".evmp.testnet")

        // if (isDryRun()) console.log("--", voter.voter_id);
        let userTotalVotingPower = 0
        let userTotalMpDaoLocked = BigInt(0)
        let userTotalMpDaoUnlocking = BigInt(0)
        let userTotalMpDaoUnlocked = BigInt(0)
        let hasLockedOrUnlocking = false
        for (let lp of voter.locking_positions) {
            const mpDaoAmountNum = Number(BigInt(lp.amount) / E6)
            if (lp.is_locked) {
                userTotalMpDaoLocked += BigInt(lp.amount)
                userTotalVotingPower += yton(lp.voting_power)
                hasLockedOrUnlocking = true
                if (lp.locking_period <= 30) {
                    totalLocking30d += mpDaoAmountNum
                } else if (lp.locking_period <= 60) {
                    totalLocking60d += mpDaoAmountNum
                } else if (lp.locking_period <= 90) {
                    totalLocking90d += mpDaoAmountNum
                } else if (lp.locking_period <= 120) {
                    totalLocking120d += mpDaoAmountNum
                } else if (lp.locking_period <= 180) {
                    totalLocking180d += mpDaoAmountNum
                } else if (lp.locking_period <= 240) {
                    totalLocking240d += mpDaoAmountNum
                } else {
                    totalLocking300d += mpDaoAmountNum
                }
            }
            else if (lp.is_unlocked) {
                userTotalMpDaoUnlocked += BigInt(lp.amount)
            }
            else {
                userTotalMpDaoUnlocking += BigInt(lp.amount)
                hasLockedOrUnlocking = true
                const unixMsTimeNow = new Date().getTime()
                const unlockingEndsAt = (lp.unlocking_started_at || 0) + lp.locking_period * 24 * 60 * 60 * 1000
                const remainingDays = Math.trunc((unlockingEndsAt - unixMsTimeNow) / 1000 / 60 / 60 / 24)
                if (remainingDays <= 7) {
                    totalUnlocking7dOrLess += mpDaoAmountNum
                } else if (remainingDays <= 15) {
                    totalUnlocking15dOrLess += mpDaoAmountNum
                } else if (remainingDays <= 30) {
                    totalUnlocking30dOrLess += mpDaoAmountNum
                } else if (remainingDays <= 60) {
                    totalUnlocking60dOrLess += mpDaoAmountNum
                } else if (remainingDays <= 90) {
                    totalUnlocking90dOrLess += mpDaoAmountNum
                } else if (remainingDays <= 120) {
                    totalUnlocking120dOrLess += mpDaoAmountNum
                } else if (remainingDays <= 180) {
                    totalUnlocking180dOrLess += mpDaoAmountNum
                } else if (remainingDays <= 240) {
                    totalUnlocking240dOrLess += mpDaoAmountNum
                } else {
                    totalUnlockingMores240d += mpDaoAmountNum
                }
            }
        }
        if (hasLockedOrUnlocking) countLockedAndUnlocking += 1;

        totalVotingPower += userTotalVotingPower
        totalLocked += userTotalMpDaoLocked
        totalUnlocking += userTotalMpDaoUnlocking
        totalUnlocked += userTotalMpDaoUnlocked;

        let userTotalVpInUse = 0
        let userTotalVpInValidators = 0
        let userTotalVpInLaunches = 0
        let userTotalVpInAmbassadors = 0
        let userTotalVpInOther = 0
        if (voter.vote_positions || userTotalVotingPower > 0) {
            // flag to not count the voter twice
            // if they voted for more than one initiative
            let voterCounted: Record<string, boolean> = {}
            for (let vp of voter.vote_positions) {

                const positionVotingPower = yton(vp.voting_power)
                if (positionVotingPower == 0) continue;

                // compute proportional meta locked for this vote
                const proportionalMpDao = toNumber(userTotalMpDaoLocked, decimals) * (positionVotingPower / userTotalVotingPower);
                userTotalVpInUse += positionVotingPower
                totalVotingPowerUsed += positionVotingPower

                let round = 0
                if (vp.votable_address == "metastaking.app") {
                    userTotalVpInValidators += positionVotingPower
                } else if (vp.votable_address == "metayield.app") {
                    userTotalVpInLaunches += positionVotingPower
                } else if (vp.votable_address == "initiatives") {
                    userTotalVpInAmbassadors += positionVotingPower
                    // get round# from object_id
                    for (let n = 99; n > 1; n--) {
                        if (vp.votable_object_id.includes(`Round #${n} `) || vp.votable_object_id.includes(`Round #${n}-`)) {
                            round = n;
                            break;
                        }
                        if (vp.votable_object_id.includes(`Grants #${n} `) || vp.votable_object_id.includes(`Grants #${n}-`)) {
                            round = n;
                            break;
                        }
                    }
                } else {
                    userTotalVpInOther += positionVotingPower
                }

                let countVoterId = vp.votable_address + `- Round #${round}`
                let prev = votesPerContractAndRound.find(i => i.contract == vp.votable_address && i.round == round)
                if (!prev) {
                    votesPerContractAndRound.push({
                        contract: vp.votable_address,
                        round,
                        countVoters: 1,
                        totalVotes: positionVotingPower,
                        proportionalMpDao: proportionalMpDao
                    })
                    voterCounted[countVoterId] = true
                }
                else {
                    if (!voterCounted[countVoterId]) {
                        prev.countVoters += 1;
                        voterCounted[countVoterId] = true
                    }
                    prev.totalVotes += positionVotingPower
                    prev.proportionalMpDao += proportionalMpDao
                }
            }

            const vp_for_payment = (isGracePeriodNEARSide || (voterIsEthMirror && extendGracePeriodForEthBased)) ?
                userTotalVotingPower
                : userTotalVpInUse;
            dbRows.push({
                date: dateString,
                account_id: voter.voter_id,
                vp_in_use: Math.trunc(userTotalVpInUse),
                vp_idle: Math.trunc(userTotalVotingPower - userTotalVpInUse),
                vp_for_payment: Math.trunc(vp_for_payment),
                meta_locked: Math.trunc(toNumber(userTotalMpDaoLocked, decimals)), // keep old "meta" name for backward compat
                meta_unlocking: Math.trunc(toNumber(userTotalMpDaoUnlocking, decimals)),
                meta_unlocked: Math.trunc(toNumber(userTotalMpDaoUnlocked, decimals)),
                vp_in_validators: Math.trunc(userTotalVpInValidators),
                vp_in_launches: Math.trunc(userTotalVpInLaunches),
                vp_in_ambassadors: Math.trunc(userTotalVpInAmbassadors),
            })

        }

    }

    // prepare rows to be sent to table to track votes by contract & round
    let dbRows2: VotersByContractAndRound[] = []
    for (let item of votesPerContractAndRound) {
        dbRows2.push(
            {
                date: dateString,
                contract: item.contract,
                round: item.round,
                countVoters: item.countVoters,
                totalVotes: Math.round(item.totalVotes),
                proportionalMeta: Math.round(item.proportionalMpDao)
            })
    }

    if (isDryRun()) {
        console.log("countLockedAndUnlocking", countLockedAndUnlocking)
    }

    return {
        metrics: {
            metaVoteUserCount: allVoters.length,
            totalLocked: toNumber(totalLocked, decimals),
            totalUnlocking: toNumber(totalUnlocking, decimals),
            totalUnLocked: toNumber(totalUnlocked, decimals),
            totalVotingPower: totalVotingPower,
            totalVotingPowerUsed: totalVotingPowerUsed,
            votesPerContractAndRound: votesPerContractAndRound,
            totalLocking30d,
            totalLocking60d,
            totalLocking90d,
            totalLocking120d,
            totalLocking180d,
            totalLocking240d,
            totalLocking300d,
            totalUnlocking7dOrLess,
            totalUnlocking15dOrLess,
            totalUnlocking30dOrLess,
            totalUnlocking60dOrLess,
            totalUnlocking90dOrLess,
            totalUnlocking120dOrLess,
            totalUnlocking180dOrLess,
            totalUnlocking240dOrLess,
            totalUnlockingMores240d
        },
        dbRows,
        dbRows2,
        extraMetrics: {
            totalLockedB: totalLocked,
            totalUnlockingB: totalUnlocking,
            totalUnLockedB: totalUnlocked,
        }
    }

}

async function pgInsertOnConflict(client: Client, table: string, dbRows: Record<string, any>[], onConflict?: OnConflictArgs) {
    await client.query("BEGIN TRANSACTION");
    let errorReported = false
    for (const row of dbRows) {
        const { statement, values } = buildInsert("pg",
            "insert", table, row, onConflict)
        try {
            await client.query(statement, values);
        } catch (err) {
            console.error(`inserting on ${table}`)
            console.error('An error occurred', err);
            console.error(statement)
            console.error(values)
            errorReported = true;
            break;
        }
    }
    await client.query(errorReported ? "ROLLBACK" : "COMMIT");
}


async function pgInsertVotersHighWaterMark(
    client: Client,
    dbRows: VotersRow[]
) {
    await pgInsertOnConflict(client, "voters", dbRows, {
        onConflictArgument: "(date,account_id)",
        onConflictCondition: "WHERE excluded.vp_in_use > voters.vp_in_use OR excluded.vp_for_payment > voters.vp_for_payment"
    })
}

async function pgInsertENOsData(
    client: Client,
    dbRows: ENO[]
) {
    await pgInsertOnConflict(client, "eno", dbRows)
}

async function pgInsertENOsByDelegatorsData(
    client: Client,
    dbRows: ENODelegator[]
) {
    await pgInsertOnConflict(client, "eno_by_delegator", dbRows)
}

async function pgInsertValidatorEpochHistory(
    client: Client,
    dbRows: ValidatorStakeHistory[]
) {
    await pgInsertOnConflict(client, "validator_stake_history", dbRows)
}

// async function pgInsertVotersHighWaterMark(
//     client: Client,
//     dbRows: VotersRow[]
//   ) {
//     for (const row of dbRows) {
//       const query = `
//         INSERT INTO voters (
//           date,
//           account_id,
//           vp_in_use,
//           vp_idle,
//           meta_locked,
//           meta_unlocking,
//           meta_unlocked,
//           vp_in_validators,
//           vp_in_launches,
//           vp_in_ambassadors
//         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
//         ON CONFLICT (date, account_id)
//         DO UPDATE SET
//           vp_in_use = excluded.vp_in_use,
//           vp_idle = excluded.vp_idle,
//           meta_locked = excluded.meta_locked,
//           meta_unlocking = excluded.meta_unlocking,
//           meta_unlocked = excluded.meta_unlocked,
//           vp_in_validators = excluded.vp_in_validators,
//           vp_in_launches = excluded.vp_in_launches,
//           vp_in_ambassadors = excluded.vp_in_ambassadors
//         WHERE excluded.vp_in_use > voters.vp_in_use
//       `;

//       const values = [
//         row.date,
//         row.account_id,
//         row.vp_in_use,
//         row.vp_idle,
//         row.meta_locked,
//         row.meta_unlocking,
//         row.meta_unlocked,
//         row.vp_in_validators,
//         row.vp_in_launches,
//         row.vp_in_ambassadors
//       ];

//       try {
//         await client.query(query, values);
//       } catch (err) {
//         console.error('An error occurred', err);
//       }
//     }
//   }

async function pgInsertVotersPerContract(
    client: Client,
    dbRows: VotersByContractAndRound[]
) {
    await pgInsertOnConflict(client, "voters_per_day_contract_round", dbRows, {
        onConflictArgument: "(date,contract,round)",
        onConflictCondition: ""
    })
}

export async function insertENOsData(dbRows: ENO[]) {
    console.log("Inserting ENOs pg db")
    const config = getPgConfig(useTestnet ? "testnet" : "mainnet");
    const client = new Client({
        host: config.host,
        user: config.userName,
        password: config.password,
        database: useTestnet ? "near_testnet" : "near_mainnet",
        port: config.port,
        ssl: {
            rejectUnauthorized: false,
            ca: readFileSync(join(".", "certificate", "ca-certificate.crt")).toString(),
        },
    });
    try {
        console.log("db:", client.database)
        // Connect & create tables if not exist
        await client.connect();
        await prepareDB(client)

        await pgInsertENOsData(client, dbRows);
        console.log(client.database, "pg insert ENOs", dbRows.length, "rows")

        console.log("ENOs pg db inserted successfully")
        return true
    } catch (err) {
        console.error("Error inserting ENOs pg db", err.message, err.stack)
        return false
    } finally {
        if (client) {
            await client.end()
        }
    }
}

export async function insertENOsByDelegatorData(dbRows: ENODelegator[]) {
    console.log("Inserting ENOs by delegator pg db")
    const config = getPgConfig(useTestnet ? "testnet" : "mainnet");
    const client = new Client({
        host: config.host,
        user: config.userName,
        password: config.password,
        database: useTestnet ? "near_testnet" : "near_mainnet",
        port: config.port,
        ssl: {
            rejectUnauthorized: false,
            ca: readFileSync(join(".", "certificate", "ca-certificate.crt")).toString(),
        },
    });
    try {
        console.log("db:", client.database)
        // Connect & create tables if not exist
        await client.connect();
        await prepareDB(client)

        await pgInsertENOsByDelegatorsData(client, dbRows);
        console.log(client.database, "pg insert ENOs by delegators", dbRows.length, "rows")

        console.log("ENOs by delegator pg db inserted successfully")
        return true
    } catch (err) {
        console.error("Error inserting ENOs by delegator pg db", err.message, err.stack)
        return false
    } finally {
        if (client) {
            await client.end()
        }
    }
}

async function insertValidatorEpochHistory(dbRows: ValidatorStakeHistory[]) {
    console.log("Inserting ENOs validator epoch history pg db")
    const config = getPgConfig(useTestnet ? "testnet" : "mainnet");
    const client = new Client({
        host: config.host,
        user: config.userName,
        password: config.password,
        database: useTestnet ? "near_testnet" : "near_mainnet",
        port: config.port,
        ssl: {
            rejectUnauthorized: false,
            ca: readFileSync(join(".", "certificate", "ca-certificate.crt")).toString(),
        },
    });
    try {
        console.log("db:", client.database)
        // Connect & create tables if not exist
        await client.connect();
        await prepareDB(client)

        await pgInsertValidatorEpochHistory(client, dbRows);
        console.log(client.database, "pg insert ENOs validator epoch history", dbRows.length, "rows")

        console.log("ENOs validator epoch history pg db inserted successfully")
        return true
    } catch (err) {
        console.error("Error inserting ENOs validator epoch history pg db", err.message, err.stack)
        return false
    } finally {
        if (client) {
            await client.end()
        }
    }
}

export async function updateDbPg(dbRows: VotersRow[], byContractRows: VotersByContractAndRound[], claimableRows: AvailableClaims[]) {
    console.log("Updating pg db")
    try {
        const config = getPgConfig(useTestnet ? "testnet" : "mainnet");
        const client = new Client({
            host: config.host,
            user: config.userName,
            password: config.password,
            database: useTestnet ? "near_testnet" : "near_mainnet",
            port: config.port,
            ssl: {
                rejectUnauthorized: false,
                ca: readFileSync(join(".", "certificate", "ca-certificate.crt")).toString(),
            },
        });
        console.log("db:", client.database)
        // Connect & create tables if not exist
        await client.connect();
        await prepareDB(client)
        // insert/update the rows for this day, ONLY IF vp_in_use is higher than the existing value
        // so we store the high-water mark for the voter/day
        await pgInsertVotersHighWaterMark(client, dbRows);
        console.log(client.database, "pg update/insert voters", dbRows.length, "rows")

        await pgInsertVotersPerContract(client, byContractRows);
        console.log(client.database, "pg update/insert voters_per_day_contract_round", byContractRows.length, "rows")

        await pgInsertOnConflict(client, "available_claims", claimableRows, {
            onConflictArgument: "(date, account_id, token_code)",
            onConflictCondition: "WHERE excluded.claimable_amount > available_claims.claimable_amount"
        })
        console.log(client.database, "pg update/insert available_claims", claimableRows.length, "rows")

        await client.end();

        console.log("pg db updated successfully")
    } catch (err) {
        console.error("Error updating pg db", err.message, err.stack)
    }
}

async function prepareDB(client: sq3.CommonSQLClient) {

    await client.query(CREATE_TABLE_APP_DEB_VERSION);
    const result = await client.query(`select max(version) version from app_db_version where app_code='${APP_CODE}'`);
    let version = result.rows[0].version;
    if (version == null) { // no rows
        await client.query(`insert into app_db_version(app_code,version,date_updated) values ('${APP_CODE}',1,'${isoTruncDate()}')`);
        version = 1
    }
    console.log("DB version:", version)

    // create tables if not exists
    await client.query(CREATE_TABLE_VOTERS);
    await client.query(CREATE_TABLE_VOTERS_PER_DAY_CONTRACT_ROUND);
    await client.query(CREATE_TABLE_AVAILABLE_CLAIMS);

    // -------------------------------------
    // UPGRADE DB TABLES VERSION if required
    // -------------------------------------
    if (version == 1) {
        // upgrade to version 2
        await client.query("ALTER TABLE voters add column vp_for_payment INTEGER")
        version += 1
        await client.query(`update app_db_version set version=${version}, date_updated='${isoTruncDate()}' where app_code='${APP_CODE}'`);
        console.log("DB tables UPDATED to version:", version)
    }
    if (version == 2) {
        // upgrade to version 3
        await client.query(CREATE_TABLE_ENO);
        version += 1
        await client.query(`update app_db_version set version=${version}, date_updated='${isoTruncDate()}' where app_code='${APP_CODE}'`);
        console.log("DB tables UPDATED to version:", version)
    }
    if (version == 3) {
        // upgrade to version 4
        await client.query(CREATE_TABLE_ENO_BY_DELEGATOR);
        version += 1
        await client.query(`update app_db_version set version=${version}, date_updated='${isoTruncDate()}' where app_code='${APP_CODE}'`);
        console.log("DB tables UPDATED to version:", version)
    }
    if (version == 4) {
        // upgrade to version 5
        await client.query(CREATE_TABLE_VALIDATOR_STAKE_HISTORY)
        version += 1
        await client.query(`update app_db_version set version=${version}, date_updated='${isoTruncDate()}' where app_code='${APP_CODE}'`);
        console.log("DB tables UPDATED to version:", version)
    }
    // if (version == 5) {
    //     // upgrade to version 6
    //     await client.query("ALTER TABLE voters add column xxxx DOUBLE PRECISION")
    //     version += 1
    //     await client.query(`update app_db_version set version=${version}, date_updated='${isoTruncDate()}' where app_code='${APP_CODE}'`);
    //     console.log("DB tables UPDATED to version:", version)
    // }
}


export async function updateDbSqLite(dbRows: VotersRow[], byContractRows: VotersByContractAndRound[], claimableRows: AvailableClaims[]) {
    console.log("Updating sqlite db")
    try {
        // Connect & create tables if not exist
        let DB_FILE = env.DB || "voters.db3" // same as exec dir, for cron job
        if (useTestnet) DB_FILE = join(homedir(), "voters.db3")
        console.log("SQLite db file", DB_FILE)
        let db: SqLiteDatabase = await sq3.open(DB_FILE)
        let client = new sq3.SQLiteClient(db)
        await prepareDB(client)
        // insert/update the rows for this day, ONLY IF vp_in_use/vp_for_payment is higher than the existing value
        // so we store the high-water mark for the voter/day
        await sq3.insertOnConflictUpdate(db, "voters", dbRows,
            {
                onConflictArgument: "",
                onConflictCondition: "where excluded.vp_in_use > voters.vp_in_use OR excluded.vp_for_payment > voters.vp_for_payment"
            }
        );
        console.log("sq3 update/insert voters", dbRows.length, "rows")

        await sq3.insertOnConflictUpdate(db, "voters_per_day_contract_round", byContractRows,
            {
                onConflictArgument: "",
                onConflictCondition: ""
            }
        );
        console.log("sq3 update/insert voters_per_day_contract_round", byContractRows.length, "rows")

        if (claimableRows.length > 0) {
            await sq3.insertOnConflictUpdate(db, "available_claims", claimableRows,
                {
                    onConflictArgument: "",
                    onConflictCondition: "where excluded.claimable_amount > available_claims.claimable_amount"
                }
            );
            console.log("sq3 update/insert available_claims", claimableRows.length, "rows")
        }

        console.log("sqlite db updated successfully")

    } catch (err) {
        console.error("Error updating sqlite db", err.message, err.stack)
    }
}

async function insertValidatorsStakeHistory(contractIds?: string[], lastTimestamp?: number) {
    const enosDir = 'ENOs'
    const enosFileName = "enosPersistent.json"
    if (!existsSync(enosDir)) {
        mkdirSync(enosDir)
    }
    const enosFullPath = join(enosDir, enosFileName)

    let startUnixTimestamp = 1698807600 /*2023/11/01*/
    const THREE_MONTH_IN_SECONDS = 3 * 30 * 24 * 60 * 60
    let endUnixTimestamp = startUnixTimestamp + THREE_MONTH_IN_SECONDS
    let enosPersistentData: EnoPersistentData = {} as EnoPersistentData;
    if (existsSync(enosFullPath)) {
        enosPersistentData = JSON.parse(readFileSync(enosFullPath).toString())
        if(contractIds) {
            if(lastTimestamp) {
                endUnixTimestamp = lastTimestamp
            } else if (enosPersistentData.hasOwnProperty('lastRecordedStakeHistory')) {
                endUnixTimestamp = enosPersistentData.lastRecordedStakeHistory
            } else {
                endUnixTimestamp = Math.min(startUnixTimestamp + THREE_MONTH_IN_SECONDS, Date.now())
            }
        } else {
            if (enosPersistentData.hasOwnProperty('lastRecordedStakeHistory')) {
                startUnixTimestamp = enosPersistentData.lastRecordedStakeHistory
            }
        }
    }
    console.log("Inserting from", startUnixTimestamp, "to", endUnixTimestamp)
    const contracts = contractIds !== undefined ? contractIds : getENOsContracts()
    const data = await getValidatorArrayStakeHistorySince(startUnixTimestamp, endUnixTimestamp, contracts)
    console.log("Inserting", data.length, "rows")
    if (data.length > 0) {
        const isSuccess = await insertValidatorEpochHistory(data)
        console.log("Is success", isSuccess)
        if (isSuccess && !contractIds) { // If contract is provided, we don't want to update, since all the other contracts may have not been updated yet
            const maxTimestamp = data.reduce((max: number, curr: ValidatorStakeHistory) => {
                return Math.max(max, Number(curr.unix_timestamp))
            }, startUnixTimestamp)
            writeFileSync(enosFullPath, JSON.stringify({ ...enosPersistentData, lastRecordedStakeHistory: maxTimestamp }))
            enosPersistentData = JSON.parse(readFileSync(enosFullPath).toString())
        }
    }
}

async function getENOsStakeDataAndInsertIt(contracts?: string[]) {
    const enosDir = 'ENOs'
    const enosFileName = "enosPersistent.json"
    if (!existsSync(enosDir)) {
        mkdirSync(enosDir)
    }
    const enosFullPath = join(enosDir, enosFileName)

    let startUnixTimestamp = 1698807600 /*2023/11/01*/
    let startUnixTimestampByDelegator = 1698807600 /*2023/11/01*/
    const THREE_MONTH_IN_SECONDS = 3 * 30 * 24 * 60 * 60
    let endUnixTimestamp = startUnixTimestamp + THREE_MONTH_IN_SECONDS
    let endUnixTimestampByDelegator = startUnixTimestampByDelegator + THREE_MONTH_IN_SECONDS
    let enosPersistentData: EnoPersistentData = {} as EnoPersistentData;
    if (existsSync(enosFullPath)) {
        enosPersistentData = JSON.parse(readFileSync(enosFullPath).toString())
        if (contracts) { // When contract is passed, we want to start from the beginning and finish at the same moment as the others
            if (enosPersistentData.hasOwnProperty('lastRecordedTimestamp')) {
                endUnixTimestamp = enosPersistentData.lastRecordedTimestamp
            }
            if (enosPersistentData.hasOwnProperty('lastRecordedTimestampByDelegator')) {
                endUnixTimestampByDelegator = enosPersistentData.lastRecordedTimestampByDelegator
            }
        } else {
            if (enosPersistentData.hasOwnProperty('lastRecordedTimestamp')) {
                startUnixTimestamp = enosPersistentData.lastRecordedTimestamp
                endUnixTimestamp = Math.min(startUnixTimestamp + THREE_MONTH_IN_SECONDS, Date.now())
            }
            if (enosPersistentData.hasOwnProperty('lastRecordedTimestampByDelegator')) {
                startUnixTimestampByDelegator = enosPersistentData.lastRecordedTimestampByDelegator
                endUnixTimestampByDelegator = Math.min(startUnixTimestampByDelegator + THREE_MONTH_IN_SECONDS, Date.now())
            }
        }

    }

    const contractsToAdd = contracts || getENOsContracts()
    const delegatorTableFileName = `ENOs/temp_delegators_table_data.json`
    let data
    if(existsSync(delegatorTableFileName)) {
        data = JSON.parse(readFileSync(delegatorTableFileName, 'utf-8'))
    } else {
        data = await generateDelegatorTableDataSince(startUnixTimestamp, endUnixTimestamp, contractsToAdd)
        writeFileSync(delegatorTableFileName, JSON.stringify(data))
    }
    if (data.length > 0) {
        const isSuccess = await insertENOsData(data)
        if(isSuccess) {
            rmdirSync(delegatorTableFileName)
        }
        if (isSuccess && !contracts) { // If contract is provided, we don't want to update, since all the other contracts may have not been updated yet
            const maxTimestamp = data.reduce((max: number, curr: ENO) => {
                return Math.max(max, Number(curr.unix_timestamp))
            }, startUnixTimestamp)
            writeFileSync(enosFullPath, JSON.stringify({ ...enosPersistentData, lastRecordedTimestamp: maxTimestamp }))
            enosPersistentData = JSON.parse(readFileSync(enosFullPath).toString())
        }
    }

    let dataByDelegator
    const dataByDelegatorFileName = `ENOs/temp_data_by_delegators.json`
    if(existsSync(dataByDelegatorFileName)) {
        dataByDelegator = JSON.parse(readFileSync(dataByDelegatorFileName, 'utf-8'))
    } else {
        dataByDelegator = await generateTableDataByDelegatorSince(startUnixTimestamp, endUnixTimestampByDelegator, contractsToAdd)
        writeFileSync(dataByDelegatorFileName, JSON.stringify(dataByDelegator))
    }
    if (dataByDelegator.length > 0) {
        const isSuccess = await insertENOsByDelegatorData(dataByDelegator)
        if(isSuccess) {
            rmdirSync(dataByDelegatorFileName)
        }
        if (isSuccess && !contracts) {// If contract is provided, we don't want to update, since all the other contracts may have not been updated yet
            const maxTimestamp = dataByDelegator.reduce((max: number, curr: ENODelegator) => {
                return Math.max(max, Number(curr.unix_timestamp))
            }, startUnixTimestamp)
            writeFileSync(enosFullPath, JSON.stringify({ ...enosPersistentData, lastRecordedTimestampByDelegator: maxTimestamp }))
            enosPersistentData = JSON.parse(readFileSync(enosFullPath).toString())
        }
    }
}

async function analyzeSingleFile(filePath: string) {
    let allVoters = JSON.parse(readFileSync(filePath).toString())
    let { metrics } = await processMpDaoVote(allVoters);
    console.log(metrics)
}

async function mainAsyncProcess() {

    if (argv.findIndex(i => i == "save-voters") > 0) {
        console.log("saving voters snapshot into sqlite db")
        await saveVoteSnapshotIntoSqliteDb()
        process.exit(0)
    }

    const fileArgvIndex = argv.findIndex(i => i == "file")
    if (fileArgvIndex > 0) {
        // process single file: node dist/main.js file xxxx.json
        await analyzeSingleFile(argv[fileArgvIndex + 1])
        return
    }
    const voteForInx = argv.findIndex(i => i == "votes-for")
    if (voteForInx > 0) {
        await consoleShowVotesFor(argv[voteForInx + 1])
        return
    }
    const showMigratedInx = argv.findIndex(i => i == "show-migrated")
    if (showMigratedInx > 0) {
        await showMigrated()
        return
    }
    const showClaimInx = argv.findIndex(i => i == "show-claims-stnear")
    if (showClaimInx > 0) {
        await showClaimsStNear()
        return
    }
    const addEnosContractInx = argv.findIndex(i => i == "add-eno")
    if (addEnosContractInx > 0) {
        const start = Date.now()
        const nextArg = argv[addEnosContractInx + 1]
        const contracts = getENOsContracts().includes(nextArg) ? [nextArg] : undefined
        console.log("Adding all data from validator:", contracts || "all validators")
        await getENOsStakeDataAndInsertIt(contracts)
        const end = Date.now()
        console.log("Elapsed time", (end - start) / (1000 * 60), "minutes")
        return
    }
    const addDelegatorGroupContractInx = argv.findIndex(i => i == "add-delegator-group")
    if (addDelegatorGroupContractInx > 0) {
        const start = Date.now()
        const delegatorGroup = argv[addDelegatorGroupContractInx + 1]
        const contracts = getDelegatorGroupContracts(delegatorGroup)
        if(!contracts) {
            console.error("No contracts found for group", delegatorGroup)
            return
        }
        console.log("Adding all data from validators:", contracts)
        await getENOsStakeDataAndInsertIt(contracts)
        const end = Date.now()
        console.log("Elapsed time", (end - start) / (1000 * 60), "minutes")
        return
    }
    const addStakeHistoryInx = argv.findIndex(i => i == "add-stake-history")
    if (addStakeHistoryInx > 0) {
        const start = Date.now()
        const nextArg = argv[addStakeHistoryInx + 1]
        const contractArray = getENOsContracts().includes(nextArg) ? [nextArg] : undefined
        console.log("Adding stake history from validator:", contractArray || "all validators")
        await insertValidatorsStakeHistory(contractArray)
        const end = Date.now()
        console.log("Elapsed time", (end - start) / (1000 * 60), "minutes")
        return
    }
    const addStakeHistoryGroupInx = argv.findIndex(i => i == "add-stake-history-group")
    if (addStakeHistoryGroupInx > 0) {
        const start = Date.now()
        const delegatorGroup = argv[addStakeHistoryGroupInx + 1]
        const lastTimestamp = argv[addStakeHistoryGroupInx + 2] ? Number(argv[addStakeHistoryGroupInx + 2]) : undefined
        const contracts = getDelegatorGroupContracts(delegatorGroup)
        if(!contracts) {
            console.error("No contracts found for group", delegatorGroup)
            return
        }
        console.log("Adding stake history from validator:", contracts)
        await insertValidatorsStakeHistory(contracts, lastTimestamp)
        const end = Date.now()
        console.log("Elapsed time", (end - start) / (1000 * 60), "minutes")
        return
    }
    const closeRound = argv.findIndex(i => i == "close-round")
    if (closeRound > 0) {
        await setRecentlyFreezedFoldersVotes()
        return
    }
    // --------------

    // --------------
    // processes that use get_all_voters
    // --------------
    try {
        let mpDaoVote = new MpDaoVoteContract(MPDAO_VOTE_CONTRACT_ID)
        const allVoters = await mpDaoVote.getAllVoters();
        if (isDryRun()) console.log("All voters", allVoters.length)
        if (argv.findIndex(i => i == "show-voters") > 0) {
            console.log(JSON.stringify(allVoters, undefined, 4))
            process.exit(0)
        }
        const computeAsDateInx = argv.findIndex(i => i == "compute-as-date")
        if (computeAsDateInx > 0) {
            await computeAsDate(argv[computeAsDateInx + 1], allVoters)
            process.exit(0)
        }

        // --------- backup all voters snapshot (one per hour) ----------
        // TODO: remove old backups
        {
            const dateIsoFile = new Date().toISOString().replace(/:/g, "-")
            const monthDir = dateIsoFile.slice(0, 7)
            if (!existsSync(monthDir)) {
                mkdirSync(monthDir)
            }
            try {
                writeFileSync(join(monthDir, `AllVoters.${dateIsoFile}.json`), JSON.stringify(allVoters));
                writeFileSync(`last-snapshot-AllVoters.json`, JSON.stringify(allVoters));
            } catch (ex) {
                console.error(ex)
            }
        }

        let { metrics, dbRows, dbRows2 } = await processMpDaoVote(allVoters);
        console.log(metrics)
        if (isDryRun()) {
            console.log("total in mpdao-vote.near contract", metrics.totalLocked + metrics.totalUnlocking + metrics.totalUnLocked)
        }

        writeFileSync("mpdao-hourly-metrics.json", JSON.stringify({
            metaVote: metrics
        }));

        const availableClaimsRows = await mpDaoVote.getAllStnearClaims()
        // update local SQLite DB - it contains max locked tokens and max voting power per user/day
        await updateDbSqLite(dbRows, dbRows2, availableClaimsRows)
        // update remote pgDB
        await updateDbPg(dbRows, dbRows2, availableClaimsRows)
    } catch (err) {
        console.error(err)
    }

    // see if we need to register closing voting-rounds for grants
    try {
        await setRecentlyFreezedFoldersVotes()
    } catch (err) {
        console.error(err)
    }

    try {
        await getENOsStakeDataAndInsertIt()
    } catch (err) {
        console.error(err)
    }

    try {
        await insertValidatorsStakeHistory()
    } catch (err) {
        console.error(err)
    }
}

// -----------------------------------------------------
// -----------------------------------------------------
console.log(argv)
export const dryRun = argv.includes("dry")
setGlobalDryRunMode(dryRun);
export const useTestnet = argv.includes("test") || argv.includes("testnet") || cwd().includes("testnet");
export const useMainnet = !useTestnet

if (useTestnet) console.log("USING TESTNET")
export const MPDAO_VOTE_CONTRACT_ID = useMainnet ? "mpdao-vote.near" : "v1.mpdao-vote.testnet"
export const OLD_META_VOTE_CONTRACT_ID = useMainnet ? "meta-vote.near" : "metavote.testnet"
export const META_PIPELINE_CONTRACT_ID = useMainnet ? "meta-pipeline.near" : "dev-1686255629935-21712092475027"
export const META_PIPELINE_OPERATOR_ID = useMainnet ? "pipeline-operator.near" : "mpdao-vote.testnet"
export const META_POOL_DAO_ACCOUNT = useMainnet ? "meta-pool-dao.near" : "meta-pool-dao.testnet"
setRpcUrl("https://rpc.mainnet.fastnear.com")
if (useTestnet) setRpcUrl("https://rpc.testnet.near.org")

mainAsyncProcess()
