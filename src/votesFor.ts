import { yton } from "near-api-lite"
import { MpDaoVoteContract, Voters } from "./contracts/mpdao-vote"
import { META_VOTE_CONTRACT_ID } from "./main";
import { mpdao_as_number } from "./util/convert";

export async function showVotesFor(votableId:string) {
    let metaVote = new MpDaoVoteContract(META_VOTE_CONTRACT_ID)
    const allVoters = await metaVote.getAllVoters();
    filterVotesFor(allVoters,votableId)
}

export async function filterVotesFor(allVoters: Voters[], votableId:string) {
        //---
    let totalLocked = 0
    let totalUnlocking = 0
    let totalUnlocked = 0
    let totalVotingPower = 0
    let totalVotingPowerUsed = 0

    // subtract 30 seconds, so the cron running 2023-03-30 00:04 registers "end of day data" for 2023-03-29
    let dateString = (new Date(Date.now() - 30000).toISOString()).slice(0, 10)

    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;

        let userTotalVotingPower = 0
        let userTotalMetaLocked = 0
        let userTotalMetaUnlocking = 0
        let userTotalMetaUnlocked = 0
        for (let lp of voter.locking_positions) {
            const mpDaoAmount = mpdao_as_number(lp.amount)
            if (lp.is_locked) {
                userTotalMetaLocked += mpDaoAmount
                userTotalVotingPower += yton(lp.voting_power)
            }
            else if (lp.is_unlocked) {
                userTotalMetaUnlocked += mpDaoAmount
            }
            else {
                userTotalMetaUnlocking += mpDaoAmount
            }
        }

        totalVotingPower += userTotalVotingPower
        totalLocked += userTotalMetaLocked
        totalUnlocking += userTotalMetaUnlocking
        totalUnlocked += userTotalMetaUnlocked;

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
                const proportionalMeta = userTotalMetaLocked * (positionVotingPower / userTotalVotingPower);
                userTotalVpInUse += positionVotingPower
                totalVotingPowerUsed += positionVotingPower

                if (vp.votable_object_id.includes(votableId)) {
                    console.log(
                        voter.voter_id,
                        "userTotalMetaLocked", userTotalMetaLocked,
                        "votable_object_id",vp.votable_object_id,
                        "vp", yton(vp.voting_power)
                        )
                }
            }
        }

    }

}