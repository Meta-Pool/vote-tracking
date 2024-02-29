import { yton } from "near-api-lite";
import { MpDaoVoteContract, VoterInfo, uniqueLp } from "../contracts/mpdao-vote";
import { MPDAO_VOTE_CONTRACT_ID, processMetaVote, useMainnet } from "../main";
import { mpdao_as_number } from "../util/convert";

export async function migrate() {
    console.log("starting migration")

    const OLD_META_VOTE_CONTRACT_ID = useMainnet ? "meta-vote.near" : "metavote.testnet"

    const oldMetaVote = new MpDaoVoteContract(OLD_META_VOTE_CONTRACT_ID)
    const newMetaVote = new MpDaoVoteContract(MPDAO_VOTE_CONTRACT_ID)
    const allOldVoters = await oldMetaVote.getAllVoters();
    const allNewVoters = await newMetaVote.getAllVoters();

    // process
    let countMigrated = 0
    let totalNewLockedMpdaoAmount = BigInt(0)
    for (let oldVoter of allOldVoters) {
        if (!oldVoter.locking_positions) continue;

        let userTotalVotingPower = 0
        let userTotalMetaLocked = 0
        let userTotalMetaUnlocking = 0
        let userTotalMetaUnlocked = 0
        for (let lp of oldVoter.locking_positions) {
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
        if (userTotalMetaLocked == 0 && userTotalMetaUnlocking == 0) {
            // nothing to migrate
            continue;
        }

        let voterToCreate = Object.assign({}, oldVoter)
        voterToCreate.locking_positions = [] // push only the ones to create
        voterToCreate.vote_positions = [] // push only the ones to create

        // check if already exists
        let newVoter = allNewVoters.find(i => i.voter_id = oldVoter.voter_id)
        if (!newVoter) {
            // not migrated yet
            newVoter = { voter_id: oldVoter.voter_id, voting_power: "0", locking_positions: [], vote_positions: [] }
        }
        for (let oldLp of oldVoter.locking_positions) {
            if (oldLp.is_unlocked) {
                continue // do not migrate unlocked positions
            }
            // migrate lp
            let migratedLp = newVoter.locking_positions.find(i => uniqueLp(i) == uniqueLp(oldLp));
            if (!migratedLp) {
                migratedLp = Object.assign({}, oldLp);
                // convert META to mpDAO, by truncating 24 decimals to 6 decimals
                const newLockedMpdaoAmount = BigInt(oldLp.amount) / BigInt("1" + "0".repeat(18))
                totalNewLockedMpdaoAmount += newLockedMpdaoAmount
                migratedLp.amount = newLockedMpdaoAmount.toString();
                newVoter.locking_positions.push(migratedLp)
                voterToCreate.locking_positions.push(migratedLp)
            }
        }

        for (let oldVp of oldVoter.vote_positions) {
            // migrate vp
            let migratedVp = newVoter.vote_positions.find(i => i.votable_address == oldVp.votable_address && i.votable_object_id == oldVp.votable_object_id);
            if (!migratedVp) {
                migratedVp = Object.assign({}, oldVp);
                newVoter.vote_positions.push(migratedVp)
                voterToCreate.vote_positions.push(migratedVp)
            }
        }

        if (voterToCreate.locking_positions.length > 0 || voterToCreate.vote_positions.length > 0) {
            console.log("migrating", voterToCreate.voter_id)
            countMigrated += 1
            await newMetaVote.create(voterToCreate);
        }

        // totalVotingPower += userTotalVotingPower
        // totalLocked += userTotalMetaLocked
        // totalUnlocking += userTotalMetaUnlocking
        // totalUnlocked += userTotalMetaUnlocked;

    }
    console.log("Old data analytics")
    let { metrics, dbRows, dbRows2 } = await processMetaVote(allOldVoters, 24);
    metrics.votesPerContractAndRound = []
    console.log(metrics)
    console.log("------")
    console.log("countMigrated", countMigrated)
    console.log("old totalLockedAndUnlocking", metrics.totalLocked + metrics.totalUnlocking)
    console.log("totalNewLockedMpdaoAmount", totalNewLockedMpdaoAmount.toString(), mpdao_as_number(totalNewLockedMpdaoAmount))
    console.log("TRANSFER ", totalNewLockedMpdaoAmount.toString(), " MPDAO TO ", newMetaVote.contract_account)
    console.log("------")

}
