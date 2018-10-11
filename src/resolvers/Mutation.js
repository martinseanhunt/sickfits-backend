const Mutations = {
  async createItem(parent, args, ctx, info) {
    // TODO Check if they are logged in!

    const item = await ctx.db.mutation.createItem({
      data: {
        ...args
      }
    }, info) // info is passed as a second argument because it contains our request detauils which specify what gets returned from the server

    return item
  }
};

module.exports = Mutations;
