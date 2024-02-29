/**
 * returns mpDao amount as number with decimals 
 * @param mpdaoRawString amount expressed in mpDao without decimal point
 */
export function mpdao_as_number(mpdaoRawString: string) {
    if (mpdaoRawString.indexOf(".") !== -1) throw new Error("a mpdaoRawString can't have a decimal point: " + mpdaoRawString)
    let sign = ""
    if (mpdaoRawString.startsWith("-")) {
        sign = "-"
        mpdaoRawString = mpdaoRawString.slice(1)
    }
    const precision = 18
    const decimals = 6
    const padded = mpdaoRawString.padStart(precision, "0") // at least precision digits
    const mpDao = padded.slice(0, -decimals) + "." + padded.slice(-precision)
    return Number(sign + mpDao)
}
