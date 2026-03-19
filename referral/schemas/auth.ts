import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Некорректный email"),
  name: z.string().max(100).optional().or(z.literal("")),
  password: z
    .string()
    .min(8, "Пароль не короче 8 символов")
    .regex(/[A-Za-z]/, "Нужна хотя бы одна буква")
    .regex(/[0-9]/, "Нужна хотя бы одна цифра"),
  deviceFingerprint: z.preprocess(
    (v) => (v === "" || v == null ? undefined : String(v)),
    z.string().regex(/^[a-f0-9]{64}$/).optional(),
  ),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
