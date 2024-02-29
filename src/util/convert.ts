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

