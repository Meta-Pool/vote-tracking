import { yton } from "near-api-lite";
import { FolderData, MetaPipelineContract, ProjectMetadataJson } from "./contracts/meta-pipeline";
import { VoterInfo } from "./contracts/mpdao-vote";
import { META_PIPELINE_CONTRACT_ID, META_PIPELINE_OPERATOR_ID, dryRun } from "./main";
import { getCredentials } from "./util/near";
import { sleep } from "./util/util";


import * as fs from 'fs';
import * as path from 'path';

export function getVotesSnapshot(endVoteTimestampSeconds: number): VoterInfo[] {

    const endVoteDate = new Date(endVoteTimestampSeconds * 1000)
    const afterEndVoteDate = new Date((endVoteTimestampSeconds + 60 * 5) * 1000)
    console.log("getVotesSnapshot", endVoteDate.toISOString())
    const dateIsoFilePrefix = afterEndVoteDate.toISOString().slice(0, 11) // 2024-07-01T
    const monthDir = dateIsoFilePrefix.slice(0, 7)
    console.log(`read dir ${monthDir}`)
    let files = fs.readdirSync(monthDir)
    const regex = new RegExp(`^AllVoters\\.${dateIsoFilePrefix}(.+)\\.json$`)
    if (dryRun) console.log(regex)
    let minTimeFound = ""
    for (let file of files) {
        const match = file.match(regex);
        if (dryRun) console.log(file, match)
        if (match) {
            const time = match[1]
            if (!minTimeFound || time < minTimeFound) { minTimeFound = time }
        }
    }
    if (minTimeFound) {
        const fullFileName = `AllVoters.${dateIsoFilePrefix}${minTimeFound}.json`
        const filePath = path.join(monthDir, fullFileName);
        console.log("snapshot:", filePath)
        return JSON.parse(fs.readFileSync(filePath).toString())
    }
    throw new Error("no snapshot found")
}

export async function setRecentlyFreezedFoldersVotes() {

    const credentials = getCredentials(META_PIPELINE_OPERATOR_ID)

    const metaPipelineContract = new MetaPipelineContract(META_PIPELINE_CONTRACT_ID, credentials.account_id, credentials.private_key)

    const folders: FolderData[] = await metaPipelineContract.getFolders()

    const nowInSeconds = Date.now() / 1000
    // get folders freezed and with votes closed
    const voteCompletedFolders = folders.filter((folder: FolderData) => {
        return folder.freeze_unix_timestamp <= nowInSeconds && folder.end_vote_timestamp <= nowInSeconds
    })

    if (voteCompletedFolders.length === 0) return

    // get the folder with max end_vote_timestamp
    const folderToUpdate = voteCompletedFolders.reduce((latestFinishedFolder: FolderData, curr: FolderData) => {
        if (curr.end_vote_timestamp > latestFinishedFolder.end_vote_timestamp) {
            return curr
        } else {
            return latestFinishedFolder
        }
    }, voteCompletedFolders[0])

    console.log("folder to update", folderToUpdate)

    // get all project meta-data in the folder
    const projectsMetadata: ProjectMetadataJson[] = await metaPipelineContract.getProjectsInFolder(folderToUpdate.folder_id)
    // filter only validated projects
    const validatedProjectsMetadata: ProjectMetadataJson[] = projectsMetadata.filter((project: ProjectMetadataJson) => {
        return project.is_validated
    })

    // TEST -- erase snapshot commands
    if (dryRun && process.argv.includes("remove-calls")) {
        for (let project of validatedProjectsMetadata) {
            console.log(`near call meta-pipeline.near set_votes '{"project_id":${project.id},"total_votes":"0","total_votes_percentage_bp":0}' --useAccount pipeline-operator.near --depositYocto 1`)
        }
    }

    // get first snapshot after votes closed
    let allVoters = getVotesSnapshot(folderToUpdate.end_vote_timestamp)

    // select all the non-updated yet (votes==0)
    const projectsToUpdate: ProjectMetadataJson[] = validatedProjectsMetadata.filter((project: ProjectMetadataJson) => {
        return project.votes === "0"
    })

    if (projectsToUpdate.length === 0) return

    // sum votes per-project
    const votes: Record<number, bigint> = processVoters(allVoters)
    // compute totalVotesInFolder to calculate votes pct
    const projectIdsInFolder: number[] = validatedProjectsMetadata.map((project: ProjectMetadataJson) => project.id)
    const totalVotesInFolder: bigint = Object.keys(votes).reduce((sum: bigint, idAsString: string) => {
        if (projectIdsInFolder.includes(Number(idAsString))) {
            return sum + votes[Number(idAsString)]
        } else {
            return sum
        }
    }, BigInt(0))

    for (let project of projectsToUpdate) {
        // If a project doesn't receive any votes, we put 1 as default value to mark the record as already updated
        const projectVotes = votes[project.id] || BigInt("1")
        const percentage = totalVotesInFolder == BigInt("0") ? 0 : projectVotes * BigInt(10 ** 4) / totalVotesInFolder
        console.log(project.id, projectVotes, Number(percentage.toString()))
        await metaPipelineContract.setVotes(project.id, projectVotes.toString(), Number(percentage.toString()))
        await sleep(2000)
    }
}

function processVoters(allVoters: VoterInfo[]): Record<number, bigint> {
    let output: Record<number, bigint> = {}

    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;

        if (voter.vote_positions) {
            for (let vp of voter.vote_positions) {

                const positionVotingPower = yton(vp.voting_power)
                if (positionVotingPower == 0) continue;

                if (vp.votable_address == "initiatives") {
                    const projectId = Number(vp.votable_object_id.split("|")[0])
                    if (!output[projectId]) {
                        output[projectId] = BigInt(0)
                    }
                    output[projectId] += BigInt(vp.voting_power)
                }
            }
        }
    }

    return output
}