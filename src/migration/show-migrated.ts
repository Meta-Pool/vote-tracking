import { MpDaoVoteContract } from "../contracts/mpdao-vote";
import { MPDAO_VOTE_CONTRACT_ID, OLD_META_VOTE_CONTRACT_ID } from "../main";
import { getCredentials } from "../util/near";

export function getContracts() {

    const oldMetaVote = new MpDaoVoteContract(OLD_META_VOTE_CONTRACT_ID)
    const credentials = getCredentials(MPDAO_VOTE_CONTRACT_ID)
    const newMetaVote = new MpDaoVoteContract(MPDAO_VOTE_CONTRACT_ID, credentials.account_id, credentials.private_key)

    return { oldMetaVote, newMetaVote }
}

export async function showMigrated() {
    const { oldMetaVote, newMetaVote } = getContracts()
    const allMigrated = await oldMetaVote.getAllMigratedUsers()
    console.log(JSON.stringify(allMigrated,undefined,4))
}