import { readFileSync } from 'fs';
import os from 'os'
import path from 'path'
import { useMainnet } from '../main';

export function getCredentials(accountId: string) {
    const network = useMainnet ? "mainnet" : "testnet"

    const homedir = os.homedir()
    const CREDENTIALS_FILE = path.join(homedir, ".near-credentials/" + network + "/" + accountId + ".json")

    const credentialsString = readFileSync(CREDENTIALS_FILE).toString();
    const credentials = JSON.parse(credentialsString)
    if (!credentials.private_key) {
        throw new Error("INVALID CREDENTIALS FILE. no priv.key " + CREDENTIALS_FILE)
    }
    return credentials

}
