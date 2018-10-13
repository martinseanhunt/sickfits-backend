const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const Mutations = {
  async createItem(parent, args, ctx, info) {
    // TODO Check if they are logged in!

    /// We could just return the function and Yoga knows to wait before returning
    // but it can help to store the result first if you need to console.log etc
    const item = await ctx.db.mutation.createItem({
      data: {
        ...args
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
    const token = jwt.sign({ userId: user.id, name: user.name, email: user.email }, process.env.APP_SECRET)

    // Set JWT as a cookie on the response
    context.response.cookie('token', token, {
      // Stops JS applications from being able to read the cookie / JWT content
      // Otherwise A rogue chrome plugin etc could grab the JWT and then 
      // authenticate as you until the token expires
      httpOnly: true, 
      maxAge: 1000 * 60 * 60 *24 * 365, // 1 year cookie
    })

    // Finally return the user to the browser
    return user
  }
};

module.exports = Mutations;
