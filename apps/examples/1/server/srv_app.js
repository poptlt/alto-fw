const app = require('@alto-fw/app')

app.add('test', async function(ctx, a, b) { return {ctx, a, b} })

const arithmetic = require('./arithmetic')
app.add('arithmetic', arithmetic)

module.exports = app