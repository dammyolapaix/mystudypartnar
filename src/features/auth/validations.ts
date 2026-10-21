import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const signInSchema = z.object({
  email: z.email({ error: "Enter a valid email" }),
  password: z.string().min(1, { error: "Enter your password" }),
});

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter your name" })
    .max(80, { error: "Name is too long" }),
  email: z.email({ error: "Enter a valid email" }),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, { error: "Use at least 8 characters" })
    .max(PASSWORD_MAX_LENGTH, { error: "Password is too long" }),
});
