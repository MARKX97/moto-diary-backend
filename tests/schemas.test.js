const test = require("node:test");
const assert = require("node:assert/strict");
const {
  itemCreateSchema,
  itemUpdateSchema,
  fuelRecordCreateSchema,
  usersProfileUpdateSchema,
  groupCreateSchema,
} = require("../cloudfunctions/api/src/schemas");

test("itemCreateSchema accepts valid route payload", () => {
  const payload = itemCreateSchema({
    title: "Ride log",
    content: "Weekend ride",
    type: "route",
    route: { start: "A", end: "B", distanceKm: 80 },
    visibility: "public",
    fuelRecordId: "fuel_1",
  });
  assert.equal(payload.type, "route");
  assert.equal(payload.route.start, "A");
  assert.equal(payload.fuelRecordId, "fuel_1");
});

test("itemCreateSchema rejects route type without route object", () => {
  assert.throws(
    () =>
      itemCreateSchema({
        content: "Weekend ride",
        type: "route",
      }),
    /route is required/
  );
});

test("itemUpdateSchema requires at least one updatable field", () => {
  assert.throws(() => itemUpdateSchema({ id: "item_1" }), /at least one updatable field is required/);
});

test("itemUpdateSchema accepts fuelRecordId-only update", () => {
  const payload = itemUpdateSchema({
    id: "item_1",
    fuelRecordId: "fuel_2",
  });
  assert.equal(payload.id, "item_1");
  assert.equal(payload.fuelRecordId, "fuel_2");
});

test("itemUpdateSchema allows clearing fuelRecordId with empty string", () => {
  const payload = itemUpdateSchema({
    id: "item_1",
    fuelRecordId: "",
  });
  assert.equal(payload.fuelRecordId, "");
});

test("fuelRecordCreateSchema normalizes numeric fields", () => {
  const payload = fuelRecordCreateSchema({
    vehicleId: "veh_1",
    pricePerL: "8.35",
    amountPaid: "200",
    odometerKm: "15230.5",
    isFull: "true",
    note: "full tank",
  });
  assert.equal(payload.pricePerL, 8.35);
  assert.equal(payload.amountPaid, 200);
  assert.equal(payload.odometerKm, 15230.5);
  assert.equal(payload.isFull, true);
});

test("usersProfileUpdateSchema rejects unsupported avatarSource", () => {
  assert.throws(
    () =>
      usersProfileUpdateSchema({
        avatarSource: "manual",
      }),
    /avatarSource only supports wechat/
  );
});

test("groupCreateSchema rejects unsupported privacy", () => {
  assert.throws(
    () =>
      groupCreateSchema({
        name: "Weekend riders",
        privacy: "friends",
      }),
    /privacy must be one of public\/private/
  );
});
