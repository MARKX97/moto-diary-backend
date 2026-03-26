const { createAppError } = require("../utils/app-error");
const { findUserByOpenid, createUser, updateUserById } = require("../repositories/users");

const toProfileView = (doc, fallbackUser) => ({
  id: (doc && doc.userId) || (fallbackUser && fallbackUser.id) || "",
  openid: doc && doc.openid ? doc.openid : fallbackUser && fallbackUser.openid,
  nickname: (doc && doc.nickname) || "",
  avatar: (doc && doc.avatar) || "",
  nicknameSource: (doc && doc.nicknameSource) || undefined,
  avatarSource: (doc && doc.avatarSource) || undefined,
  role: (doc && doc.role) || (fallbackUser && fallbackUser.role) || "user",
  createdAt: doc && doc.createdAt ? doc.createdAt : undefined,
  updatedAt: doc && doc.updatedAt ? doc.updatedAt : undefined,
});

const defaultPreferences = () => ({
  feedSortDefault: "hot",
  distanceUnit: "km",
  publishVisibilityDefault: "public",
  allowNearbyRecommendation: true,
});

const toPreferencesView = (doc) => {
  const raw = doc && doc.preferences && typeof doc.preferences === "object" ? doc.preferences : {};
  return {
    ...defaultPreferences(),
    ...raw,
  };
};

const ensureUserDoc = async ({ userId, openid, role = "user", touchLoginAt = false }) => {
  let existing = await findUserByOpenid(openid);
  if (existing) {
    const updates = {};
    if (!existing.userId || existing.userId !== userId) {
      updates.userId = userId;
    }
    if (!existing.role) {
      updates.role = role;
    }
    if (touchLoginAt) {
      updates.lastLoginAt = new Date().toISOString();
    }
    if (Object.keys(updates).length > 0) {
      existing = await updateUserById(existing._id, updates);
    }
    return existing;
  }

  const now = new Date().toISOString();
  return createUser({
    openid,
    userId,
    role,
    nickname: "",
    avatar: "",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  });
};

const ensureUserForLogin = async ({ userId, openid, role = "user" }) => {
  const userDoc = await ensureUserDoc({ userId, openid, role, touchLoginAt: true });
  return toProfileView(userDoc, { id: userId, openid, role });
};

const getCurrentUserProfile = async ({ user }) => {
  const userDoc = await ensureUserDoc({
    userId: user.id,
    openid: user.openid,
    role: user.role,
  });
  return toProfileView(userDoc, user);
};

const updateCurrentUserProfile = async ({ user, payload }) => {
  const userDoc = await ensureUserDoc({
    userId: user.id,
    openid: user.openid,
    role: user.role,
  });

  if (!userDoc || !userDoc._id) {
    throw createAppError({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "failed to load user profile",
      expose: false,
    });
  }

  const updates = {
    updatedAt: new Date().toISOString(),
  };
  if (payload.nickname !== undefined) updates.nickname = payload.nickname;
  if (payload.nicknameSource !== undefined) updates.nicknameSource = payload.nicknameSource;
  if (payload.avatarSource !== undefined) updates.avatarSource = payload.avatarSource;
  if (payload.avatarUrl !== undefined) updates.avatar = payload.avatarUrl;

  const next = await updateUserById(userDoc._id, updates);
  return toProfileView(next, user);
};

const getCurrentUserPreferences = async ({ user }) => {
  const userDoc = await ensureUserDoc({
    userId: user.id,
    openid: user.openid,
    role: user.role,
  });
  return toPreferencesView(userDoc);
};

const updateCurrentUserPreferences = async ({ user, payload }) => {
  const userDoc = await ensureUserDoc({
    userId: user.id,
    openid: user.openid,
    role: user.role,
  });

  if (!userDoc || !userDoc._id) {
    throw createAppError({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "failed to load user preferences",
      expose: false,
    });
  }

  const current = toPreferencesView(userDoc);
  const nextPreferences = {
    ...current,
    ...payload,
  };
  const next = await updateUserById(userDoc._id, {
    preferences: nextPreferences,
    updatedAt: new Date().toISOString(),
  });
  return toPreferencesView(next);
};

module.exports = {
  ensureUserForLogin,
  getCurrentUserProfile,
  updateCurrentUserProfile,
  getCurrentUserPreferences,
  updateCurrentUserPreferences,
};
