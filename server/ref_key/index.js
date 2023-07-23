function ref_type(ref) { return ref.substring(0, ref.length - 37) }

module.exports = function({app, ydb, with_auth = false}) {

    const tables = {}
    const keys = {}

    const ref_key = {

        table: function(type, table) {
            
            let tbl = tables[type]
            if (tbl) throw new Error(`Таблица для типа ссылок ${type} уже определена`)

            tables[type] = table
        },

        key: function(type, key, query) {

            if (!keys[type]) keys[type] = {}

            let k = keys[type][key]
            if (k) throw new Error(`Функция ключа ${key} для типа ссылок ${type} уже определена`)

            keys[type][key] = query
        }
    }

    app.add('ref_key', async function(ctx, data) {

        const q = ydb.query

        let [user, is_developer] = [undefined, false]
        if (with_auth) {
            user = await app.auth.current_user(ctx)
            is_developer = await app.auth.is_developer(ctx)
        }

        let result = {}

        let from_query = {}
        let from_table = {}

        while (data.length) {

            let cur = data.shift()

            let ref = cur.ref
            let type = ref_type(ref)
            let key = cur.key

            if (is_developer) {

                if (!result[ref]) result[ref] = {}
                result[ref].access = true
            }

            else {

                if (!from_query[type]) from_query[type] = {} 
                if (!from_query[type].access) from_query[type].access = []
                from_query[type].access.push(ref)
            }

            if (keys[type] && keys[type][key]) {

                if (!from_query[type]) from_query[type] = {}
                if (!from_query[type][key]) from_query[type][key] = []
                from_query[type][key].push(ref)
            }

            else if (tables[type]) {

                if (!from_table[type]) from_table[type] = {keys: new Set, refs: new Set}
                from_table[type].refs.add(ref)
                from_table[type].keys.add(key)
            }

            else {}
        }

        let proms = []

        Object.keys(from_query).forEach(async type => {

            if (keys[type]) {

                Object.keys(from_query[type]).forEach(async key => {

                    let query = keys[type][key]  
                    
                    if (query) {

                        let ref_list = [...from_query[type][key]]

                        proms.push(new Promise(async (resolve) => {

                            let res, query_str, out, undef

                            if (typeof query == 'function') res = await query(ctx, ref_list)

                            else if (typeof query == 'string') query_str = query

                            else if (typeof query == 'object' && query.query) {

                                query_str = query.query
                                if (query.out) out = query.out
                                if (query.undef) undef = query.undef
                            }
                            
                            else throw {code: 'SYSTEM', message: 'так не бывает'}

                            if (query_str) {

                                res = await q(`
                                
                                    $refs = Unicode::SplitToList($refs_str, ",");
                                    ${query_str}
                                `, {user, refs_str: ref_list.join(',')})
                            }

                            if (undef) ref_list.forEach(ref => {

                                if (!result[ref]) result[ref] = {}
                                result[ref][key] = undef
                            })

                            res.forEach(line => {
                                if (!result[line.ref]) result[line.ref] = {}
                                result[line.ref][key] = out ? out(line[key]) : line[key]
                                if (key == 'access') result[line.ref][key] = !!result[line.ref][key]
                            })

                            resolve(1)
                        }))
                    }
                })
            }
        })

        await Promise.all(proms)

        proms = []

        Object.keys(from_table).forEach(async type => {

            let table = tables[type]
            let ref_list = [...from_table[type].refs]
            let key_list = [...from_table[type].keys]

            let keys_str = key_list.join(', ')

            proms.push(new Promise(async (resolve) => {

                res = await q(`

                    $refs = Unicode::SplitToList($refs_str, ",");

                    SELECT ref, ${keys_str} 
                        FROM ${table} 
                        WHERE ref IN $refs;
                `, {refs_str: ref_list.join(',')})

                res.forEach(line => {
                    if (!result[line.ref]) result[line.ref] = {}
                    key_list.forEach(key => {
                        if (!result[line.ref][key]) result[line.ref][key] = line[key]
                    })
                })

                resolve(1)
            }))
        })

        await Promise.all(proms)

        if (!is_developer) {

            let refs = Object.keys(result)

            refs.forEach(ref => {

                if (!result[ref].access) result[ref] = {access: false}
            })
        }

        return result
    })

    return ref_key
}