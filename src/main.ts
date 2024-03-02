import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { MpDaoVoteContract, VoterInfo } from "./contracts/mpdao-vote";
import { setRpcUrl, yton } from "near-api-lite";
import { argv, cwd, env } from "process";
import { CREATE_TABLE_VOTERS, CREATE_TABLE_VOTERS_PER_DAY_CONTRACT_ROUND, VotersByContractAndRound, VotersRow } from "./util/tables";
import { setRecentlyFreezedFoldersVotes } from "./votesSetter";
import * as sq3 from './util/sq3'
import { Database as SqLiteDatabase } from "sqlite3";


import { Client } from 'pg';
import { join } from "path";
import { buildInsert } from "./util/sqlBuilder";
import { getPgConfig } from "./util/postgres";
import { showVotesFor } from "./votesFor";
import { toNumber } from "./util/convert";
import { migrateAud, migrateLpVp } from "./migration/migrate";
import { isDryRun, setGlobalDryRunMode } from "./contracts/base-smart-contract";


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
}

export async function processMetaVote(allVoters: VoterInfo[], decimals = 6):
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

    //---
    let totalLocked = BigInt(0)
    let totalUnlocking = BigInt(0)
    let totalUnlocked = BigInt(0)
    let totalVotingPower = 0
    let totalVotingPowerUsed = 0
    let votesPerContractAndRound: ByContractAndRoundInfoType[] = []

    let countLockedAndUnlocking = 0
    // subtract 30 seconds, so the cron running 2023-03-30 00:04 registers "end of day data" for 2023-03-29
    let dateString = (new Date(Date.now() - 30000).toISOString()).slice(0, 10)
    let dbRows: VotersRow[] = []

    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;

        if (isDryRun()) console.log("--", voter.voter_id);
        let userTotalVotingPower = 0
        let userTotalMpDaoLocked = BigInt(0)
        let userTotalMpDaoUnlocking = BigInt(0)
        let userTotalMpDaoUnlocked = BigInt(0)
        let hasLockedOrUnlocking = false
        for (let lp of voter.locking_positions) {
            if (lp.is_locked) {
                userTotalMpDaoLocked += BigInt(lp.amount)
                userTotalVotingPower += yton(lp.voting_power)
                hasLockedOrUnlocking = true
            }
            else if (lp.is_unlocked) {
                userTotalMpDaoUnlocked += BigInt(lp.amount)
            }
            else {
                userTotalMpDaoUnlocking += BigInt(lp.amount)
                hasLockedOrUnlocking = true
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
        if (voter.vote_positions && userTotalVotingPower > 0) {
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
                        if (vp.votable_object_id.includes(`Grants #${n} `) || vp.votable_object_id.includes(`Grants #${n}`)) {
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

            dbRows.push({
                date: dateString,
                account_id: voter.voter_id,
                vp_in_use: Math.trunc(userTotalVpInUse),
                vp_idle: Math.trunc(userTotalVotingPower - userTotalVpInUse),
                meta_locked: Math.trunc(toNumber(userTotalMpDaoLocked, decimals)), // keep old "meta" name fr backward compat
                meta_unlocking: Math.trunc(toNumber(userTotalMpDaoUnlocking, decimals)),
                meta_unlocked: Math.trunc(toNumber(userTotalMpDaoUnlocked, decimals)),
                vp_in_validators: Math.trunc(userTotalVpInValidators),
                vp_in_launches: Math.trunc(userTotalVpInLaunches),
                vp_in_ambassadors: Math.trunc(userTotalVpInAmbassadors),
                //vp_in_others: Math.trunc(userTotalVpInOther),
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

async function mainAsyncProcess() {

    const migrateLpVpInx = argv.findIndex(i => i == "migrate-lp-vp")
    if (migrateLpVpInx > 0) {
        await migrateLpVp()
        process.exit(0)
    }
    const migrateAudInx = argv.findIndex(i => i == "migrate-aud")
    if (migrateAudInx > 0) {
        await migrateAud()
        process.exit(0)
    }

    let metaVote = new MpDaoVoteContract(MPDAO_VOTE_CONTRACT_ID)
    const allVoters = await metaVote.getAllVoters();

    {
        const dateIsoFile = new Date().toISOString().replace(/:/g, "-")
        const monthDir = dateIsoFile.slice(0, 7)
        if (!existsSync(monthDir)) {
            mkdirSync(monthDir)
        }
        try {
            writeFileSync(join(monthDir, `AllVoters.${dateIsoFile}.json`), JSON.stringify(allVoters));
        } catch (ex) {
            console.error(ex)
        }
    }

    let { metrics, dbRows, dbRows2 } = await processMetaVote(allVoters);
    console.log(metrics)

    writeFileSync("mpdao-hourly-metrics.json", JSON.stringify({
        metaVote: metrics
    }));

    try {
        await setRecentlyFreezedFoldersVotes(allVoters, useMainnet)
    } catch (err) {
        console.error(err)
    }
    // update local SQLite DB - it contains max locked tokens and max voting power per user/day
    await updateDbSqLite(dbRows, dbRows2)
    // update remote pgDB
    await updateDbPg(dbRows, dbRows2)
}

async function pgInsertVotersHighWaterMark(
    client: Client,
    dbRows: VotersRow[]
) {
    for (const row of dbRows) {
        const { statement, values } = buildInsert("pg",
            "insert", "voters",
            row,
            {
                onConflictArgument: "(date,account_id)",
                onConflictCondition: "WHERE excluded.vp_in_use > voters.vp_in_use"
            })
        try {
            await client.query(statement, values);
        } catch (err) {
            console.error('An error occurred', err);
            console.error(statement)
            console.error(values)
            break;
        }
    }
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
    for (const row of dbRows) {
        const { statement, values } = buildInsert("pg",
            "insert", "voters_per_day_contract_round",
            row,
            {
                onConflictArgument: "(date,contract,round)",
                onConflictCondition: ""
            })
        try {
            await client.query(statement, values);
        } catch (err) {
            console.error('An error occurred', err);
            console.error(statement)
            console.error(values)
            break;
        }
    }
}

async function updateDbPg(dbRows: VotersRow[], byContractRows: VotersByContractAndRound[]) {
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
        await client.query(CREATE_TABLE_VOTERS)
        await client.query(CREATE_TABLE_VOTERS_PER_DAY_CONTRACT_ROUND)
        // insert/update the rows for this day, ONLY IF vp_in_use is higher than the existing value
        // so we store the high-water mark for the voter/day
        await client.query("BEGIN TRANSACTION");
        await pgInsertVotersHighWaterMark(client, dbRows);
        await client.query("COMMIT");
        console.log(client.database, "pg update/insert voters", dbRows.length, "rows")

        await client.query("BEGIN TRANSACTION");
        await pgInsertVotersPerContract(client, byContractRows);
        await client.query("COMMIT");
        console.log(client.database, "pg update/insert voters_per_day_contract_round", byContractRows.length, "rows")

        await client.end();

        console.log("pg db updated successfully")
    } catch (err) {
        console.error("Error updating pg db", err.message, err.stack)
    }
}

async function updateDbSqLite(dbRows: VotersRow[], byContractRows: VotersByContractAndRound[]) {
    console.log("Updating sqlite db")
    try {
        // Connect & create tables if not exist
        const DB_FILE = env.DB || "voters.db3"
        let db: SqLiteDatabase = await sq3.open(DB_FILE)
        await sq3.run(db, CREATE_TABLE_VOTERS);
        await sq3.run(db, CREATE_TABLE_VOTERS_PER_DAY_CONTRACT_ROUND);
        // insert/update the rows for this day, ONLY IF vp_in_use is higher than the existing value
        // so we store the high-water mark for the voter/day
        await sq3.insertOnConflictUpdate(db, "voters", dbRows,
            {
                onConflictArgument: "",
                onConflictCondition: "where excluded.vp_in_use > voters.vp_in_use"
            }
        );
        console.log("sq3 update/insert", dbRows.length, "rows")

        await sq3.insertOnConflictUpdate(db, "voters_per_day_contract_round", byContractRows,
            {
                onConflictArgument: "",
                onConflictCondition: ""
            }
        );
        console.log("sq3 update/insert voters_per_day_contract_round", byContractRows.length, "rows")
        console.log("sqlite db updated successfully")

    } catch (err) {
        console.error("Error updating sqlite db", err.message, err.stack)
    }
}

async function analyzeSingleFile(filePath: string) {
    let allVoters = JSON.parse(readFileSync(filePath).toString())
    let { metrics } = await processMetaVote(allVoters);
    console.log(metrics)
}

// -----------------------------------------------------
// -----------------------------------------------------
setGlobalDryRunMode(argv.includes("dry"));
export const useTestnet = argv.includes("test") || argv.includes("testnet") || cwd().includes("testnet");
export const useMainnet = !useTestnet
if (useTestnet) console.log("USING TESTNET")
export const MPDAO_VOTE_CONTRACT_ID = useMainnet ? "mpdao-vote.near" : "mpdao-vote.testnet"
export const META_PIPELINE_CONTRACT_ID = useMainnet ? "meta-pipeline.near" : "dev-1686255629935-21712092475027"
export const META_PIPELINE_OPERATOR_ID = useMainnet ? "pipeline-operator.near" : "mpdao-vote.testnet"
export const META_POOL_DAO_ACCOUNT = useMainnet ? "meta-pool-dao.near" : "meta-pool-dao.testnet"
if (useTestnet) setRpcUrl("https://rpc.testnet.near.org")

// process single file: node dist/main.js file xxxx.json
const fileArgvIndex = argv.findIndex(i => i == "file")
if (fileArgvIndex > 0) {
    analyzeSingleFile(argv[fileArgvIndex + 1])
}
else {
    const voteForInx = argv.findIndex(i => i == "votes-for")
    if (voteForInx > 0) {
        showVotesFor(argv[voteForInx + 1])
    }
    mainAsyncProcess()
}