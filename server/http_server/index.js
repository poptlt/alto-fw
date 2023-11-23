const http = require("http")
const { v4: uuidv4 } = require('uuid')

module.exports = function http_server({port, cors_client, app}) {

    const server = http.createServer( async (req, res) => {

        let headers = {'Content-Type': 'application/json'}
        if (cors_client) headers = {
            ...headers,
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'x-xsrf-token, Origin, Content-Type, X-Auth-Token, Set-Cookie, Cookie, Access-Control-Allow-Headers, Access-Control-Allow-Origin',
            'Access-Control-Allow-Origin': cors_client,
        }
        
        if (!(req.method == 'OPTIONS' || req.method == 'POST')) {
            res.writeHead(400, headers)                 
            res.end()
        }

        if (req.method == 'POST') {

            let data = ''

            req.on('data', chunk => data += chunk)

            req.on('end', async () => {

                data = JSON.parse(data)

                let name = data.method
                let params = data.params
                let session = data.session ? data.session : uuidv4()
                let file = data.file

                try {

                    let result = await app.ext(name, params, session, file)
                    res.writeHead(200, headers) 
                    res.end(JSON.stringify({...result, session})) 
                }
                catch(err) {

                    console.log('Какая-то непредвиденная ошибка')
                    console.log('err', err)
                    res.writeHead(200, headers) 
                    res.end(JSON.stringify({error: {code: 'SYSTEM', message: 'Системная ошибка'}, session})) 
                }
            })
        }

        else {

            res.writeHead(200, headers)                 
            res.end()
        } 
    })

    server.listen(port)

    console.log(`Локальный сервер запущен на http://localhost:${port}`)
    if (cors_client) console.log(`Запросы для отладки ожидаются с url ${cors_client}`) 
}