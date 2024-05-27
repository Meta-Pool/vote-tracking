import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { MpDaoVoteContract, VoterInfo } from "./contracts/mpdao-vote";
import { setRpcUrl, yton } from "near-api-lite";
import { argv, cwd, env } from "process";
import { APP_CODE, AvailableClaims, CREATE_TABLE_APP_DEB_VERSION, CREATE_TABLE_AVAILABLE_CLAIMS, CREATE_TABLE_VOTERS, CREATE_TABLE_VOTERS_PER_DAY_CONTRACT_ROUND, VotersByContractAndRound, VotersRow } from "./util/tables";
import { setRecentlyFreezedFoldersVotes } from "./votesSetter";


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
    // migration grace period (no need to vote to gey paid) until July 31st
    const isGracePeriod = isoTruncDate() < "2024-08"
    const extendGracePeriodForEthBased = true

    console.log("processMetaVote, allVoters.length:", allVoters.length)

    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;
        const voterIsEthMirror = voter.voter_id.endsWith(".evmp.near") || voter.voter_id.endsWith(".evmp.testnet")

        if (isDryRun()) console.log("--", voter.voter_id);
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

            const vp_for_payment = (isGracePeriod || (voterIsEthMirror && extendGracePeriodForEthBased)) ?
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



async function analyzeSingleFile(filePath: string) {
    let allVoters = JSON.parse(readFileSync(filePath).toString())
    let { metrics } = await processMpDaoVote(allVoters);
    console.log(metrics)
}

async function mainAsyncProcess() {

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

    let mpDaoVote = new MpDaoVoteContract(MPDAO_VOTE_CONTRACT_ID)
    const allVoters = await mpDaoVote.getAllVoters();

    if (argv.findIndex(i => i == "show-voters") > 0) {
        console.log(JSON.stringify(allVoters, undefined, 4))
        return
    }
    const computeAsDateInx = argv.findIndex(i => i == "compute-as-date")
    if (computeAsDateInx > 0) {
        await computeAsDate(argv[computeAsDateInx + 1], allVoters)
        return
    }

    // backup all voters snapshot (one per hour)
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

    writeFileSync("mpdao-hourly-metrics.json", JSON.stringify({
        metaVote: metrics
    }));

    try {
        await setRecentlyFreezedFoldersVotes(allVoters, useMainnet)
    } catch (err) {
        console.error(err)
    }

    // const availableClaimsRows = await mpDaoVote.getAllStnearClaims()
    // // update local SQLite DB - it contains max locked tokens and max voting power per user/day
    // await updateDbSqLite(dbRows, dbRows2, availableClaimsRows)
    // // update remote pgDB
    // await updateDbPg(dbRows, dbRows2, availableClaimsRows)
}

// -----------------------------------------------------
// -----------------------------------------------------
console.log(argv)
setGlobalDryRunMode(argv.includes("dry"));
export const useTestnet = argv.includes("test") || argv.includes("testnet") || cwd().includes("testnet");
export const useMainnet = !useTestnet
export const dryRun = argv.includes("dry")
if (dryRun) setGlobalDryRunMode(true)

if (useTestnet) console.log("USING TESTNET")
export const MPDAO_VOTE_CONTRACT_ID = useMainnet ? "mpdao-vote.near" : "v1.mpdao-vote.testnet"
export const OLD_META_VOTE_CONTRACT_ID = useMainnet ? "meta-vote.near" : "metavote.testnet"
export const META_PIPELINE_CONTRACT_ID = useMainnet ? "meta-pipeline.near" : "dev-1686255629935-21712092475027"
export const META_PIPELINE_OPERATOR_ID = useMainnet ? "pipeline-operator.near" : "mpdao-vote.testnet"
export const META_POOL_DAO_ACCOUNT = useMainnet ? "meta-pool-dao.near" : "meta-pool-dao.testnet"
if (useTestnet) setRpcUrl("https://rpc.testnet.near.org")

mainAsyncProcess()
