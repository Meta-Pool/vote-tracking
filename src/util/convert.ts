/**
 * returns mpDao amount as number with decimals 
 * @param raw amount expressed in mpDao without decimal point
 */
export function toNumber(raw: string | BigInt, decimals: number) {
    let mpdaoRawString = raw.toString()
    if (mpdaoRawString.indexOf(".") !== -1) throw new Error("a mpdaoRaw value can't have a decimal point: " + mpdaoRawString)
    let sign = ""
    if (mpdaoRawString.startsWith("-")) {
        sign = "-"
        mpdaoRawString = mpdaoRawString.slice(1)
    }
    const padded = mpdaoRawString.padStart(decimals + 1, "0") // so it ends at least 0.xxx
    const mpDao = padded.slice(0, -decimals) + "." + padded.slice(-decimals)
    return Number(sign + mpDao)
}

/**
 * returns mpDao amount as number with decimals 
 * @param mpdaoRaw amount expressed in mpDao without decimal point
 */
export function mpdao_as_number(mpdaoRaw: string | BigInt) {
    return toNumber(mpdaoRaw,6)
}

export function addCommas(str: string) {
    let pre;
    if (str.startsWith("-")) {
        str = str.slice(1);
        pre = "-";
    }
    else {
        pre = "";
    }
    const decPointPosition = str.indexOf(".")
    let n = (decPointPosition == -1 ? str.length : decPointPosition ) - 4
    while (n >= 0) {
        str = str.slice(0, n + 1) + "," + str.slice(n + 1)
        n = n - 3
    }
    return pre + str;
}
