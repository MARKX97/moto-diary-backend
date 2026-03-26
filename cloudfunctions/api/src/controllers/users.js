const {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  getCurrentUserPreferences,
  updateCurrentUserPreferences,
} = require("../services/users");

const getMeController = async (ctx) => {
  const user = await getCurrentUserProfile({ user: ctx.state.user });
  return {
    success: true,
    data: { user },
  };
};

const updateMeProfileController = async (ctx) => {
  const user = await updateCurrentUserProfile({
    user: ctx.state.user,
    payload: ctx.data,
  });
  return {
    success: true,
    data: { user },
  };
};

const getMePreferencesController = async (ctx) => {
  const preferences = await getCurrentUserPreferences({ user: ctx.state.user });
  return {
    success: true,
    data: { preferences },
  };
};

const updateMePreferencesController = async (ctx) => {
  const preferences = await updateCurrentUserPreferences({
    user: ctx.state.user,
    payload: ctx.data,
  });
  return {
    success: true,
    data: { preferences },
  };
};

module.exports = {
  getMeController,
  updateMeProfileController,
  getMePreferencesController,
  updateMePreferencesController,
};
