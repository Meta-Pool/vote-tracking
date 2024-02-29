import * as near from "near-api-lite"

export type U128String = string;

let globalDryRunMode: boolean = false;
export function setGlobalDryRunMode(mode:boolean){
    globalDryRunMode = mode;
}
export function isDryRun(){
    return globalDryRunMode ;
}
//-----------------------------
// Base smart-contract proxy class
// provides constructor, view & call methods
// derive your specific contract proxy from this class
//-----------------------------
export class SmartContract {

    public dryRun = globalDryRunMode;
    public logLevel = 1;

    constructor(
        public contract_account: string,
        public signer?: string,
        public signer_private_key?: string,
    ) { }
    async view(method: string, args?: Record<string, any>) {
        return near.view(this.contract_account, method, args || {});
    }
    async call(method: string, args: Record<string, any>, TGas?: number, attachedYoctoNear?: string) {
        if (this.dryRun || this.logLevel > 0) {
            console.log(`${this.dryRun ? "DRY-RUN " : ""}near.call ${this.contract_account}.${method}(${JSON.stringify(args)}) attached:${near.yton(attachedYoctoNear || "0")}`)
        }
        if (!this.dryRun) {
            return near.call(this.contract_account, method, args, this.signer||"", this.signer_private_key||"", TGas || 200, attachedYoctoNear || "0");
        }
    }
}


