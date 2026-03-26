const {
  listVehicles,
  createVehicleForUser,
  updateVehicleForUser,
  deleteVehicleForUser,
} = require("../services/vehicles");

const listVehiclesController = async (ctx) => {
  const { page, pageSize } = ctx.data;
  const ownerId = ctx.state.user.id;
  const result = await listVehicles({ ownerId, page, pageSize });
  return {
    success: true,
    data: {
      list: result.list,
      meta: {
        total: result.total,
        page,
        pageSize,
      },
    },
  };
};

const createVehicleController = async (ctx) => {
  const ownerId = ctx.state.user.id;
  const created = await createVehicleForUser({ ctx, ownerId, payload: ctx.data });
  return {
    success: true,
    data: created,
  };
};

const updateVehicleController = async (ctx) => {
  const user = ctx.state.user;
  const updated = await updateVehicleForUser({
    ctx,
    vehicleId: ctx.data.id,
    user,
    payload: ctx.data,
  });
  return {
    success: true,
    data: updated,
  };
};

const deleteVehicleController = async (ctx) => {
  const user = ctx.state.user;
  const res = await deleteVehicleForUser({
    ctx,
    vehicleId: ctx.data.id,
    user,
  });
  return {
    success: true,
    data: res,
  };
};

module.exports = {
  listVehiclesController,
  createVehicleController,
  updateVehicleController,
  deleteVehicleController,
};
