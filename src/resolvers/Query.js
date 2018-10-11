const { forwardTo } = require('prisma-binding')

const Query = {
  
  /* Regular way to call the databsae query
  async items(parent, args, ctx, info) {
    const items = await ctx.db.query.items()
    return items
  }
  Or can use the below if it's just passing the query on with no custom logic*/ 
  items: forwardTo('db')

};

module.exports = Query;
