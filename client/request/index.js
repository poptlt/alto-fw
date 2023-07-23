const { default: Axios } = require('axios')

export default function request(url) {

    return function({method, params = [], file, timeout}) {

        timeout = timeout ? timeout : 10000

        if (!Array.isArray(params)) params = [params]

        return new Promise(async function(resolve) {

            try {

                const res = await Axios({
                    method: 'post',
                    url,
                    timeout,
                    data: JSON.stringify({
                        method, 
                        params, 
                        file: file == undefined ? undefined : {name: file.name, type: file.type, size: file.size}, 
                        session: localStorage.session_alto
                    }),
                    headers: {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                })

                if (res.data.session && localStorage.session_alto != res.data.session) localStorage.session_alto = res.data.session

                if (res.data.error) resolve({error: res.data.error})

                if (file) {

                    try {

                        await Axios({
                            method: 'put',
                            url: res.data.result,
                            data: file,
                            contentType: 'application/octet-stream',
                        })

                        resolve( {result: undefined} )
                    }

                    catch(err) {

                        let error = (err.code === 'ECONNABORTED') ? 
                            {code: 'TIMEOUT', message: 'Не удалось дождаться ответа от сервера'} : 
                            {code: 'S3_ERROR', message: 'Ошибка записи файла'}
                        
                        resolve({error})
                    }
                }

                else resolve( {result: res.data.result} )
            }
            
            catch(err) {
                 
                let error = (err.code === 'ECONNABORTED') ? 
                    {code: 'TIMEOUT', message: 'Не удалось дождаться ответа от сервера'} : 
                    {code: 'NETWORK_ERROR', message: 'Отсутствует соединение'}

                resolve({error})
            }       
        })
    }
} 