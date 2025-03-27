import { MpDaoVoteContract, VoterInfo } from "../contracts/mpdao-vote";
import * as sqlite3 from "sqlite3";
import { MPDAO_VOTE_CONTRACT_ID } from "../main";
import { ISODateTrunc } from "../util/date";
import { buildInsert } from "../util/sqlBuilder";
import { open, run } from "../util/sq3";
import { toNumber } from "../util/convert";
import { existsSync, readFileSync, writeFileSync } from "fs";


async function insert(db: sqlite3.Database, table: string, rows: Record<string, any>[]) {
    for (let row of rows) {
        const { statement, values } = buildInsert("sq3", "insert", table, row)
        await run(db, statement, values)
    }
}

export async function saveVoteSnapshotIntoSqliteDb() {

    const filename = `voters-snapshot-${ISODateTrunc(new Date())}.db`
    console.log("creating db file", filename)
    // create db
    const db = await open(filename)

    await run(db, `CREATE TABLE IF NOT EXISTS voters
        (
        account_id TEXT
        , is_eth bool
        , voting_power integer
        )
        `);

    await run(db, `DROP TABLE IF EXISTS locking_positions`)
    await run(db, `CREATE TABLE IF NOT EXISTS locking_positions
        (
        account_id TEXT,
        pos_index integer,
        amount real,
        days integer,
        voting_power integer,
        locked bool,
        unlocking bool,
        unlocked bool,
        unlocking_started_at text
        )`);


    let allVoters: VoterInfo[]
    if (existsSync(filename + ".json")) {
        console.log("file already exists, reading", filename + ".json")
        allVoters = JSON.parse(readFileSync(filename + ".json", "utf-8").toString())
    }
    else {
        console.log("fetching all voters from chain")
        let mpDaoVote = new MpDaoVoteContract(MPDAO_VOTE_CONTRACT_ID)
        allVoters = await mpDaoVote.getAllVoters();
        console.log("saving")
        writeFileSync(filename + ".json", JSON.stringify(allVoters, null, 2))
    }
    console.log("got all voters", allVoters.length)

    await run(db, "begin transaction", undefined);

    let countVoters = 0
    // insert all voters
    for (let voter of allVoters) {
        if (!voter.locking_positions) continue;
        const voterIsEthMirror = voter.voter_id.endsWith(".evmp.near") || voter.voter_id.endsWith(".evmp.testnet")
        // insert voter
        await insert(db, "voters", [{
            account_id: voter.voter_id,
            is_eth: voterIsEthMirror,
        }])
        // insert locking positions
        await insert(db, "locking_positions",
            voter.locking_positions.map(lp => ({
                account_id: voter.voter_id,
                pos_index: lp.index,
                locked: lp.is_locked,
                unlocking: lp.is_unlocking,
                unlocked: lp.is_unlocked,
                amount: toNumber(lp.amount, 6),
                days: lp.locking_period,
                voting_power: toNumber(lp.voting_power, 24),
                unlocking_started_at: lp.unlocking_started_at ? ISODateTrunc(new Date(lp.unlocking_started_at)) : null
            }))
        )
        countVoters++
        if (countVoters % 100 == 0) {
            console.log("inserted", countVoters, "voters")
        }
    }
    await run(db, "commit transaction");
    console.log("committed into db file", filename)

    db.close();
}
