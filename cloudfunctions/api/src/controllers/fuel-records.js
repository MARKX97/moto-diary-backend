const {
  listFuelRecords,
  createFuelRecordForUser,
  updateLatestFuelRecordForUser,
  deleteLatestFuelRecordForUser,
} = require("../services/fuel-records");

const listFuelRecordsController = async (ctx) => {
  const { vehicleId, page, pageSize } = ctx.data;
  const result = await listFuelRecords({
    user: ctx.state.user,
    vehicleId,
    page,
    pageSize,
  });
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

const createFuelRecordController = async (ctx) => {
  return createFuelRecordForUser({
    ctx,
    payload: ctx.data,
  });
};

const updateFuelRecordController = async (ctx) => {
  return updateLatestFuelRecordForUser({
    ctx,
    recordId: ctx.data.id,
    payload: ctx.data,
  });
};

const deleteFuelRecordController = async (ctx) => {
  const res = await deleteLatestFuelRecordForUser({
    recordId: ctx.data.id,
    user: ctx.state.user,
  });
  return {
    success: true,
    data: res,
  };
};

module.exports = {
  listFuelRecordsController,
  createFuelRecordController,
  updateFuelRecordController,
  deleteFuelRecordController,
};
