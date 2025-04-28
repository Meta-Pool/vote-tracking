import { isDryRun } from "../contracts/base-smart-contract";
import { ENO, ENODelegator, ValidatorStakeHistory } from "../util/tables";
import { sleep } from "../util/util";
import { DelegatorsByEpochResponse, getDelegatorEpochHistory, getDelegatorsByEpoch, getDelegatorsForContractAndEpoch, PikespeakValidatorEpochHistory } from "./pikespeakApi";

/* cSpell:disable */
const contracts = [
    "everstake.poolv1.near",
    "luganodes.pool.near",
    "dacmpool.poolv1.near",
    "staking4all.poolv1.near",
    "colossus.poolv1.near",
    "piertwopool.poolv1.near",
    "pairpoint.poolv1.near",
    "deutschetelekom.poolv1.near",
    "nttdata_dti.poolv1.near",
    "nansen.poolv1.near",
    "citadelone.poolv1.near",
    "chainbase.poolv1.near",
    "simplystaking.poolv1.near",
    "cryptocrew.poolv1.near",
    "crosnest.poolv1.near",
    "validblocks.poolv1.near",
    "dragonstake.poolv1.near",
    "caliber.poolv1.near",
    "originstake.poolv1.near",
    "stcbahrain.poolv1.near",
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
 * @param startUnixTimestamp defaults to 2023/11/01
 * @param contractIdArray defaults to all the contracts in the contracts array
 * @returns 
 */
export async function generateDelegatorTableDataSince(startUnixTimestamp: number = 1698807600 /*2023/11/01*/, endUnixTimestamp: number = Date.now(), contractIdArray: string[] = contracts): Promise<ENO[]> {
    if (isDryRun()) console.log("Getting ENOs liquidity data from", startUnixTimestamp, "to", endUnixTimestamp)
    const output = [] as ENO[]
    console.log("Getting delegators by epoch")
    const delegatorsByEpochResponse = await getDelegatorsByEpoch()
    const delegatorsByEpochFiltered = delegatorsByEpochResponse.filter((epochData: DelegatorsByEpochResponse) => {
        const timestamp = Number(BigInt(epochData.timestamp) / BigInt(1e9))
        return endUnixTimestamp > timestamp && timestamp > startUnixTimestamp
    })
    console.log("Delegators by epoch in period amount", delegatorsByEpochFiltered.length)
    for (const delegatorsByEpoch of delegatorsByEpochFiltered) {
        const epochId = delegatorsByEpoch.epoch_id
        if (isDryRun()) console.log("Getting data for epochId", epochId)
        for (const contractId of contractIdArray) {
            console.log("Getting delegators for contract", contractId, "and epoch", epochId)
            const delegators = await getDelegatorsForContractAndEpoch(contractId, epochId)
            console.log("Delegators for contract", contractId, "and epoch", epochId, "amount", delegators.length)
            let liquidStakingAmount = 0
            let nonLiquidStakingAmount = 0
            for (const delegator of delegators) {
                if (liquidStakingAccounts.includes(delegator.account_id)) {
                    liquidStakingAmount += Number(delegator.staked_amount)
                } else {
                    nonLiquidStakingAmount += Number(delegator.staked_amount)
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
 * @param startUnixTimestamp defaults to 2023/11/01
 * @param contractIdArray defaults to all the contracts in the contracts array
 * @returns 
 */
export async function generateTableDataByDelegatorSince(startUnixTimestamp: number = 1698807600 /*2023/11/01*/, endUnixTimestamp: number = Date.now(), contractIdArray: string[] = contracts): Promise<ENODelegator[]> {
    if (isDryRun()) console.log("Getting ENOs liquidity data by delegator from", startUnixTimestamp, "to", endUnixTimestamp)
    const output = [] as ENODelegator[]
    const delegatorsByEpochResponse = await getDelegatorsByEpoch()
    const delegatorsByEpochFiltered = delegatorsByEpochResponse.filter((epochData: DelegatorsByEpochResponse) => {
        const timestamp = Number(BigInt(epochData.timestamp) / BigInt(1e9))
        return endUnixTimestamp > timestamp && timestamp > startUnixTimestamp
    })
    for (const delegatorsByEpoch of delegatorsByEpochFiltered) {
        const epochId = delegatorsByEpoch.epoch_id
        if (isDryRun()) console.log("Getting data for epochId", epochId)
        for (const contractId of contractIdArray) {
            const delegators = await getDelegatorsForContractAndEpoch(contractId, epochId)
            const delegatorsData: Record<string, number> = {}
            for (const delegator of delegators) {
                const stakedNumber = Number(delegator.staked_amount)
                if (stakedNumber > 100000) {
                    delegatorsData[delegator.account_id] = stakedNumber
                } else {
                    if (!delegatorsData.hasOwnProperty("minor_delegators_sum")) {
                        delegatorsData["minor_delegators_sum"] = 0
                    }
                    delegatorsData["minor_delegators_sum"] += stakedNumber
                }
            }
            for (const [delegatorAccountId, stake] of Object.entries(delegatorsData)) {
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

async function getValidatorStakeHistorySince(startUnixTimestamp: number = 1698807600 /*2023/11/01*/, endUnixTimestamp: number = Date.now(), contractId: string) {
    const validatorByEpochResponse = await getDelegatorEpochHistory(contractId)
    const validatorByEpochFilteredAndMapped: ValidatorStakeHistory[] = validatorByEpochResponse.filter((epochData: PikespeakValidatorEpochHistory) => {
        const timestamp = Number(BigInt(epochData.timestamp) / BigInt(1e9))
        return endUnixTimestamp > timestamp && timestamp > startUnixTimestamp
    }).map((v: PikespeakValidatorEpochHistory, index: number, arr: PikespeakValidatorEpochHistory[]) => {
        let projectedApyBp = 0
        if (index > 0) {
            const previousEpoch = arr[index - 1]
            const previousTimestamp = Number(BigInt(previousEpoch.timestamp) / BigInt(1e9))
            const currentTimestamp = Number(BigInt(v.timestamp) / BigInt(1e9))
            const secondsDelta = (currentTimestamp - previousTimestamp)
            const periods = 365 * 24 * 60 * 60 / secondsDelta
            console.log(Number(v.total_staked_balance), Number(v.reward_amount), periods)
            const base = (Number(v.total_staked_balance) + Number(v.reward_amount)) / Number(v.total_staked_balance)
            const projectedApy = ((base) ** periods - 1) * 100
            console.log("Projected", projectedApy)
            projectedApyBp = Math.floor(projectedApy * 100)
        }
        return {
            unix_timestamp: Number(BigInt(v.timestamp) / BigInt(1e9)), // Convert from nano to seconds
            epoch_id: v.epoch_id,
            pool_id: contractId,
            stake: Number(v.total_staked_balance),
            reward_amount: Number(v.reward_amount),
            projected_apy_bp: projectedApyBp,
        }
    })

    return validatorByEpochFilteredAndMapped
}

export async function getValidatorArrayStakeHistorySince(startUnixTimestamp: number = 1698807600 /*2023/11/01*/, endUnixTimestamp: number = Date.now(), contractIdArray: string[] = contracts) {
    const output = [] as ValidatorStakeHistory[]
    for (const contractId of contractIdArray) {
        const validatorByEpochFilteredAndMapped = await getValidatorStakeHistorySince(startUnixTimestamp, endUnixTimestamp, contractId)
        output.push(...validatorByEpochFilteredAndMapped)
    }
    return output
}