module.exports = function(query, params = {}) {

    const {TypedValues} = require('ydb-sdk')

    let declare = ''
    let query_params = {}

    Object.keys(params).forEach(param => {

        switch(typeof params[param]) {
            
            case 'boolean':

                declare = `
                    ${declare}
                    DECLARE \$${param} AS Bool;
                `
                query_params['$' + param] = TypedValues.bool(params[param])

                break

                case 'number':

                    if (Number.isInteger(params[param])) {

                        if (params[param] >= 0) {

                            declare = `
                                ${declare}
                                DECLARE \$${param} AS Uint64;
                            `
                            query_params['$' + param] = TypedValues.uint64(String(params[param]))
                        }

                        else {

                            declare = `
                                ${declare}
                                DECLARE \$${param} AS Int64;
                            `
                            query_params['$' + param] = TypedValues.int64(String(params[param]))
                        }
                    }

                    else {

                        declare = `
                            ${declare}
                            DECLARE \$${param} AS Double;
                        `
                        query_params['$' + param] = TypedValues.double(params[param])
                    }

                    break
                
                case 'bigint':
                
                if (params[param] >= 0) {

                    declare = `
                        ${declare}
                        DECLARE \$${param} AS Uint64;
                    `
                    query_params['$' + param] = TypedValues.uint64(String(params[param]))
                }
                else {

                    declare = `
                        ${declare}
                        DECLARE \$${param} AS Int64;
                    `
                    query_params['$' + param] = TypedValues.int64(String(params[param]))
                }
                break

            case 'string':
                
                declare = `
                    ${declare}
                    DECLARE \$${param} AS Utf8;
                `
                query_params['$' + param] = TypedValues.utf8(params[param])
                break

            case 'object':

                if (params[param] instanceof Date) {

                    declare = `
                        ${declare}
                        DECLARE \$${param} AS Timestamp;
                    `
                    query_params['$' + param] = TypedValues.timestamp(Number(params[param]))                    
                }
                else {
                 
                    declare = `
                        ${declare}
                        DECLARE \$${param} AS Json;
                    `
                    query_params['$' + param] = TypedValues.json(JSON.stringify(params[param]))
                }
                break

            default:
                throw new Error(`не обрабатываемый тип параметра ${param} ${typeof params[param]}`)
        }
    })
    
    return {query: declare + query, params: query_params}
}