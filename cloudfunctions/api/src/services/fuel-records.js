const { createAppError } = require("../utils/app-error");
const { runIdempotent, runIdempotentIfPresent } = require("./idempotency");
const { getVehicleById } = require("../repositories/vehicles");
const {
  listFuelRecordsByOwner,
  getFuelRecordById,
  createFuelRecord,
  updateFuelRecordById,
  deleteFuelRecordById,
  listRecentFuelRecordsByVehicle,
} = require("../repositories/fuel-records");

const round = (num, digits = 2) => Number(Number(num).toFixed(digits));

const ensureVehicleAccess = (vehicle, user) => {
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

const ensureRecordAccess = (record, user) => {
  if (!record) {
    throw createAppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Fuel record not found",
      expose: true,
    });
  }
  const isOwner = record.ownerId === user.id;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "No permission to access this fuel record",
      expose: true,
    });
  }
};

const resolveBaseOdometer = ({ latestRecord, isFull, lastOdometerKm }) => {
  if (latestRecord && Number.isFinite(Number(latestRecord.odometerKm))) {
    return Number(latestRecord.odometerKm);
  }

  if (lastOdometerKm !== undefined && lastOdometerKm !== null) {
    return Number(lastOdometerKm);
  }

  if (isFull) {
    return null;
  }

  throw createAppError({
    code: "VALIDATION_FAILED",
    status: 400,
    message: "first fuel record must be full or provide lastOdometerKm",
    expose: true,
  });
};

const computeFuelFields = ({ vehicle, pricePerL, amountPaid, odometerKm, isFull, baseOdometer }) => {
  const fuelLiters = round(amountPaid / pricePerL, 3);
  if (vehicle.tankCapacityL && fuelLiters > Number(vehicle.tankCapacityL) * 1.1) {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "fuel liters exceed vehicle tank capacity threshold",
      expose: true,
    });
  }

  let distanceKm = null;
  if (baseOdometer !== null) {
    distanceKm = round(odometerKm - baseOdometer, 2);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      throw createAppError({
        code: "VALIDATION_FAILED",
        status: 400,
        message: "odometerKm must be greater than previous odometer",
        expose: true,
      });
    }
  }

  const consumptionLPer100km =
    isFull && distanceKm && distanceKm > 0 ? round((fuelLiters / distanceKm) * 100, 2) : null;

  return {
    fuelLiters,
    lastOdometerKm: baseOdometer,
    distanceKm,
    consumptionLPer100km,
  };
};

const listFuelRecords = async ({ user, vehicleId, page, pageSize }) => {
  if (vehicleId) {
    const vehicle = await getVehicleById(vehicleId);
    ensureVehicleAccess(vehicle, user);
  }
  return listFuelRecordsByOwner({
    ownerId: user.id,
    vehicleId,
    page,
    pageSize,
  });
};

const createFuelRecordForUser = async ({ ctx, payload }) => {
  const user = ctx.state.user;
  const vehicle = await getVehicleById(payload.vehicleId);
  ensureVehicleAccess(vehicle, user);

  return runIdempotent({
    ctx,
    path: "/api/v1/fuel-records",
    userId: user.id,
    payload,
    execute: async () => {
      const latest = (await listRecentFuelRecordsByVehicle(payload.vehicleId, 1))[0] || null;
      const baseOdometer = resolveBaseOdometer({
        latestRecord: latest,
        isFull: payload.isFull,
        lastOdometerKm: payload.lastOdometerKm,
      });
      const computed = computeFuelFields({
        vehicle,
        pricePerL: payload.pricePerL,
        amountPaid: payload.amountPaid,
        odometerKm: payload.odometerKm,
        isFull: payload.isFull,
        baseOdometer,
      });
      const now = new Date().toISOString();
      const doc = {
        ownerId: user.id,
        vehicleId: payload.vehicleId,
        pricePerL: payload.pricePerL,
        amountPaid: payload.amountPaid,
        odometerKm: payload.odometerKm,
        isFull: payload.isFull,
        ...(payload.note !== undefined ? { note: payload.note } : {}),
        ...computed,
        createdAt: now,
        updatedAt: now,
      };
      const created = await createFuelRecord(doc);
      return {
        success: true,
        data: created,
      };
    },
  });
};

const updateLatestFuelRecordForUser = async ({ ctx, recordId, payload }) => {
  const user = ctx.state.user;
  const existing = await getFuelRecordById(recordId);
  ensureRecordAccess(existing, user);

  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/fuel-records/:id",
    userId: user.id,
    payload: { id: recordId, ...payload },
    execute: async () => {
      const recent = await listRecentFuelRecordsByVehicle(existing.vehicleId, 5);
      const latest = recent[0] || null;
      if (!latest || latest._id !== recordId) {
        throw createAppError({
          code: "FORBIDDEN",
          status: 403,
          message: "only latest fuel record can be updated",
          expose: true,
        });
      }

      const previous = recent.find((item) => item._id !== recordId) || null;
      const merged = {
        vehicleId: existing.vehicleId,
        pricePerL: payload.pricePerL !== undefined ? payload.pricePerL : existing.pricePerL,
        amountPaid: payload.amountPaid !== undefined ? payload.amountPaid : existing.amountPaid,
        odometerKm: payload.odometerKm !== undefined ? payload.odometerKm : existing.odometerKm,
        isFull: payload.isFull !== undefined ? payload.isFull : existing.isFull,
        lastOdometerKm:
          payload.lastOdometerKm !== undefined ? payload.lastOdometerKm : existing.lastOdometerKm,
        note: payload.note !== undefined ? payload.note : existing.note,
      };

      const vehicle = await getVehicleById(merged.vehicleId);
      ensureVehicleAccess(vehicle, user);

      const baseOdometer = resolveBaseOdometer({
        latestRecord: previous,
        isFull: merged.isFull,
        lastOdometerKm: merged.lastOdometerKm,
      });
      const computed = computeFuelFields({
        vehicle,
        pricePerL: merged.pricePerL,
        amountPaid: merged.amountPaid,
        odometerKm: merged.odometerKm,
        isFull: merged.isFull,
        baseOdometer,
      });

      const updates = {
        pricePerL: merged.pricePerL,
        amountPaid: merged.amountPaid,
        odometerKm: merged.odometerKm,
        isFull: merged.isFull,
        note: merged.note || "",
        ...computed,
        updatedAt: new Date().toISOString(),
      };

      const updated = await updateFuelRecordById(recordId, updates);
      return {
        success: true,
        data: updated,
      };
    },
  });
};

const deleteLatestFuelRecordForUser = async ({ recordId, user }) => {
  const existing = await getFuelRecordById(recordId);
  ensureRecordAccess(existing, user);

  const recent = await listRecentFuelRecordsByVehicle(existing.vehicleId, 1);
  const latest = recent[0] || null;
  if (!latest || latest._id !== recordId) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "only latest fuel record can be deleted",
      expose: true,
    });
  }

  await deleteFuelRecordById(recordId);
  return {
    deleted: true,
  };
};

module.exports = {
  listFuelRecords,
  createFuelRecordForUser,
  updateLatestFuelRecordForUser,
  deleteLatestFuelRecordForUser,
};
