import { SmartContract, U128String } from './base-smart-contract.js';

export type VotableObjectJSON = {
    votable_contract: String;
    id: string;
    current_votes: U128String
}

export type VotePositionJSON = {
    votable_address: string;
    votable_object_id: string;
    voting_power: U128String;
}

export type LockingPosition = {
    index: number;
    amount: string; // mpdao, 6 decimals
    locking_period: number;
    voting_power: string;
    unlocking_started_at: number | null;
    is_unlocked: boolean,
    is_unlocking: boolean,
    is_locked: boolean
}

export type VoterInfo = {
    voter_id: string;
    locking_positions: Array<LockingPosition>;
    voting_power: string,
    vote_positions: Array<
        {
            votable_address: string;
            votable_object_id: string;
            voting_power: string;
        }>;
};

export function uniqueLp(lp: LockingPosition): string {
    return `${lp.locking_period}|${lp.amount}|${lp.is_locked}|${lp.is_unlocking}|${lp.is_unlocked}|${lp.unlocking_started_at}`
}

export class MpDaoVoteContract extends SmartContract {

    //----------------------------
    // get votes for all items of a specific app
    async get_votes_by_contract(contract_address: string): Promise<Array<VotableObjectJSON>> {
        return this.view("get_votes_by_contract", { contract_address });
    }

    // ALL voter info, voter + locking-positions + voting-positions
    async getAllVoters(): Promise<VoterInfo[]> {
        let voters: VoterInfo[] = []
        const BATCH_SIZE = 75
        let retrieved = BATCH_SIZE
        while (retrieved == BATCH_SIZE) {
            const batch: VoterInfo[] = await this.view("get_voters", { from_index: voters.length, limit: BATCH_SIZE }) as unknown as VoterInfo[]
            retrieved = batch.length
            //console.log("voters retrieved", retrieved)
            voters = voters.concat(batch)
        }
        //console.log("total voters", voters.length)
        return voters
    }

    async create(voter: VoterInfo) {
        return this.call("create", { voter });
    }
}