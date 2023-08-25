import request from '@alto-fw/request'

export default {

    install: (Vue, {url, auth_only, on_message, on_error}) => {

        const req = request(url)

        const alto = {

            async login() {

                let yandex_url = await req({method: 'auth.yandex_oauth2_url'})
                if (yandex_url.result) window.location = yandex_url.result                
            },

            async logout() {

                let res = await req({method: 'auth.logout', params: []})
                window.location.reload()
            }
        }

        Vue.mixin({

            async created() {

                if (!this.$parent) {

                    let url = new URL(window.location.href)

                    const invito = url.searchParams.get('invito')
                    
                    if (invito) {

                        let res = await req({method: 'auth.apply_invito', params: [invito]})
                        if (on_message) on_message(res.result)
                        else console.log(res.result)

                        if (res.error) {
                            if (on_error) on_error(res.error)
                            else console.log('error', res.error)
                        }

                        else {

                            url.searchParams.delete('invito')
                            window.history.replaceState(null, null, url)       
                        }
                    }

                    if (url.searchParams.get('from_yandex_auth')) {
                
                        let code = url.searchParams.get('code')
                
                        let res = await req({method: 'auth.yandex_oauth2_login', params: [code]})
                        if (on_message) {
                            if (Array.isArray(res.result)) res.result.forEach(item => on_message(item))    
                            else on_message(res.result)
                        }
                        else console.log(res.result)

                        if (res.error) {
                            if (on_error) on_error(res.error)
                            else console.log('error', res.error)
                        }
                        else {
                            url.searchParams.delete('from_yandex_auth')
                            url.searchParams.delete('code')
                            window.history.replaceState(null, null, url)
                            window.location.reload()
                        }
                    }

                    else {

                        let is_authorised = await req({method: 'auth.is_authorised'})
                        
                        if (is_authorised.result === false && auth_only) alto.login()
                    }


                }
            },

            data() {

                return {
                    alto,
                }
            },
        })
    }

}
