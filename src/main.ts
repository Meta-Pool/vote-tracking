import { writeFileSync } from "fs";
import { MetaVoteContract, Voters } from "./contracts/meta-vote";
import { setRpcUrl, yton } from "near-api-lite";
import { argv, cwd, env } from "process";
import { VotersRow, createTableVotersIfNotExists } from "./util/tables";
import { Database } from "sqlite3";
import * as sq3 from "./util/sq3";
import { setRecentlyFreezedFoldersVotes } from "./votesSetter";

type ByContractInfoType = {
    contract: string;
    totalVotes: number;
    proportionalMeta: number;
}
type MetaVoteMetricsType = {
    metaVoteUserCount: number;
    totalLocked: number;
    totalUnlocking: number;
    totalUnLocked: number;
    totalVotingPower: number;
    totalVotingPowerUsed: number;
    votesPerAddress: ByContractInfoType[];
}

async function processMetaVote(allVoters: Voters[]): Promise<{ metrics: MetaVoteMetricsType, dbRows: VotersRow[] }> {

    //---
    let totalLocked = 0
    let totalUnlocking = 0
    let totalUnlocked = 0
    let totalVotingPower = 0
    let totalVotingPowerUsed = 0
    let votesPerAddress: ByContractInfoType[] = []

    let dateString = (new Date().toISOString()).slice(0, 10)
    let dbRows: VotersRow[] = []

    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;

        let userTotalVotingPower = 0
        let userTotalMetaLocked = 0
        let userTotalMetaUnlocking = 0
        let userTotalMetaUnlocked = 0
        for (let lp of voter.locking_positions) {
            const metaAmount = yton(lp.amount)
            if (lp.is_locked) {
                userTotalMetaLocked += metaAmount
                userTotalVotingPower += yton(lp.voting_power)
            }
            else if (lp.is_unlocked) {
                userTotalMetaUnlocked += metaAmount
            }
            else {
                userTotalMetaUnlocking += metaAmount
            }
        }

        totalVotingPower += userTotalVotingPower
        totalLocked += userTotalMetaLocked
        totalUnlocking += userTotalMetaUnlocked
        totalUnlocked += userTotalMetaUnlocking;

        let userTotalVpInUse = 0
        let userTotalVpInValidators = 0
        let userTotalVpInLaunches = 0
        let userTotalVpInAmbassadors = 0
        let userTotalVpInOther = 0
        if (voter.vote_positions && userTotalVotingPower > 0) {

            for (let vp of voter.vote_positions) {

                const positionVotingPower = yton(vp.voting_power)
                if (positionVotingPower == 0) continue;

                // compute proportional meta locked for this vote
                const proportionalMeta = userTotalMetaLocked * (positionVotingPower / userTotalVotingPower);
                userTotalVpInUse += positionVotingPower
                totalVotingPowerUsed += positionVotingPower

                if (vp.votable_address == "metastaking.app") {
                    userTotalVpInValidators += positionVotingPower
                } else if (vp.votable_address == "metayield.app") {
                    userTotalVpInLaunches += positionVotingPower
                } else if (vp.votable_address == "initiatives") {
                    userTotalVpInAmbassadors += positionVotingPower
                } else {
                    userTotalVpInOther += positionVotingPower
                }

                let prev = votesPerAddress.find(i => i.contract == vp.votable_address)
                if (!prev) {
                    votesPerAddress.push({
                        contract: vp.votable_address,
                        totalVotes: positionVotingPower,
                        proportionalMeta: proportionalMeta
                    })
                }
                else {
                    prev.totalVotes += positionVotingPower
                    prev.proportionalMeta += proportionalMeta
                }
            }

            dbRows.push({
                date: dateString,
                account_id: voter.voter_id,
                vp_in_use: Math.trunc(userTotalVpInUse),
                vp_idle: Math.trunc(userTotalVotingPower - userTotalVpInUse),
                meta_locked: Math.trunc(userTotalMetaLocked),
                meta_unlocking: Math.trunc(userTotalMetaUnlocking),
                meta_unlocked: Math.trunc(userTotalMetaUnlocked),
                vp_in_validators: Math.trunc(userTotalVpInValidators),
                vp_in_launches: Math.trunc(userTotalVpInLaunches),
                vp_in_ambassadors: Math.trunc(userTotalVpInAmbassadors),
                //vp_in_others: Math.trunc(userTotalVpInOther),
            })

        }

    }

    return {
        metrics: {
            metaVoteUserCount: allVoters.length,
            totalLocked: totalLocked,
            totalUnlocking: totalUnlocking,
            totalUnLocked: totalUnlocked,
            totalVotingPower: totalVotingPower,
            totalVotingPowerUsed: totalVotingPowerUsed,
            votesPerAddress: votesPerAddress,
        },
        dbRows: dbRows
    }

}

async function process() {

    let metaVote = new MetaVoteContract(META_VOTE_CONTRACT_ID)
    const allVoters = await metaVote.getAllVoters();

    try {
        writeFileSync(`AllVoters.${new Date().toISOString().replace(/:/g, "-")}.json`, JSON.stringify(allVoters));
    } catch (ex) {
        console.error(ex)
    }

    let { metrics, dbRows } = await processMetaVote(allVoters);
    console.log(metrics)
    
    writeFileSync("hourly-metrics.json", JSON.stringify({
        metaVote: metrics
    }));

    try {
        await setRecentlyFreezedFoldersVotes(allVoters)
    } catch(err) {
        console.error(err)
    }

    // try to update the db
    const DB_FILE = env.DB || "voters.db3"
    let db: Database = await sq3.open(DB_FILE)
    if (db) await createTableVotersIfNotExists(db)
    // insert/update the rows for this day, ONLY IF vp_in_use is higher than the existing value
    // so we store the high-water mark for the voter/day
    await sq3.insertOnConflictUpdate(db, "voters", dbRows,
        "where excluded.vp_in_use > voters.vp_in_use"
    );
    console.log("update/insert", dbRows.length, "rows")
}


export const useTestnet = argv.includes("testnet") || cwd().includes("testnet");
export const useMainnet = !useTestnet
const META_VOTE_CONTRACT_ID = useMainnet ? "meta-vote.near" : "metavote.testnet"
export const META_PIPELINE_CONTRACT_ID = useMainnet ? "meta-pipeline.near" : "dev-1686255629935-21712092475027"
if (useTestnet) setRpcUrl("https://rpc.testnet.near.org")
process()