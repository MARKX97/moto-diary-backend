const { createFeedbackTicket } = require("../services/feedback");

const createFeedbackController = async (ctx) => {
  const created = await createFeedbackTicket({
    ctx,
    user: ctx.state.user,
    payload: ctx.data,
  });
  return {
    success: true,
    data: created,
  };
};

module.exports = {
  createFeedbackController,
};
