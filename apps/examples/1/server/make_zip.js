const AdmZip = require('adm-zip')

const file = new AdmZip()

file.addLocalFile('./yc_func.js')
file.addLocalFile('./srv_app.js')
file.addLocalFile('./arithmetic.js')
file.addLocalFile('./config.js')
file.addLocalFile('./package.json')

file.writeZip('for_ycf.zip')