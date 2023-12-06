const handlers = {

    async addition(ctx, a, b) { return a + b },
    async subtraction(ctx, a, b) { return a - b },
    async multiplication(ctx, a, b) { return a * b },
    async division(ctx, a, b) { 
    
        if (b == 0) throw 'На ноль делить нельзя!'
        return a /b 
    }
}

module.exports = async function(ctx) {

    let method = ctx.method
    ctx.method = undefined
    let handler = handlers[method]
    if (!handler) throw `SYSTEM:::У модуля arithmetic нет функции ${method}`

    return handler(...arguments)
}