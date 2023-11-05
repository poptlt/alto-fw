async function exec_query({session, query, params, tx_meta, one_row = false, one_col = false}) {

    const {query: query_result, params: params_result} = require('./query_params')(query, params)

    let res = await (await session).executeQuery(query_result, params_result, await tx_meta)
    
    return require('./ydb_to_js')(res.resultSets.length ? res.resultSets[0] : [], one_row, one_col)
}

module.exports = class {

    constructor(dbName, auth) {

        const iamToken = require('./iamToken')(auth)
        let current_driver

        async function driver() {

            const token = await iamToken()

            if (current_driver) {

                const drv_token = (await current_driver).authService.token
                const drv_db = (await current_driver).database

                if (drv_token == token && drv_db == dbName) return current_driver
            }

            else {

                const {Driver, TokenAuthService} = require('ydb-sdk')

                const authService = new TokenAuthService(token, dbName)

                const driver = new Driver({
                    endpoint: 'grpcs://ydb.serverless.yandexcloud.net:2135', 
                    database: dbName, 
                    authService
                })

                if (!await driver.ready(10000)) throw new Error('не удалось создать драйвер YDB')

                current_driver = driver
                return driver
            }
        }    

        this.query = async function(query, params, one_row = false, one_col = false) {

            let result

            const drv = await driver()

            await drv.tableClient.withSessionRetry(async (session) => {
    
                result = await exec_query({session, query, params, one_row, one_col})
            })

            return result
        }

        this.tsn = async function() {

            let queries = []
            let closed = false

            let _resolve, _reject
            let data = new Promise((resolve, reject) => {

                _resolve = resolve
                _reject = reject
            })

            let c_resolve, c_reject

            const drv = await driver()

            drv.tableClient.withSessionRetry(async (session) => {

                const txMeta = await session.beginTransaction({serializableReadWrite: {}})

                _resolve({session, tx_meta: {txId: txMeta.id}})

                await new Promise((resolve, reject) => {
                    c_resolve = resolve
                    c_reject = reject
                })
            })

            const {session, tx_meta} = await data

            return {

                query: async (query, params, one_row = false, one_col = false) => {

                    if (closed) throw new Error('транзакция уже закрыта')

                    let res  
                    res = new Promise(async (resolve, reject) => {

                        let prima = queries.filter(item => item != res)
                        await Promise.all(prima)

                        let result
                        try {
    
                            result = await exec_query({
                                session, 
                                query, 
                                params, 
                                tx_meta, 
                                one_row, one_col
                            })
    
                            resolve(result)
                        }  
                        catch(err) { 
                            console.log({err})                    
                            reject(err) 
                        }                                              
                    })

                    queries.push(res)

                    return res 
                },

                commit: async () => {

                    if (closed) throw new Error('транзакция уже закрыта')
                    closed = true

                    await Promise.all(queries)
                    await session.commitTransaction(tx_meta)
                    c_resolve()
                },

                rollback: async () => {

                    if (closed) throw new Error('транзакция уже закрыта')
                    closed = true

                    await Promise.all(queries)
                    await session.rollbackTransaction(tx_meta)
                    c_resolve()
                }
            }
        }
    }
}