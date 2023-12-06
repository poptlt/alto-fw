const config = require('./config')
const handler = require('@alto-fw/yc-func')
const data = {}
const app = require('./srv_app')

module.exports.handler = handler({
    data, 
    app: (context) => { return app }, 
    cors_client: config.cors_client
})