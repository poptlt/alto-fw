const { v4: uuidv4 } = require('uuid')

module.exports = function({data, app, cors_client}) {

    return async function(event, context) {

        let headers = {'Content-Type': 'application/json'}
        if (cors_client) headers = {
            ...headers,
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'x-xsrf-token, Origin, Content-Type, X-Auth-Token, Set-Cookie, Cookie, Access-Control-Allow-Headers, Access-Control-Allow-Origin',
            'Access-Control-Allow-Origin': cors_client,
        }
        
        if (!(event.httpMethod == 'OPTIONS' || event.httpMethod == 'POST')) {

            return {
                statusCode: 400,
                headers
            } 
        }

        if (event.httpMethod == 'POST') {

            if (!data.app) data.app = app(event, context)

            body = JSON.parse(event.body)

            let name = body.method
            let params = body.params
            let session = body.session ? body.session : uuidv4()
            let file = body.file

            try {

                let result = await data.app.ext(name, params, session, file)

                return {
                    statusCode: 200,
                    headers,
                    body: {...result, session}
                } 
            }
            catch(err) {

                console.log('Какая-то непредвиденная ошибка', err)
                return {
                    statusCode: 200,
                    headers,
                    body: {error: {code: 'SYSTEM', message: 'Системная ошибка'}, session}
                }                 
            }
        }
    
        else {
    
            return {
                statusCode: 200,
                headers
            }
        }         
    }
}