import { MpDaoVoteContract } from "../contracts/mpdao-vote";
import { OLD_META_VOTE_CONTRACT_ID } from "../main";

export async function showClaimsStNear() {
    const oldMetaVote = new MpDaoVoteContract(OLD_META_VOTE_CONTRACT_ID)
    const allInfo = await oldMetaVote.getAllStnearClaims()
    console.log(JSON.stringify(allInfo,undefined,4))
}