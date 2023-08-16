export type OnConflictArgs = {
    onConflictArgument: string,
    onConflictCondition: string
}

export function buildInsert(
    dbEngine: "pg" | "sq3",
    cmd: "insert" | "insert or replace",
    table: string,
    record: Record<string, any>,
    onConflict?: OnConflictArgs,
)
    : {
        statement: string,
        values: any[]
    } {
    let fields = [], placeholders = [], values = []
    let index = 1
    for (let key in record) {
        fields.push(key)
        if (dbEngine == "sq3") {
            placeholders.push("?")
        }
        else {
            placeholders.push("$" + index)
        }
        values.push(record[key])
        index++
    }
    let statement = `${cmd} into ${table}(${fields.join(",")}) values (${placeholders.join(",")})`
    if (onConflict) {
        let setFieldsFromExcludedList = fields.map(field => `${field}=EXCLUDED.${field}`)
        statement = statement +
            " ON CONFLICT "+ 
            onConflict.onConflictArgument +
            " DO UPDATE SET " + 
            setFieldsFromExcludedList.join(",") +
            " " + onConflict.onConflictCondition
    }
    return { statement, values }
}
