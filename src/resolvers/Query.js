const { forwardTo } = require('prisma-binding')

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
};

module.exports = Query;
