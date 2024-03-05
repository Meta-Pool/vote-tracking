import { MpDaoVoteContract } from "../contracts/mpdao-vote";
import { OLD_META_VOTE_CONTRACT_ID } from "../main";

export async function showMigrated() {
    const oldMetaVote = new MpDaoVoteContract(OLD_META_VOTE_CONTRACT_ID)
    const allMigrated = await oldMetaVote.getAllMigratedUsers()
    console.log(JSON.stringify(allMigrated,undefined,4))
}