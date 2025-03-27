export const SECONDS = 1000;
export const MINUTES = 60 * SECONDS;
export const HOURS = 60 * MINUTES;
export const DAYS = 24 * HOURS;

export function ISODateTrunc(date: Date): string {
    return date.toISOString().slice(0, 10)
}

// Note: assumes ISOTrunc means noon of that day
export function ISOTruncDateToDate(isoTruncDate: String): Date {
    // using 12:00 makes sure that's the same day and month indicated in the string,
    // when you use .toLocaleString() if this web server has a localeString TZ between GMT-12 and GMT+12
    return new Date(isoTruncDate + "T12:00:00Z")
}

export function addMonths(date: Date, deltaMonths: number): Date {
    // new Date expects local time
    let newDate = date;
    let day = newDate.getDate();

    // Set the new month, adding or subtracting deltaMonths
    newDate.setUTCMonth(newDate.getUTCMonth() + deltaMonths);

    // If the day in the new month doesn't match the original day (due to fewer days in the month),
    // adjust to the last day of the new month
    if (newDate.getDate() !== day) {
        newDate.setDate(0); // 0 will take you to the last day of the previous month, which is now the new month
    }

    return newDate;
}

export function addDays(date: Date, deltaDays: number): Date {
    let result = new Date(date); // Create a new Date object copy
    //result.setUTCDate(result.getUTCDate() + deltaDays); // Add days to the copy
    result.setUTCDate(result.getUTCDate() + deltaDays); // Add days to the copy
    return result;
}

export function addHours(date: Date, deltaHours: number): Date {
    let result = date
    // right way to add hours in javascript
    result.setUTCHours(date.getUTCHours() + deltaHours)
    return result
}

export function dateDeltaDays(deltaDays: number): Date {
    return addDays(new Date(), deltaDays)
}

export function getFirstDayThisMonth(): Date {
    const today = new Date()
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
}
export function getFirstDayLastMonth(): Date {
    const today = new Date()
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
}
export function getFirstDayNextMonth(): Date {
    const today = new Date()
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
}

// now +/- a delta, toISOString()
export function dateISONowPlus(deltaMs: number): string {
    return new Date(Date.now() + deltaMs).toISOString()
}
export function dateISONowMinus(deltaMs: number): string {
    return dateISONowPlus(-deltaMs)
}

export function hsElapsedSince(date: Date): string {
    return ((Date.now() - date.getTime()) / HOURS).toFixed(1)
}

export function minutesElapsedSince(date: Date): string {
    return ((Date.now() - date.getTime()) / MINUTES).toFixed()
}

export function elapsedSince(date: Date): string {
    let elapsedMs = Date.now() - date.getTime()
    if (elapsedMs < HOURS) {
        return (elapsedMs / MINUTES).toFixed() + "m"
    }
    else {
        return (elapsedMs / HOURS).toFixed(1) + "h"
    }
}//time in ms

