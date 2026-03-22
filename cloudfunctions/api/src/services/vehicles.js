const { createAppError } = require("../utils/app-error");
const {
  listVehiclesByOwner,
  getVehicleById,
  createVehicle,
  updateVehicleById,
  deleteVehicleById,
} = require("../repositories/vehicles");
const { runIdempotentIfPresent } = require("./idempotency");

const listVehicles = async ({ ownerId, page, pageSize }) => {
  return listVehiclesByOwner({ ownerId, page, pageSize });
};

const createVehicleForUser = async ({ ctx, ownerId, payload }) => {
  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/vehicles",
    userId: ownerId,
    payload,
    execute: async () => {
      const now = new Date().toISOString();
      const doc = {
        ownerId,
        brand: payload.brand,
        model: payload.model,
        ...(payload.tankCapacityL !== undefined ? { tankCapacityL: payload.tankCapacityL } : {}),
        createdAt: now,
        updatedAt: now,
      };
      return createVehicle(doc);
    },
  });
};

const ensureOwnerAccess = (vehicle, user) => {
  if (!vehicle) {
    throw createAppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Vehicle not found",
      expose: true,
    });
  }
  const isOwner = vehicle.ownerId === user.id;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "No permission to access this vehicle",
      expose: true,
    });
  }
};

const updateVehicleForUser = async ({ ctx, vehicleId, user, payload }) => {
  const existing = await getVehicleById(vehicleId);
  ensureOwnerAccess(existing, user);

  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/vehicles/:id",
    userId: user.id,
    payload: { id: vehicleId, ...payload },
    execute: async () => {
      const updates = {
        updatedAt: new Date().toISOString(),
      };
      if (payload.brand !== undefined) updates.brand = payload.brand;
      if (payload.model !== undefined) updates.model = payload.model;
      if (payload.tankCapacityL !== undefined) updates.tankCapacityL = payload.tankCapacityL;
      return updateVehicleById(vehicleId, updates);
    },
  });
};

const deleteVehicleForUser = async ({ ctx, vehicleId, user }) => {
  const existing = await getVehicleById(vehicleId);
  ensureOwnerAccess(existing, user);
  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/vehicles/:id",
    userId: user.id,
    payload: { id: vehicleId },
    execute: async () => {
      await deleteVehicleById(vehicleId);
      return { deleted: true };
    },
  });
};

module.exports = {
  listVehicles,
  createVehicleForUser,
  updateVehicleForUser,
  deleteVehicleForUser,
};
