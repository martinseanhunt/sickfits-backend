const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')

const { hasPermission } = require('../utils')

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
    // Check if login
    if(!context.request.userId) throw new Error('Login required')

    // find the item
    const where = { id: args.id }
    const item = await context.db.query.item({ where }, `{ id, title, user{ id } }`)

    // check if they own it or have permissions
    const ownsItem = item.user.id === context.request.userId

    // not using utility function here because the utility function will throw an error
    // and we want to throw it here - could refactor the utility function to optionally
    // Not throw an error and return a bool

    // .some() checks if at least 1 iteration evaluates to true and returns a bool
    
    const hasPermissions = context.request.user.permissions
      .some(permission => ['ADMIN', 'ITEMDELETE'].includes(permission))

    if (! (ownsItem || hasPermissions)) throw new Error('you dont have permission to do this')

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
  },

  async updatePermissions (parent, args, context, info) {
    // Check if user is logged in
    if(!context.request.userId) throw new Error('You must be logged in')

    // get the current user
    const user = context.request.user

    // check if they have permissions to do this
    const hasPermission = (user, ['ADMIN', 'PERMISSIONUPDAATE'])

    // update permissions
    // Because permissions is its own enum we have to use
    // set: to set the updated permissions from args 
    // I don't fully understasnd this - set comes from prisma
    return context.db.mutation.updateUser({ 
      data: { permissions: { set: args.permissions } },
      where: { id: args.userId }
     }, info)
  },

  async addToCart (parent, args, context, info) {
    // Make sure that user is signed in
    const userId = context.request.userId
    if(!userId) throw new Error('Please sign in')

    // Query current cart for item we're trying to add
    // [variablename] destructures the first item in an array to a new array
    // There should only ever be one result returned from this query
    const [existingCartItem] = await context.db.query.cartItems({
      where: {
        user: {id: userId},
        item: {id: args.id}
      }
    }, info)

    // if item is in the cart if it is increment by1
    if(existingCartItem){
      console.log('already in cart')
      return context.db.mutation.updateCartItem({
        where: { id: existingCartItem.id },
        data: { quantity: existingCartItem.quantity + 1 }
      }, info)
    } 

    // 4 Otherwise create a fresh cart item
    console.log('new item')
    return context.db.mutation.createCartItem({
      data: {
        user: { connect: { id: userId } },
        item: { connect: { id: args.id } }
      }
    }, info)

    // Is prisma automatically adding the cartItem id's in to the cart field on the User type? 

  },

  async removeFromCart(parent, args, context, info) {
    const userId = context.request.userId
    if(!userId) throw new Error('You need to be logged in')

    // find the cart item
    // If we want to query specific stuff that isn't asked for by the frontend
    // i.e. populating relationships we need to pass a manual query instead of info
    const cartItem = await context.db.query.cartItem({
      where: { id: args.id }
    }, `{ id, user { id } }`)
    if(!cartItem) throw new Error('Item not found in cart')

    // make sure they own it
    if(cartItem.user.id !== userId) throw new Error('You need to own this item to delete it')

    // delete cart item and return it 
    return context.db.mutation.deleteCartItem({
      where: { id: args.id }
    }, info)
  }
}





module.exports = Mutations;
