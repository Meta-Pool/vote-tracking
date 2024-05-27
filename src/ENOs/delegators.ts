import { ENO } from "../util/tables";
import { DelegatorsByEpochResponse, getDelegatorsByEpoch, getDelegatorsForContractAndEpoch } from "./api";

/* cSpell:disable */
const contracts = [
    "everstake.poolv1.near",
    "luganodes.pool.near",
    "dacmpool.poolv1.near",
    "stakecito.poolv1.near",
    "frensvalidator.poolv1.near",
    "grassets.poolv1.near",
    "centurion.poolv1.near",
    "piertwopool.poolv1.near",
    "vodafonedab.poolv1.near",
    "staking4all.poolv1.near",
    // "nttdata",
]
/* cSpell:enable */

const liquidStakingAccounts = [
    "meta-pool.near",
    "linear-protocol.near",
]

export async function generateDelegatorTableDataFromTimestampToNow(startUnixTimestamp: number = 0): Promise<ENO[]> {
    const output = [] as ENO[]
    const delegatorsByEpoch = await getDelegatorsByEpoch()
    const delegatorsByEpochFiltered = delegatorsByEpoch.filter((epochData: DelegatorsByEpochResponse) => {
        // 1716810036
        return Number(BigInt(epochData.timestamp) / BigInt(1e9)) > startUnixTimestamp
    })
    for(const delegatorsByEpoch of delegatorsByEpochFiltered) {
        const epochId = delegatorsByEpoch.epoch_id
        for(const contractId of contracts) {
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
                epochId,
                poolId: contractId,
                nonLiquidStake: nonLiquidStakingAmount,
                liquidStake: liquidStakingAmount,
            })
        }
    }
    return output
}