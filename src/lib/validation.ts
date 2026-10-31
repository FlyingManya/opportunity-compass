import { z } from "zod";
const short = z.string().trim().max(120);
const tags = z.array(z.string().trim().min(1).max(60)).max(30);
export const signupSchema = z.object({
  name: short.min(1),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
});
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const profileSchema = z.object({
  name: short.min(1),
  age: z.number().int().min(13).max(120).nullable(),
  profession: short,
  city: short,
  country: short,
  timezone: z
    .string()
    .max(80)
    .refine((t) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: t });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone"),
  skills: tags,
  interests: tags,
  experience: z
    .array(z.object({ field: short.min(1), years: z.number().min(0).max(100) }))
    .max(20),
  onboarded: z.boolean(),
});
export const savedSchema = z.object({
  opportunityId: z.string().max(100),
  status: z
    .enum(["interested", "preparing", "submitted"])
    .default("interested"),
  completedTasks: z.array(z.number().int().min(0).max(30)).max(30).default([]),
});
