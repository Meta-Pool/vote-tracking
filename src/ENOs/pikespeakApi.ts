import os from 'os'
import path from 'path'
import fs from 'fs'

const BASE_URL = "https://api.pikespeak.ai/"
const API_KEY = getApiKey()

export interface DelegatorsByEpochResponse {
    count: string
    epoch_id: string // pikespeak has it's own ids for epochs
    timestamp: string
}

export interface PikespeakValidatorEpochHistory {
    account_id: string
    epoch_id: string // pikespeak has it's own ids for epochs
    reward_amount: string
    amount_delta: string
    stake_delta: string,
    fee_fraction: string,
    last_balance: string,
    stake_shares: string,
    total_staked_balance: string,
    delegator_count: string,
    timestamp: string
}

function getApiKey(): string | undefined {
    const homedir = os.homedir()
    const CREDENTIALS_FILE = path.join(homedir, ".config/eno/pikespeakApiKey.txt").trim()
    try {
        const credentialsString = fs.readFileSync(CREDENTIALS_FILE).toString();
        return credentialsString
    } catch (ex) {
        console.error(JSON.stringify(ex));
    }
}

async function httpGet(path: string) {
    if (!API_KEY) {
        console.error("API_KEY not found")
        return
    }
    const response = await fetch(path, {
        headers: {
            accept: "application/json",
            "x-api-key": API_KEY
        }
    })
    return response.json()
}

export async function getDelegatorsByEpoch(): Promise<DelegatorsByEpochResponse[]> {
    return httpGet(path.join(BASE_URL, "validators/delegators-by-epoch"))
}

export async function getDelegatorsForContractAndEpoch(contractId: string, epochId: string) {
    return httpGet(path.join(BASE_URL, "validators/delegators", contractId + "?epoch_id=" + epochId))
}

export async function getDelegatorEpochHistory(contractId: string) {
    return httpGet(path.join(BASE_URL, "validators/epoch-history", contractId))
}