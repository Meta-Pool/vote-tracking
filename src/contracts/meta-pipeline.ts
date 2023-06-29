import { SmartContract, U128String } from "./base-smart-contract";

type AccountId = string

export type FolderData = {
    name: String,
    folder_id: number,
    user_group_id: number,
    freeze_unix_timestamp: number,
    start_vote_timestamp: number,
    end_vote_timestamp: number,
    extra_unix_timestamp_1: number,
    extra_unix_timestamp_2: number,
    extra_unix_timestamp_3: number,
    extra_unix_timestamp_4: number,
}

export type ProjectMetadataJson = {
    id: number,
    folder_id: number,
    owner: AccountId,
    title: string,
    create_timestamp: number,
    last_edit_timestamp: number,
    document_size: number,
    is_validated: boolean,
    report_url: string,
    votes: U128String,
    votes_percentage_bp: number,
}

export class MetaPipelineContract extends SmartContract {

    async getFolders(): Promise<FolderData[]> {
        return this.view("get_folders")
    }

    async getProjectsInFolder(folderId: number): Promise<ProjectMetadataJson[]> {
        return this.view("get_projects_in_folder", {folder_id: folderId})
    }

    async setVotes(projectId: number, totalProjectVotes: U128String, totalProjectVotesPercentageBp: number): Promise<any> {
        return this.call("set_votes", {project_id: projectId, total_votes: totalProjectVotes, total_votes_percentage_bp: totalProjectVotesPercentageBp}, undefined, "1")
    }

}
