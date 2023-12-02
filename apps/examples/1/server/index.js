const config = require('./config')
const app = require('./srv_app')

require('@alto-fw/http_server')({
    port: 8010,
    cors_client: config.cors_client,
    app:app
})