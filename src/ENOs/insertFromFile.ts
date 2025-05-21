import { readFileSync, rmdirSync } from "fs"
import { argv } from "process"
import { insertENOsByDelegatorData, insertENOsData } from "../main"
import { ENO, ENODelegator } from "../util/tables"

async function insertEnosDataFromFile(filename: string) {
    const data: ENO[] = JSON.parse(readFileSync(filename, 'utf-8'))
    const isSucess = await insertENOsData(data)
    if(isSucess) {
        rmdirSync(filename)
    }
}

async function insertEnosByDelegatorDataFromFile(filename: string) {
    const data: ENODelegator[] = JSON.parse(readFileSync(filename, 'utf-8'))
    const isSucess = await insertENOsByDelegatorData(data)
    if(isSucess) {
        rmdirSync(filename)
    }
}

async function run() {
    const enoArgvIndex = argv.findIndex(i => i == "eno")
    if (enoArgvIndex > 0) {
        // process single file: node dist/main.js file xxxx.json
        const filename = argv[enoArgvIndex + 1]
        await insertEnosDataFromFile(filename)
        return
    }
    const enoByDelegatorArgvIndex = argv.findIndex(i => i == "eno-by-delegator")
    if (enoByDelegatorArgvIndex > 0) {
        // process single file: node dist/main.js file xxxx.json
        const filename = argv[enoByDelegatorArgvIndex + 1]
        await insertEnosByDelegatorDataFromFile(filename)
        return
    }
}

run()