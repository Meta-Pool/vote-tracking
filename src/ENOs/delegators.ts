import { isDryRun } from "../contracts/base-smart-contract";
import { ENO, ENODelegator, ValidatorStakeHistory } from "../util/tables";
import { sleep } from "../util/util";
import { DelegatorsByEpochResponse, getDelegatorEpochHistory, getDelegatorsByEpoch, getDelegatorsForContractAndEpochWithRetryOrThrow, PikespeakValidatorEpochHistory } from "./pikespeakApi";

const enosContracts = [
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
]

const pnosContracts = [
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

const stakeWars3Contracts = [
    'rockxv2.poolv1.near',
    'swissstar.poolv1.near',
    'stingray.poolv1.near',
    'spectrum.poolv1.near',
    'shurik.poolv1.near',
    'jilina.poolv1.near',
    'sazhiv.poolv1.near',
    'ruziev.poolv1.near',
    'p2pstaking.poolv1.near',
    'ignor.poolv1.near',
    'idtcn4.poolv1.near',
    'gateomega.poolv1.near',
    'davaymne.poolv1.near',
    'blntmain.poolv1.near',
    'beobeo.poolv1.near',
    // 'annanow.poolv1.near', commented since it is down since 2024, but me be back up
    'abahmane.poolv1.near',
    'nearuaguild.poolv1.near',
    'minion.poolv1.near',
    'solidstate.poolv1.near',
    'apm.poolv1.near',
    'wackazong.poolv1.near',
    'upgold.poolv1.near',
    'trdm.poolv1.near',
    'neardevvn.poolv1.near',
    'n_shoko.poolv1.near',
    'interstakeone.poolv1.near',
    'ibsblock.poolv1.near',
    'iamoskvin.poolv1.near',
    'gritsly.poolv1.near',
    'encipher.poolv1.near',
    'nodeverse_2.poolv1.near',
    'mexa-staking.poolv1.near',
    '2pilot.poolv1.near',
    'iamcryptobro.poolv1.near',
    'shardlabs.poolv1.near',
    'readylayerone_staking.poolv1.near',
    'nearkoreahub.poolv1.near',
    'hapi.poolv1.near',
    'owa.poolv1.near',
]

/* cSpell:disable */
const contracts = [
    ...enosContracts,
    ...pnosContracts,
    ...stakeWars3Contracts,    
]
/* cSpell:enable */

const liquidStakingAccounts = [
    "meta-pool.near",
    "linear-protocol.near",
    "lst.rhealab.near",
]

export function getENOsContracts() {
    return contracts
}

export function getDelegatorGroupContracts(delegatorGroup: string) {
    switch(delegatorGroup) {
        case "eno":
            return enosContracts
        case "pno": 
            return pnosContracts
        case "stakeWars3":
            return stakeWars3Contracts
    }
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
            const delegators = await getDelegatorsForContractAndEpochWithRetryOrThrow(contractId, epochId)
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
            const delegators = await getDelegatorsForContractAndEpochWithRetryOrThrow(contractId, epochId)
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
            const previousStake = Number(previousEpoch.total_staked_balance)
            console.log(previousStake, Number(v.reward_amount), periods)
            const base = (previousStake + Number(v.reward_amount)) / previousStake
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
        await sleep(1000) // pikespeak api rate limit
        output.push(...validatorByEpochFilteredAndMapped)
    }
    return output
}