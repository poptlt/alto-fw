module.exports = function({app, ydb, ref_key, bucket, accessKeyId, secretAccessKey}) {

    const objs = new Proxy(
        {}, {
    
            get(target, key) {
    
                if (!target[key]) {
    
                    if (['S3Client', 'GetObjectCommand', 'PutObjectCommand', 'HeadObjectCommand'].includes(key))
                        target[key] = require('@aws-sdk/client-s3')[key]
    
                    else if (key == 'getSignedUrl') target[key] = require('@aws-sdk/s3-request-presigner')[key]
    
                    else if (key == 'mime') target[key] = require('mime-types')
    
                    else if (key == 'uuidv4') target[key] = require('uuid').v4

                    else if (key =='s3Client') target[key] = new objs.S3Client({

                        region: 'ru-central1', 
                        endpoint: 'https://storage.yandexcloud.net', 
                        credentials: {
                            accessKeyId,
                            secretAccessKey
                        } 
                    })  
                }
    
                return target[key]
            }
        }
    )
    
    function new_ref(type) { return `${type}_${objs.uuidv4().split('-').join('_')}` }

    async function file_exists(name) {

        let command = new objs.HeadObjectCommand({
            Bucket: bucket,
            Key: name,
        })

        try { 
            
            await objs.s3Client.send(command) 
            return true
        }
        catch(err) { 

            if (err.name == 'NotFound') return false
            else throw {code: 'SYSTEM', message: 'Какая-то непредвиденная ошибка при определении существования файла в S3'}
        }
    }

    async function file_data(ref) {

        return ydb.query(`
            SELECT * FROM files WHERE ref = $ref
        `, {ref}, 1, 0)
    }

    async function file_url(ref) {

        let data = await file_data(ref)
        if (!data) return undefined

        let name = data.ext ? `${ref}.${data.ext}` : ref
        if (!await file_exists(name)) return undefined

        command = new objs.GetObjectCommand({
            Bucket: bucket,
            Key: name,
        })

        return objs.getSignedUrl(objs.s3Client, command, { expiresIn: 60 * 60 * 24 })
    }

    async function put_file(ctx) {

        let file = ctx.file
        if (!file) throw {code: 'SYSTEM', message: 'А где записываемый файл?'}

        const ref = new_ref('file')
        const user = await app.auth.current_user(ctx)

        if (!user) throw {code: 'SYSTEM', message: 'Не определен пользователь - автор записи файла'}

        let ext = null
        if (file.name) {

            let arr = file.name.split('.')
            if (arr.length > 1) ext = arr.at(-1)
        }
        else if (file.type) ext = objs.mime.extension(file.type) 
        
        const command = new objs.PutObjectCommand({ 
            Bucket: bucket, 
            Key: ext ? `${ref}.${ext}` : ref,
        })

        const url = await objs.getSignedUrl(objs.s3Client, command, { expiresIn: 10 })  
        
        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()

        await tsn.query(`

            INSERT INTO files(ref, user, date, data, ext)
            VALUES($ref, $user, CurrentUtcDatetime(), CAST($file AS JsonDocument), $ext)
        `, {ref, user, file, ext})

        if (!ctx.tsn) await tsn.commit()

        ctx.put_url = url
        return ref
    }

    if (ref_key) {

        ref_key.table('file', 'files')

        ref_key.key('file', 'access', async function(ctx, list) {
            return list.map(ref => ({ref, access: true}))
        })

        ref_key.key('file', 'url', async function(ctx, list) {
            return await Promise.all(list.map(async ref => ({ref, url: await file_url(ref)})))
        })
    }

    return {file_exists, file_data, file_url, put_file}
}