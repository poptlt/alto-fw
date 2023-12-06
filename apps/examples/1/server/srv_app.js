const app = require('@alto-fw/app')

app.add('test', async function(ctx, a, b) { 

    let num = Math.random()
    console.log({num})
    if (num > 0.5) throw new Error('Случайная ошибка!')
    else return {ctx, a, b} 
})

const arithmetic = require('./arithmetic')
app.add('arithmetic', arithmetic)

module.exports = app