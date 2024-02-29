import { yton } from "near-api-lite";
import { FolderData, MetaPipelineContract, ProjectMetadataJson } from "./contracts/meta-pipeline";
import { VoterInfo } from "./contracts/mpdao-vote";
import { META_PIPELINE_CONTRACT_ID, META_PIPELINE_OPERATOR_ID } from "./main";
import { getCredentials } from "./util/near";

export async function setRecentlyFreezedFoldersVotes(allVoters: VoterInfo[], useMainnet: boolean) {
    const votes: Record<number, bigint> = processVoters(allVoters)

    const credentials = getCredentials(META_PIPELINE_OPERATOR_ID)
    
    const metaPipelineContract = new MetaPipelineContract(META_PIPELINE_CONTRACT_ID, credentials.account_id, credentials.private_key)
    
    const folders: FolderData[] = await metaPipelineContract.getFolders()

    const nowInSeconds = Date.now() / 1000
    const voteCompletedFolders = folders.filter((folder: FolderData) => {
        return folder.freeze_unix_timestamp <= nowInSeconds && folder.end_vote_timestamp <= nowInSeconds
    })

    if(voteCompletedFolders.length === 0) return

    const folderToUpdate = voteCompletedFolders.reduce((latestFinishedFolder: FolderData, curr: FolderData) => {
        if(curr.end_vote_timestamp > latestFinishedFolder.end_vote_timestamp) {
            return curr
        } else {
            return latestFinishedFolder
        }
    }, voteCompletedFolders[0])

    const projectsMetadata: ProjectMetadataJson[] = await metaPipelineContract.getProjectsInFolder(folderToUpdate.folder_id)
    const validatedProjectsMetadata: ProjectMetadataJson[] = projectsMetadata.filter((project: ProjectMetadataJson) => {
        return project.is_validated
    })

    const projectsToUpdate: ProjectMetadataJson[] = validatedProjectsMetadata.filter((project: ProjectMetadataJson) => {
        return project.votes === "0"
    })

    if(projectsToUpdate.length === 0) return

    const projectIdsInFolder: number[] = validatedProjectsMetadata.map((project: ProjectMetadataJson) => project.id)
    const totalVotesInFolder: bigint = Object.keys(votes).reduce((sum: bigint, idAsString: string) => {
        if(projectIdsInFolder.includes(Number(idAsString))) {
            return sum + votes[Number(idAsString)]
        } else {
            return sum
        }
    }, BigInt(0))

    for(let project of projectsToUpdate) {
        // If a project doesn't receive any votes, we put 1 as default value to mark the record as already updated
        const projectVotes = votes[project.id] || BigInt("1")
        const percentage = totalVotesInFolder==BigInt("0")? 0 : projectVotes * BigInt(10 ** 4) / totalVotesInFolder
        console.log(project.id, projectVotes, Number(percentage.toString()))
        if (useMainnet) await metaPipelineContract.setVotes(project.id, projectVotes.toString(), Number(percentage.toString()))
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
                    if(!output[projectId]) {
                        output[projectId] = BigInt(0)
                    }
                    output[projectId] += BigInt(vp.voting_power)
                }
            }
        }
    }

    return output
}