import { getContracts } from "./migration-checks"

export async function showMigrated() {
    const { oldMetaVote, newMetaVote } = getContracts()
    const allMigrated = await oldMetaVote.getAllMigratedUsers()
    console.log(JSON.stringify(allMigrated,undefined,4))
}