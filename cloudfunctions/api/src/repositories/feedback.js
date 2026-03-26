const { getDb, addDoc } = require("../utils/db");

const FEEDBACK_COLLECTION = "feedback";

const getFeedbackCollection = () => getDb().collection(FEEDBACK_COLLECTION);

const createFeedback = async (doc) => {
  const res = await addDoc(getFeedbackCollection(), doc);
  const id = res && (res.id || res._id) ? res.id || res._id : null;
  return {
    id,
  };
};

module.exports = {
  createFeedback,
};
