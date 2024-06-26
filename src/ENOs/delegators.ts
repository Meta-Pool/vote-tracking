import { ENO, ENODelegator } from "../util/tables";
import { sleep } from "../util/util";
import { DelegatorsByEpochResponse, getDelegatorsByEpoch, getDelegatorsForContractAndEpoch } from "./api";

/* cSpell:disable */
const contracts = [
    "northstake.poolv1.near",
    "colossus.poolv1.near",
    "luganodes.pool.near",
    "senseinode.poolv1.near",
    "dsrvlabs-staking.poolv1.near",
    "tritonone.poolv1.near",
    "stakin.poolv1.near",
    "frensvalidator.poolv1.near",
    "grassets.poolv1.near",
    "nodes.poolv1.near",
    "alphanodes.poolv1.near",
    "a41.poolv1.near",
    "mexican.pool.near",
    "stablelab.poolv1.near",
    "alumlabs.poolv1.near",
    "stakecraft.poolv1.near",
    "centurion.poolv1.near",
    "piertwopool.poolv1.near",
    "stakecito.poolv1.near",
    "dacmpool.poolv1.near",
    "vodafonedab.poolv1.near",
    "staketab.poolv1.near",
    "everstake.poolv1.near",
    "nacioncrypto-parceros.poolv1.near",
    "staking4all.poolv1.near",
]
/* cSpell:enable */

const liquidStakingAccounts = [
    "meta-pool.near",
    "linear-protocol.near",
]

export function getENOsContracts() {
    return contracts
}

/**
 * Generate all the table data from the timestamp provided for all the contracts provided grouping by liquid and non liquid staking
 * @param startUnixTimestamp defaults to 2024/01/01
 * @param contractIdArray defaults to all the contracts in the contracts array
 * @returns 
 */
export async function generateDelegatorTableDataSince(startUnixTimestamp: number = 1698807600 /*2023/11/01*/, endUnixTimestamp: number = Date.now(), contractIdArray: string[] = contracts): Promise<ENO[]> {
    const output = [] as ENO[]
    const delegatorsByEpochResponse = await getDelegatorsByEpoch()
    const delegatorsByEpochFiltered = delegatorsByEpochResponse.filter((epochData: DelegatorsByEpochResponse) => {
        const timestamp = Number(BigInt(epochData.timestamp) / BigInt(1e9))
        return endUnixTimestamp > timestamp && timestamp > startUnixTimestamp
    })
    for(const delegatorsByEpoch of delegatorsByEpochFiltered) {
        const epochId = delegatorsByEpoch.epoch_id
        for(const contractId of contractIdArray) {
            const delegators = await getDelegatorsForContractAndEpoch(contractId, epochId)
            
            let liquidStakingAmount = 0
            let nonLiquidStakingAmount = 0
            for(const delegator of delegators) {
                if(liquidStakingAccounts.includes(delegator.account_id)) {
                    liquidStakingAmount += Number(delegator.staked)
                } else {
                    nonLiquidStakingAmount += Number(delegator.staked)
                }
            }
            output.push({
                unix_timestamp: Number(BigInt(delegatorsByEpoch.timestamp) / BigInt(1e9)), // Convert from nano to seconds
                epoch_id: epochId,
                pool_id: contractId,
                non_liquid_stake: nonLiquidStakingAmount,
                liquid_stake: liquidStakingAmount,
            })
            await sleep(75)
        }
    }
    return output
}

/**
 * Generate all the table data from the timestamp provided for all the contracts provided, leaving big delegators by themselves, and grouping by small delegators (< 100k)
 * @param startUnixTimestamp defaults to 2024/01/01
 * @param contractIdArray defaults to all the contracts in the contracts array
 * @returns 
 */
export async function generateTableDataByDelegatorSince(startUnixTimestamp: number = 1698807600 /*2023/11/01*/, endUnixTimestamp: number = Date.now(), contractIdArray: string[] = contracts): Promise<ENODelegator[]> {
    const output = [] as ENODelegator[]
    const delegatorsByEpochResponse = await getDelegatorsByEpoch()
    const delegatorsByEpochFiltered = delegatorsByEpochResponse.filter((epochData: DelegatorsByEpochResponse) => {
        const timestamp = Number(BigInt(epochData.timestamp) / BigInt(1e9))
        return endUnixTimestamp > timestamp && timestamp > startUnixTimestamp
    })
    for(const delegatorsByEpoch of delegatorsByEpochFiltered) {
        const epochId = delegatorsByEpoch.epoch_id
        for(const contractId of contractIdArray) {
            const delegators = await getDelegatorsForContractAndEpoch(contractId, epochId)
            const delegatorsData: Record<string, number> = {}
            for(const delegator of delegators) {
                const stakedNumber = Number(delegator.staked)
                if(stakedNumber > 100000) {
                    delegatorsData[delegator.account_id] = stakedNumber
                } else {
                    if(!delegatorsData.hasOwnProperty("minor_delegators_sum")) {
                        delegatorsData["minor_delegators_sum"] = 0
                    }
                    delegatorsData["minor_delegators_sum"] += stakedNumber
                }
            }
            for(const [delegatorAccountId, stake] of Object.entries(delegatorsData)) {
                output.push({
                    unix_timestamp: Number(BigInt(delegatorsByEpoch.timestamp) / BigInt(1e9)), // Convert from nano to seconds
                    epoch_id: epochId,
                    pool_id: contractId,
                    account_id: delegatorAccountId,
                    stake
                })
            }
            await sleep(75)
        }
    }
    return output
}