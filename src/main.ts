import { writeFileSync } from "fs";
import { MetaVoteContract } from "./meta-vote";
import { setRpcUrl, yton } from "near-api-lite";
import { argv, cwd } from "process";
import { setGlobalDryRunMode } from "./base-smart-contract";

type ByContractInfoType = {
    contract: string;
    totalVotes: number;
    proportionalMeta: number;
}
type MetaVoteDataType = {
    totalLocked: number;
    totalUnlocking: number;
    totalUnLocked: number;
    totalVotingPower: number;
    totalVotingPowerUsed: number;
    votesPerAddress: ByContractInfoType[];
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

async function processMetaVote(): Promise<MetaVoteDataType> {
    //---
    let metaVote = new MetaVoteContract(META_VOTE_CONTRACT_ID)
    const allVoters = await metaVote.getAllVoters();
    let totalLocked = 0
    let totalUnlocking = 0
    let totalUnlocked = 0
    let totalVotingPower = 0
    let totalVotingPowerUsed = 0
    let votesPerAddress: ByContractInfoType[] = []

    //const E24 = BigInt("1" + "0".repeat(24))
    //const E6 = BigInt("1" + "0".repeat(6))
    let totalUnlocking7dOrLess = 0
    let totalUnlocking15dOrLess = 0
    let totalUnlocking30dOrLess = 0
    let totalUnlocking60dOrLess = 0
    let totalUnlocking90dOrLess = 0
    let totalUnlocking120dOrLess = 0
    let totalUnlocking180dOrLess = 0
    let totalUnlocking240dOrLess = 0
    let totalUnlockingMores240d = 0

    console.log("processMetaVote, allVoters.length:", allVoters.length)

    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;

        let userTotalMetaLocked = 0
        let userTotalVotingPower = 0
        for (let lp of voter.locking_positions) {
            const metaAmount = yton(lp.amount)
            if (lp.is_locked) {
                userTotalMetaLocked += metaAmount
                userTotalVotingPower += yton(lp.voting_power)
            }
            else if (lp.is_unlocked) {
                totalUnlocked += metaAmount
            }
            else {
                totalUnlocking += metaAmount;
                //hasLockedOrUnlocking = true
                const unixMsTimeNow = new Date().getTime()
                const unlockingEndsAt = (lp.unlocking_started_at || 0) + lp.locking_period * 24 * 60 * 60 * 1000
                const remainingDays = Math.trunc((unlockingEndsAt - unixMsTimeNow) / 1000 / 60 / 60 / 24)
                if (remainingDays <= 7) {
                    totalUnlocking7dOrLess += metaAmount
                } else if (remainingDays <= 15) {
                    totalUnlocking15dOrLess += metaAmount
                } else if (remainingDays <= 30) {
                    totalUnlocking30dOrLess += metaAmount
                } else if (remainingDays <= 60) {
                    totalUnlocking60dOrLess += metaAmount
                } else if (remainingDays <= 90) {
                    totalUnlocking90dOrLess += metaAmount
                } else if (remainingDays <= 120) {
                    totalUnlocking120dOrLess += metaAmount
                } else if (remainingDays <= 180) {
                    totalUnlocking180dOrLess += metaAmount
                } else if (remainingDays <= 240) {
                    totalUnlocking240dOrLess += metaAmount
                } else {
                    totalUnlockingMores240d += metaAmount
                }
            }
        }

        totalLocked += userTotalMetaLocked
        totalVotingPower += userTotalVotingPower

        if (voter.vote_positions && userTotalVotingPower > 0) {

            for (let vp of voter.vote_positions) {

                const positionVotingPower = yton(vp.voting_power)
                if (positionVotingPower == 0) continue;

                // compute proportional meta locked for this vote
                const proportionalMeta = userTotalMetaLocked * (positionVotingPower / userTotalVotingPower);
                totalVotingPowerUsed += positionVotingPower

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
        }

    }

    return {
        totalLocked: totalLocked,
        totalUnlocking: totalUnlocking,
        totalUnLocked: totalUnlocked,
        totalVotingPower: totalVotingPower,
        totalVotingPowerUsed: totalVotingPowerUsed,
        votesPerAddress: votesPerAddress,

        totalUnlocking7dOrLess,
        totalUnlocking15dOrLess,
        totalUnlocking30dOrLess,
        totalUnlocking60dOrLess,
        totalUnlocking90dOrLess,
        totalUnlocking120dOrLess,
        totalUnlocking180dOrLess,
        totalUnlocking240dOrLess,
        totalUnlockingMores240d
    }

}

async function process() {
    let metaVoteData = await processMetaVote();
    writeFileSync("hourly-metrics.json", JSON.stringify({
        metaVote: metaVoteData
    }));
}

export const useTestnet = false; //argv.includes("test") || argv.includes("testnet") || cwd().includes("testnet");
export const useMainnet = !useTestnet
export const dryRun = argv.includes("dry")
if (dryRun) setGlobalDryRunMode(true)

if (useTestnet) console.log("USING TESTNET")
export const META_VOTE_CONTRACT_ID = useMainnet ? "meta-vote.near" : "metavote.testnet"
export const META_PIPELINE_CONTRACT_ID = useMainnet ? "meta-pipeline.near" : "dev-1686255629935-21712092475027"
export const META_PIPELINE_OPERATOR_ID = useMainnet ? "pipeline-operator.near" : "meta-vote.testnet"
if (useTestnet) setRpcUrl("https://rpc.testnet.near.org")
process()