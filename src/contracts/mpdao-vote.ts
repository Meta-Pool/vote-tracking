import { yton } from 'near-api-lite';
import { AvailableClaims } from '../util/tables.js';
import { SmartContract, U128String, isDryRun } from './base-smart-contract.js';
import { isoTruncDate } from '../util/convert.js';

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

// lp.amount has 6 decimals
export function uniqueNewLp(lp: LockingPosition): string {
    return `${lp.locking_period}|${lp.amount}|${lp.is_locked}|${lp.is_unlocking}|${lp.is_unlocked}|${lp.unlocking_started_at}`
}
// lp.amount has 24 decimals, normalize to 6
export function uniqueOldLp(lp: LockingPosition): string {
    const normalizedAmount: string = lp.amount.slice(0, -18)
    const normalizedPeriod = lp.locking_period == 0 ? 60 : lp.locking_period;
    return `${normalizedPeriod}|${normalizedAmount}|${lp.is_locked}|${lp.is_unlocking}|${lp.is_unlocked}|${lp.unlocking_started_at}`
}

export class MpDaoVoteContract extends SmartContract {

    //----------------------------
    // get votes for all items of a specific app
    async get_votes_by_contract(contract_address: string): Promise<Array<VotableObjectJSON>> {
        return this.view("get_votes_by_contract", { contract_address });
    }

    // ALL voter info, voter + locking-positions + voting-positions
    async getAllVoters(): Promise<VoterInfo[]> {
        if (isDryRun()) console.log("start getAllVoters()")
        let voters: VoterInfo[] = []
        const BATCH_SIZE = 50
        let retrieved = BATCH_SIZE
        while (retrieved == BATCH_SIZE) {
            const batch: VoterInfo[] = await this.view("get_voters", { from_index: voters.length, limit: BATCH_SIZE }) as unknown as VoterInfo[]
            retrieved = batch.length
            voters = voters.concat(batch)
            if (isDryRun()) console.log("voters retrieved", voters.length)
        }
        return voters
    }

    // ALL st_near claims
    async getAllStnearClaims(): Promise<AvailableClaims[]> {
        let claims: AvailableClaims[] = []
        const isoDate = isoTruncDate()
        const BATCH_SIZE = 75
        let retrieved = BATCH_SIZE
        while (retrieved == BATCH_SIZE) {
            const batch: [] = await this.view("get_stnear_claims", { from_index: claims.length, limit: BATCH_SIZE }) as unknown as []
            retrieved = batch.length
            for(let tuple of batch) {
                // returned with current date to be stored in the tracking DB
                claims.push({account_id:tuple[0],date:isoDate, token_code:0, claimable_amount: yton(tuple[1]) })
            }
        }
        return claims
    }
    
    // ALL migrated users [[account,amount_meta],...], (method existent only in the old contract using $META token)
    async getAllMigratedUsers(): Promise<String[]> {
        let migratedUserTuples : String[] = []
        const isoDate = isoTruncDate()
        const BATCH_SIZE = 75
        let retrieved = BATCH_SIZE
        while (retrieved == BATCH_SIZE) {
            const batch = await this.view("get_migrated_users", { from_index: migratedUserTuples.length, limit: BATCH_SIZE }) as unknown as String[]
            retrieved = batch.length
            migratedUserTuples = migratedUserTuples.concat(batch)
        }
        return migratedUserTuples
    }

    async migration_create(data: VoterInfo) {
        return this.call("migration_create", { data });
    }

    async get_airdrop_accounts(fromIndex: number, limit: number): Promise<[]> {
        return this.view("get_airdrop_accounts", { from_index: fromIndex, limit }) as unknown as []
    }

    async migration_set_associated_data(usersData: []) { // data: Vec<(AccountId, String)>
        return this.call("migration_set_associated_data", { data: usersData });
    }

    async get_lock_in_vote_filters() {
        return this.view("get_lock_in_vote_filters")
    }

    async set_lock_in_vote_filters(end_timestamp_ms: number, votable_numeric_id: number, votable_address?: string) {
        return this.call("set_lock_in_vote_filters", { end_timestamp_ms, votable_numeric_id, votable_address })
    }

}