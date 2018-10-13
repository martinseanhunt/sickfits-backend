// let's go!
const cookieParser = require('cookie-parser')
require('dotenv').config()

const createServer = require('./createServer')
const db = require('./db')

const server = createServer()

// Use express middleware to handle cookies(JWT)
server.express.use(cookieParser())

// TODO use express middleware to populate current user

server.start({
  cors: {
    credentials: true, 
    origin: process.env.FRONTEND_URL
  }
}, result => console.log(`Server is running on port ${result.port}`))