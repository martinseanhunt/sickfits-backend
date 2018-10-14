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

// THe problem with this approach is that if someone got hold of 
// someones token, it would be valid until the token expires from time limit

/* here's a notes from stack overflow that are worth looking in to:
  You could store the JWT in the db but you lose some of the benefits of a JWT. The JWT gives you the advantage of not needing to check the token in a db every time since you can just use cryptography to verify that the token is legitimate. If you have to look up the token in the db, you might as well just use an opaque token that doesn't carry information with it and let the server and database provide you with the information. On the other hand, if you're going to store a token in the db, I don't think a JWT is a bad choice for your token type. As you say, there are advantages for revocation if you store your token in the db. It all depends on what you want to achieve (faster authorization, etc. vs ability to revoke on demand).

  You can still use JWT with OAuth2 without storing tokens in the db if you want. JWTs have a configurable expiry time that you can set--after which they are invalid. Access Tokens (whether JWT or not) should usually be short-lived for security. If the concern is someone's phone being stolen and access tokens being obtained, I think the solution is to have those tokens expire quickly (30 mins?). If you're using oauth2, the means of stopping someone from continuing to use the app is for the real owner to de-authorize the mobile app client on the authorization server so that no more access tokens will be given out.

  You can set expiration date (for mobile 1 week). Add some custom field refreshId for user (you can use uuid for this). Next set Issued at claims parameter ("iat"). Store refreshId into db and set it as claims parameter . Then every time when you validate token you should check the token's "age". If it older than one hour you should load data from DB and check refreshId value and create new token with current "iat" value and send it to mobile device. When you need to deactivate tokens just generate new value for refreshId in db. After one hour all tokens will be incorrect, so user will need to login on every device again. You can make more custom solution if you need to.
*/
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