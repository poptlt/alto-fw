
let current

async function sa_iamToken({serviceAccountId, keyId, key}) {

    const jose = require('node-jose')
    const fetch = require('node-fetch2')

    return new Promise(async (resolve, reject) => {

        const now = Math.floor(new Date().getTime() / 1000)
    
        const payload = { 
            aud: "https://iam.api.cloud.yandex.net/iam/v1/tokens",
            iss: serviceAccountId,
            iat: now,
            exp: now + 3600
        } 

        let answer
        try {

            const JWT = await jose.JWS.createSign({ format: 'compact' }, await jose.JWK.asKey(key, 'pem', { kid: keyId, alg: 'PS256' }))
                .update(JSON.stringify(payload))
                .final()
        
            answer = await fetch('https://iam.api.cloud.yandex.net/iam/v1/tokens', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: `{"jwt": "${JWT}"}`
            })
        }
        catch(err) { reject({code: 'SYSTEM', message: 'Не удалось получить IAM токен для сервисного аккаунта'}) }
        
        resolve(await answer.json())
    })
}

async function token_text(token) {

    return new Promise(async (resolve) => { resolve((await token).iamToken) })
}

module.exports = function({iamToken, serviceAccount}) {

    return async function() {

        if (iamToken) return iamToken
        
        else {

            if (current) {

                const diff = new Date((await current).expiresAt) - Date.now()
                if (diff > 60*1000) return token_text(current)
            }

            current = sa_iamToken(serviceAccount)
            return token_text(current)            
        }
    }
}