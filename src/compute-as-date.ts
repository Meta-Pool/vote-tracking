import { VoterInfo } from "./contracts/mpdao-vote"
import { processMpDaoVote } from "./main"

// compute locking and avg voting TODAY but save as a specific date
// to be used if there are dates missing because bot failure
export async function computeAsDate(argDateISO: string, allVoters: VoterInfo[]) {

    const dateAsDate = new Date(argDateISO)
    const secondsDif = dateAsDate.getTime() - new Date().getTime()
    if (Math.abs(secondsDif) > 15 * 24 * 60 * 60) {
        console.error("need to pass an iso date no more than 15 days from now, received", argDateISO)
    }

    const dateString = dateAsDate.toISOString().slice(0, 10)
    console.log("---------- COMPUTE AS DATE", dateString)

    let { metrics, dbRows, dbRows2 } = await processMpDaoVote(allVoters, 6, dateString);

    // // UPDATE but using the indicated data
    // // update local SQLite DB - it contains max locked tokens and max voting power per user/day
    // await updateDbSqLite(dbRows, dbRows2, [])
    // // update remote pgDB
    // await updateDbPg(dbRows, dbRows2, [])

}