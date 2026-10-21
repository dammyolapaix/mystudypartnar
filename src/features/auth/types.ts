import type { z } from "zod";
import type { signInSchema, signUpSchema } from "./validations";

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
