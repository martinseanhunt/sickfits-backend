const { forwardTo } = require('prisma-binding')
const { hasPermission } = require('../utils')

const Query = {
  
  /* Regular way to call the databsae query
  async items(parent, args, ctx, info) {
    const items = await ctx.db.query.items()
    return items
  }
  Or can use the below if it's just passing the query on with no custom logic*/ 
  items: forwardTo('db'),
  item: forwardTo('db'),
  itemsConnection : forwardTo('db'),
  me: (parent, args, context, info) => {
    const { userId } = context.request
    
    // make sure to return null if no user, don't throw an error otherwise non logged in users
    // will ger an error
    if(!userId) return null

    // Remember 'info' comes from the front end - we ask for the data we want
    return context.db.query.user({ where: {
      id: userId
    }}, info)
  },
  users: async (parent, args, context, info) => {
    // Check if they are logged in
    if(!context.request.userId) throw new Error('you need to be logged in')

    // Check if the user has the permissions to query all users
    // function checks if the user has ANY of these permissions
    const permissions = hasPermission(context.request.user, ['ADMIN', 'PERMISSIONUPDATE'])

    console.log(permissions)
    // if they do, query all the usrs!
    return context.db.query.users({}, info)
  },
  order: async (parent, args, context, info) => {
    // make sure logged in
    const userId = context.request.userId
    if(!userId) throw new Error('error')

    // query current order
    const order = await context.db.query.order({
      where: { id: args.id }
    }, info)

    // check permissinos to see this order
    const ownsOrder = order.user.id === userId
    const hasPemissionToSeeOrder = context.request.user.permissions.includes('ADMIN')

    if(!order && !hasPemissionToSeeOrder) throw new Error('You cant see this son')

    // return the order
    return order
  },
  orders: async (parent, args, context, info) => {
    // Check for login
    const userId = context.request.userId
    if (!userId) throw new Error('Needs login')

    console.log('hello')

    // return orders for that user
    return context.db.query.orders({
      where: { user: { id: userId } }
    }, info)
  }
};

module.exports = Query;
