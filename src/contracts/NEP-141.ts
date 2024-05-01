import { SmartContract } from './base-smart-contract.js';

type U128String = string;

//JSON compatible struct ft_metadata
export type FungibleTokenMetadata = {
    spec: string;
    name: string;
    symbol: string;
    icon: string | null;
    reference: string | null;
    reference_hash: string | null;
    decimals: number;
}

export const STANDARD_NEP141_STORAGE_COST_YOCTOS = "1250000000000000000000" // 125e19, ONE_NEAR/1e5 * 125
export class Nep141 extends SmartContract {

    async ft_total_supply(): Promise<U128String> {
        return this.view("ft_total_supply")
    }

    async ft_metadata(): Promise<FungibleTokenMetadata> {
        return this.view("ft_metadata");
    }

    async storage_balance_of(accountId: string): Promise<any> {
        return this.view("storage_balance_of", { account_id: accountId })
    }

    async storage_deposit(accountId: string, yoctos: string = STANDARD_NEP141_STORAGE_COST_YOCTOS): Promise<any> {
        return this.call("storage_deposit", { account_id: accountId }, undefined, yoctos)
    }

    async ft_transfer(receiver_id: string, units: string|bigint, memo?: string): Promise<void> {
        return this.call("ft_transfer", { receiver_id: receiver_id, amount: units.toString(), memo: memo }, 50, "1"); //one-yocto attached
    }

    ft_balance_of(account_id: string): Promise<U128String> {
        return this.view("ft_balance_of", { account_id: account_id })
    }

    // signer_balance(): Promise<U128String> {
    //     if (!this.signer) throw new Error("No signer defined")
    //     return this.view("ft_balance_of", { account_id: this.signer?.getAccountId() })
    // }

    ft_transfer_call(receiver_contract_account_id: string, amountUnits: string|bigint, msg: string, memo?: string): Promise<string> {
        return this.call("ft_transfer_call", {
            receiver_id: receiver_contract_account_id,
            amount: amountUnits.toString(),
            memo,
            msg
        }, 290, "1"); //one-yocto attached
    }
}

