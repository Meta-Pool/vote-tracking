import { readFileSync } from 'fs';
import { homedir } from 'os'
import path from 'path'

export type PgConfig = {
  userName: string,
  password: string,
  host: string,
  port: number
}

// get a json file located in ~/.config/mainnet_pg_config.json | ~/.config/testnet_pg_config.json
export function getPgConfig(network: string): PgConfig {
  const CONFIG_FILE = path.join(homedir(), ".config", network + "_pg_config.json")
  const config = JSON.parse(readFileSync(CONFIG_FILE).toString());
  if (!config.userName) {
    throw new Error("INVALID PG CONFIG FILE. no username " + CONFIG_FILE)
  }
  return config
}

export function pgPlaceHoldersConvert(parameterizedSql: string, params: Record<string, any>) {
  let index = 1
  let paramArray = []
  for (let key in params) {
    parameterizedSql = parameterizedSql.replace(RegExp(`\\b:${key}\\b`, 'g'), `$${index}`)
    paramArray.push(params[key])
  }
  return { parameterizedSql, paramArray };
}
