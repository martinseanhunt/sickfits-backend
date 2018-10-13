const jwt = require('jsonwebtoken')

// let's go!
const cookieParser = require('cookie-parser')
require('dotenv').config()

const createServer = require('./createServer')
const db = require('./db')

const server = createServer()

// Use express middleware to handle cookies(JWT)
server.express.use(cookieParser())

// Decode JWT and get user id on requests
server.express.use((req, res, next) => {
  const { token } = req.cookies
  if (token) {
    const { userId } = jwt.verify(token, process.env.APP_SECRET)
    req.userId = userId
  }
  next()
})

server.start({
  cors: {
    credentials: true, 
    origin: process.env.FRONTEND_URL
  }
}, result => console.log(`Server is running on port ${result.port}`))