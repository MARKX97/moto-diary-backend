const { createFeedback } = require("../repositories/feedback");
const { runIdempotentIfPresent } = require("./idempotency");

const createFeedbackTicket = async ({ ctx, user, payload }) => {
  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/feedback",
    userId: user && user.id ? user.id : "",
    payload,
    execute: async () => {
      const now = new Date().toISOString();
      return createFeedback({
        userId: user && user.id ? user.id : "",
        text: payload.text,
        contact: payload.contact || "",
        status: "new",
        createdAt: now,
      });
    },
  });
};

module.exports = {
  createFeedbackTicket,
};
