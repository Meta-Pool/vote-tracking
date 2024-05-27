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

export async function getDelegatorsByEpoch(): Promise<DelegatorsByEpochResponse[]> {
    if(!API_KEY) {
        console.error("API_KEY not found")
        return []
    }
    const response = await fetch(path.join(BASE_URL, "validators/delegators-by-epoch"), {
        headers: {
            accept: "application/json",
            "x-api-key": API_KEY
        }
    })
    try {
        let result = await response.json()
        return result
    } catch(err) {
        console.error(err.message, err.stack)
        console.error(response)
        throw err
    }
}

export async function getDelegatorsForContractAndEpoch(contractId: string, epochId: string) {
    if(!API_KEY) {
        console.error("API_KEY not found")
        return
    }
    const response = await fetch(path.join(BASE_URL, "validators/delegators", contractId + "?epoch_id=" + epochId), {
        headers: {
            accept: "application/json",
            "x-api-key": API_KEY
        }
    })
    return response.json()
}

