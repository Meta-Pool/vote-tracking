import { writeFileSync } from "fs";
import { MetaVoteContract } from "./meta-vote";
import { setRpcUrl, yton } from "near-api-lite";
import { argv, cwd } from "process";

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
                totalUnlocking += metaAmount
            }
            else totalUnlocked += metaAmount;
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
        votesPerAddress: votesPerAddress
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
const META_VOTE_CONTRACT_ID = useMainnet ? "meta-vote.near" : "metavote.testnet"
if (useTestnet) setRpcUrl("https://rpc.testnet.near.org")
process()