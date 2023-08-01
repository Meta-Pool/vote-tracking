import { readFileSync, writeFileSync } from "fs";
import { MetaVoteContract, Voters } from "./contracts/meta-vote";
import { setRpcUrl, yton } from "near-api-lite";
import { argv, cwd, env } from "process";
import { VotersRow, createTableVotersIfNotExists } from "./util/tables";
import { insertOnConflictUpdate } from "./util/postgres";
import { setRecentlyFreezedFoldersVotes } from "./votesSetter";

import { Client } from 'pg';
import { config } from 'dotenv';



type ByContractInfoType = {
    contract: string;
    countVoters: number,
    totalVotes: number;
    proportionalMeta: number;
}
type MetaVoteMetricsType = {
    metaVoteUserCount: number;
    totalLocked: number;
    totalUnlocking: number;
    totalUnLocked: number;
    totalVotingPower: number;
    totalVotingPowerUsed: number;
    votesPerAddress: ByContractInfoType[];
}

async function processMetaVote(allVoters: Voters[]): Promise<{ metrics: MetaVoteMetricsType, dbRows: VotersRow[] }> {

    //---
    let totalLocked = 0
    let totalUnlocking = 0
    let totalUnlocked = 0
    let totalVotingPower = 0
    let totalVotingPowerUsed = 0
    let votesPerAddress: ByContractInfoType[] = []

    let dateString = (new Date().toISOString()).slice(0, 10)
    let dbRows: VotersRow[] = []

    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;

        let userTotalVotingPower = 0
        let userTotalMetaLocked = 0
        let userTotalMetaUnlocking = 0
        let userTotalMetaUnlocked = 0
        for (let lp of voter.locking_positions) {
            const metaAmount = yton(lp.amount)
            if (lp.is_locked) {
                userTotalMetaLocked += metaAmount
                userTotalVotingPower += yton(lp.voting_power)
            }
            else if (lp.is_unlocked) {
                userTotalMetaUnlocked += metaAmount
            }
            else {
                userTotalMetaUnlocking += metaAmount
            }
        }

        totalVotingPower += userTotalVotingPower
        totalLocked += userTotalMetaLocked
        totalUnlocking += userTotalMetaUnlocking
        totalUnlocked += userTotalMetaUnlocked;

        let userTotalVpInUse = 0
        let userTotalVpInValidators = 0
        let userTotalVpInLaunches = 0
        let userTotalVpInAmbassadors = 0
        let userTotalVpInOther = 0
        if (voter.vote_positions && userTotalVotingPower > 0) {

            let voterCounted:Record<string,boolean> = {}
            for (let vp of voter.vote_positions) {

                const positionVotingPower = yton(vp.voting_power)
                if (positionVotingPower == 0) continue;

                // compute proportional meta locked for this vote
                const proportionalMeta = userTotalMetaLocked * (positionVotingPower / userTotalVotingPower);
                userTotalVpInUse += positionVotingPower
                totalVotingPowerUsed += positionVotingPower

                let round = "#1"
                if (vp.votable_address == "metastaking.app") {
                    userTotalVpInValidators += positionVotingPower
                } else if (vp.votable_address == "metayield.app") {
                    userTotalVpInLaunches += positionVotingPower
                } else if (vp.votable_address == "initiatives") {
                    userTotalVpInAmbassadors += positionVotingPower
                    if (vp.votable_object_id.includes("Round #2")) round="#2";
                } else {
                    userTotalVpInOther += positionVotingPower
                }

                let id = vp.votable_address+round
                let prev = votesPerAddress.find(i => i.contract == id)
                if (!prev) {
                    votesPerAddress.push({
                        contract: id,
                        countVoters: 1,
                        totalVotes: positionVotingPower,
                        proportionalMeta: proportionalMeta
                    })
                    voterCounted[id] = true
                }
                else {
                    if (!voterCounted[id]) {
                        prev.countVoters += 1;
                        voterCounted[id] = true
                    }
                    prev.totalVotes += positionVotingPower
                    prev.proportionalMeta += proportionalMeta
                }
            }

            dbRows.push({
                date: dateString,
                account_id: voter.voter_id,
                vp_in_use: Math.trunc(userTotalVpInUse),
                vp_idle: Math.trunc(userTotalVotingPower - userTotalVpInUse),
                meta_locked: Math.trunc(userTotalMetaLocked),
                meta_unlocking: Math.trunc(userTotalMetaUnlocking),
                meta_unlocked: Math.trunc(userTotalMetaUnlocked),
                vp_in_validators: Math.trunc(userTotalVpInValidators),
                vp_in_launches: Math.trunc(userTotalVpInLaunches),
                vp_in_ambassadors: Math.trunc(userTotalVpInAmbassadors),
                //vp_in_others: Math.trunc(userTotalVpInOther),
            })

        }

    }

    return {
        metrics: {
            metaVoteUserCount: allVoters.length,
            totalLocked: totalLocked,
            totalUnlocking: totalUnlocking,
            totalUnLocked: totalUnlocked,
            totalVotingPower: totalVotingPower,
            totalVotingPowerUsed: totalVotingPowerUsed,
            votesPerAddress: votesPerAddress,
        },
        dbRows: dbRows
    }

}

async function mainProcess() {

    let metaVote = new MetaVoteContract(META_VOTE_CONTRACT_ID)
    const allVoters = await metaVote.getAllVoters();

    try {
        writeFileSync(`AllVoters.${new Date().toISOString().replace(/:/g, "-")}.json`, JSON.stringify(allVoters));
    } catch (ex) {
        console.error(ex)
    }

    let { metrics, dbRows } = await processMetaVote(allVoters);
    console.log(metrics)
    
    writeFileSync("hourly-metrics.json", JSON.stringify({
        metaVote: metrics
    }));

    try {
        await setRecentlyFreezedFoldersVotes(allVoters, useMainnet)
    } catch(err) {
        console.error(err)
    }

    config(); // This will load variables from .env file

    const client = new Client({
        user: process.env.DB_USERNAME,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT),
        ssl: {
            rejectUnauthorized: false,
            ca: readFileSync("./certificate/ca-certificate.crt").toString(),
        },
    });

    if (client) await createTableVotersIfNotExists(client);
    // insert/update the rows for this day, ONLY IF vp_in_use is higher than the existing value
    // so we store the high-water mark for the voter/day
    await insertOnConflictUpdate(client, dbRows);
    console.log("update/insert", dbRows.length, "rows")

    await client.end();
}

async function analyzeSingleFile(filePath:string) {
    let allVoters = JSON.parse(readFileSync(filePath).toString())
    let { metrics } = await processMetaVote(allVoters);
    console.log(metrics)
}

export const useTestnet = argv.includes("test") || argv.includes("testnet") || cwd().includes("testnet");
export const useMainnet = !useTestnet
if (useTestnet) console.log("USING TESTNET")
const META_VOTE_CONTRACT_ID = useMainnet ? "meta-vote.near" : "metavote.testnet"
export const META_PIPELINE_CONTRACT_ID = useMainnet ? "meta-pipeline.near" : "dev-1686255629935-21712092475027"
export const META_PIPELINE_OPERATOR_ID = useMainnet ? "pipeline-operator.near" : "meta-vote.testnet"
if (useTestnet) setRpcUrl("https://rpc.testnet.near.org")

// process single file: node dist/main.js file xxxx.json
const fileArgvIndex = argv.findIndex(i=>i=="file")
if (fileArgvIndex>0) {
    analyzeSingleFile(argv[fileArgvIndex+1])
}
else {
    mainProcess()
}
