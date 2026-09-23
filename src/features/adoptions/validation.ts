import { z } from "zod";
import { isDate } from "./dates";
export const ANONYMOUS_SUPPORTER = "Anonymous supporter";
export const versionSchema = z.number().int().positive();
export const dateSchema = z
  .string()
  .refine(isDate, "Use a valid YYYY-MM-DD date.");
export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter a contact name.").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address.")
    .max(254),
});
export const publicNameSchema = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .transform((value) => value || null);
export const guestAdoptionSchema = contactSchema
  .extend({
    benchCode: z.string().trim().min(1).max(40),
    publicName: publicNameSchema,
    months: z.number().int().min(1).max(120),
    requestId: z.uuid(),
  })
  .strict();
export const benchInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9-]{1,39}$/,
      "Use 2–40 letters, numbers, or hyphens.",
    ),
  description: z.string().trim().min(3).max(300),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  state: z.enum(["in_service", "unavailable", "retired"]),
});
export const staffAdoptionSchema = contactSchema.extend({
  benchCode: z.string().trim().min(1).max(40),
  publicName: publicNameSchema,
  startsOn: dateSchema,
  through: dateSchema,
});
