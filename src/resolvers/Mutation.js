const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')

const {transport, makeNiceEmail} = require('../mail')

const cookieSettings = {
  // Stops JS applications from being able to read the cookie / JWT content
  // Otherwise A rogue chrome plugin etc could grab the JWT and then 
  // authenticate as you until the token expires
  httpOnly: true, 
  maxAge: 1000 * 60 * 60 *24 * 365, // 1 year cookie
}

const Mutations = {
  // DON'T PASS INFO IF YOU WANT ALL THE DETAILS BACK FROM THE DATABASE
  // TO USE SOLELY ON  THE SERVER

  async createItem(parent, args, ctx, info) {
    // Check if they are logged in!
    if(!ctx.request.userId) throw new Error('You need to be logged in to do that')

    /// We could just return the function and Yoga knows to wait before returning
    // but it can help to store the result first if you need to console.log etc
    const item = await ctx.db.mutation.createItem({
      data: {
        ...args,
        user: {
          connect: { id: ctx.request.userId } // connects to User item via ID, can use any unique identifier
        }
      }
    }, info) // info is passed as a second argument because it contains our request detauils which specify what gets returned from the server

    return item
  },

  async updateItem(parent, args, context, info) { 
    // Take a copy of all the updated fields
    // Using spread here means only the fields we actually updated 
    // Will end up in the object
    const updates = {...args}

    // Remove the ID from updates 
    delete updates.id

    // run the update method
    return context.db.mutation.updateItem({
      data: updates,
      where: {
        id: args.id
      }
    }, info)
  },

  async deleteItem(parent, args, context, info) { 
    const where = { id: args.id }

    // find the item
    const item = await context.db.query.item({ where }, `{ id, title }`)
    // check if they own it or have permissions
    // TODO
    // delete it
    return context.db.mutation.deleteItem({ where }, info)
  },

  async signup(parent, args, context, info) {
    // Do one check of old Vidly project before implementing this strategy in prod

    // The rason that we're using cookies instead of localstorage is so that we can SSR
    // if we were using localstorage the server rendering the front end wouldn't have access to the 
    // JWT in order to pass it along to our back end!
    
    // Make meail lowercase =- this is also where we'd handle server side validation etc
    // I think we could just use Joi here! 
    args.email = args.email.toLowerCase()

    // hash the password
    
    // I don't know if I can use the below... if the bcrypt call failed would
    // it then continue anyway and end up storing the unhashed password
    // args.password = await bcrypt.hash(args.password, 10)

    // Is this safer ? 
    const password = await bcrypt.hash(args.password, 10)

    // Create user in database
    const user = await context.db.mutation.createUser({ 
      data: {
        ...args,
        password,
        permissions: { set: ['USER'] } // setting this way because it correlates to enum datatype
      } 
    }, info)

    // Create a JWT so we can sign the user in right away
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)

    // Set JWT as a cookie on the response
    context.response.cookie('token', token, cookieSettings)

    // Finally return the user to the browser
    return user
  },

  async signin(parent, {email, password}, context, info) {
    // Check if there is a user with the email
    
    const user = await context.db.query.user({
      where: { email: email }
    })

    if (!user) {
      // do we need to clear the users coookie here if it alreadt exists? 
      throw new Error('no user found')
    }

    console.log(user)
    
    // Check if the password is correct
    const validPass = await bcrypt.compare(password, user.password)

    if (!validPass) {
      // do we need to clear the users coookie here if it alreadt exists? 
      throw new Error('Wrong password fool')
    }

    // generate JWT
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)

    // Set the cookie
    context.response.cookie('token', token, cookieSettings)

    // return the user
    return user
  },

  signout(parent, args, context, info) {
    context.response.clearCookie('token')

    return { message: 'Success' }
  },

  async requestReset(parent, args, context, info) {
    // Check if this is a real user
    const user = await context.db.query.user({ where: { email: args.email } })
    if(!user) throw new Error('There aint no user with that email')

    // Set a reset token and expirry
    // have to promisify randomBytes as it requires a callback by default
    // randomBytes returns a buffer so toString will create a usable string
    const resetToken = (await promisify(randomBytes)(20)).toString('hex')
    const resetTokenExpiry = Date.now() + 3600000 // 1 hour from now
    
    const res = await context.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry }
    })

    console.log(res)

    // Email them the reset token
    const mailRes = await transport.sendMail({
      from: 'flippy@tripper.com',
      to: user.email,
      subject: 'Reset your password',
      html: makeNiceEmail(`your password reset token is here! \n\n <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to reset</a>`)
    })

    // Need to throw error if error with mail this goes for all these await operations 
    // - need to find a better way than writing try catch blocks
    // for every single query

    return { message: 'Success' }
  },

  async resetPassword(parent, args, context, info) {
    const { password, confirmPassword, resetToken } = args

    // check if  the passwords match
    if (password !== confirmPassword) throw new Error('Passwords must match')
    // check if it's a legit resettoken
    // Checking for user via the token itself but could also do via email
    // not using es6 shortuts here just for ultra clarity while I'm solidifying prisma knowledge

    // Could also do it this way if I didn't set token to unique
    // This was my solution bcause I set token to unique
    // user = await context.db.query.user({ where: { resetToken: resetToken } })

    // Wes did it differntly
    const [user] = await context.db.query.users({ 
      where: { 
        resetToken: resetToken,
        resetTokenExpiry_gte: Date.now()
      } 
    })

    if(!user) throw new Error('Token invalid or expired')
    
    // my method
    // if(user.resetToken !== resetToken) throw new Error('INvalid token')
  
    // check if it's expired
    // my solution below. WEs did it above in the query
    // if(user.resetTokenExpiry < Date.now()) throw new Error('INvalid token')

    // Hash new password
    const hash = await bcrypt.hash(password, 10)
  
    // Save new password to the user and remove reset token / expiry
    const res = await context.db.mutation.updateUser({
      where: { resetToken },
      data: { password: hash, resetToken: null, resetTokenExpiry: null }
    })

    // Generate JWT
    const token = jwt.sign({ userId: user.id}, process.env.APP_SECRET)
  
    // Set JWT cookie 
    context.response.cookie('token', token, cookieSettings)
    
    // Return new user
    return res
  }
}





module.exports = Mutations;
