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
  }
};

module.exports = Mutations;
