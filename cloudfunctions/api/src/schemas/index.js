const { z } = require("zod");

const loginSchema = z.object({
  code: z.string().min(1).max(128),
});

const itemListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(["hot", "new", "distance"]).default("hot"),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  city: z.string().max(64).optional(),
  type: z.enum(["route", "spot", "food"]).optional(),
  tag: z.string().max(32).optional(),
});

module.exports = {
  loginSchema,
  itemListSchema,
};
