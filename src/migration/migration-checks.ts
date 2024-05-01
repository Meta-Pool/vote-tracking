import { yton } from "near-api-lite";
import { MpDaoVoteContract, VoterInfo, uniqueNewLp, uniqueOldLp } from "../contracts/mpdao-vote";
import { META_POOL_DAO_ACCOUNT, MPDAO_VOTE_CONTRACT_ID, OLD_META_VOTE_CONTRACT_ID, processMpDaoVote, useMainnet } from "../main";
import { addCommas, mpdao_as_number, toNumber } from "../util/convert";
import { getCredentials } from "../util/near";
import { Nep141 } from "../contracts/NEP-141";

export function getContracts() {

    const oldMetaVote = new MpDaoVoteContract(OLD_META_VOTE_CONTRACT_ID)
    const credentials = getCredentials(MPDAO_VOTE_CONTRACT_ID)
    const newMetaVote = new MpDaoVoteContract(MPDAO_VOTE_CONTRACT_ID, credentials.account_id, credentials.private_key)

    return { oldMetaVote, newMetaVote }
}

export async function migrateLpVp() {
    console.log("starting migration lp & vp")

    const { oldMetaVote, newMetaVote } = getContracts()
    const allOldVoters = await oldMetaVote.getAllVoters();
    const allNewVoters = await newMetaVote.getAllVoters();

    // migrate lp and vp
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

        if (oldVoter.voter_id == "lucio.testnet") {
            console.log("DEBUG:", oldVoter.voter_id)
        }
        // check if already exists
        let newVoter = allNewVoters.find(i => i.voter_id == oldVoter.voter_id)
        if (!newVoter) {
            // not migrated yet
            newVoter = { voter_id: oldVoter.voter_id, voting_power: "0", locking_positions: [], vote_positions: [] }
        }
        for (let oldLp of oldVoter.locking_positions) {
            if (oldLp.is_unlocked) {
                continue // do not migrate unlocked positions
            }
            // migrate lp
            const newLockedMpdaoAmount = BigInt(oldLp.amount) / BigInt("1" + "0".repeat(18))
            let migratedLp = newVoter.locking_positions.find(i => uniqueNewLp(i) == uniqueOldLp(oldLp));
            if (!migratedLp) {
                migratedLp = Object.assign({}, oldLp);
                // convert META to mpDAO, by truncating 24 decimals to 6 decimals
                totalNewLockedMpdaoAmount += newLockedMpdaoAmount
                migratedLp.amount = newLockedMpdaoAmount.toString();
                if (migratedLp.locking_period == 0) { // testnet invalid cases, use 60d/1x
                    migratedLp.locking_period = 60
                }
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
            await newMetaVote.migration_create(voterToCreate);
        }

        // totalVotingPower += userTotalVotingPower
        // totalLocked += userTotalMetaLocked
        // totalUnlocking += userTotalMetaUnlocking
        // totalUnlocked += userTotalMetaUnlocked;

    }
    console.log("------")
    console.log("countMigrated this run", countMigrated, "totalNewLockedMpdaoAmount", totalNewLockedMpdaoAmount.toString(), mpdao_as_number(totalNewLockedMpdaoAmount));
    console.log("------")
    console.log("Old data analytics")
    let { metrics, dbRows, dbRows2, extraMetrics } = await processMpDaoVote(allOldVoters, 24);
    console.log(metrics)
    console.log(extraMetrics)
    console.log("old totalLockedAndUnlocking", metrics.totalLocked + metrics.totalUnlocking)
    console.log("------")
    // re-read
    const allNewVotersAfter = await newMetaVote.getAllVoters();
    console.log("New data analytics")
    let { metrics: metrics2, dbRows: d1, dbRows2: d2, extraMetrics: newExtraMetrics } = await processMpDaoVote(allNewVotersAfter, 6);
    console.log(metrics2)
    console.log(newExtraMetrics)

    const MPDAO_TOKEN_CONTRACT_ID = useMainnet ? "mpdao-token.near" : "mpdao-token.testnet"
    const mpdaoToken = new Nep141(MPDAO_TOKEN_CONTRACT_ID)
    const mpdaoBalanceVoteContract = BigInt(await mpdaoToken.ft_balance_of(MPDAO_VOTE_CONTRACT_ID))
    const missingMpDaoTokenUnits = newExtraMetrics.totalLockedB + newExtraMetrics.totalUnlockingB - mpdaoBalanceVoteContract
    console.log("------")
    console.log("contract mpDAO balance", addCommas(mpdao_as_number(mpdaoBalanceVoteContract).toFixed(6)))
    console.log("TRANSFER ", missingMpDaoTokenUnits, " MPDAO TO ", newMetaVote.contract_account, "~", addCommas(toNumber(missingMpDaoTokenUnits, 6).toFixed(6)))
    console.log("------")
    if (missingMpDaoTokenUnits > BigInt(0)) {
        console.log("try transfer from", META_POOL_DAO_ACCOUNT)
        const credentials = getCredentials(META_POOL_DAO_ACCOUNT)
        const mpdaoTokenSigner = new Nep141(MPDAO_TOKEN_CONTRACT_ID, credentials.account_id, credentials.private_key)
        await mpdaoTokenSigner.storage_deposit(newMetaVote.contract_account)
        await mpdaoTokenSigner.ft_transfer(newMetaVote.contract_account, missingMpDaoTokenUnits)
    }
}

// migrate associated user data
export async function migrateAud() {
    console.log("starting migration of associated user data")

    const { oldMetaVote, newMetaVote } = getContracts()

    const BATCH_SIZE = 50
    let retrieved = BATCH_SIZE
    let fromIndex = 0
    while (retrieved == BATCH_SIZE) {
        const dataBatch = await oldMetaVote.get_airdrop_accounts(fromIndex, BATCH_SIZE)
        retrieved = dataBatch.length
        if (retrieved) {
            await newMetaVote.migration_set_associated_data(dataBatch)
            console.log(dataBatch.length, "migrated")
            fromIndex += dataBatch.length
        }
    }
    console.log(fromIndex, "total migrated")
}
