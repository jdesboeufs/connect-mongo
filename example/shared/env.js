const fs = require('node:fs')
const path = require('node:path')
const dotenv = require('dotenv')

const envPath = path.resolve(__dirname, '../.env')

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}
