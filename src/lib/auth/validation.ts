import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido."));

export const passwordSchema = z
  .string()
  .min(8, "Use pelo menos 8 caracteres.")
  .max(128, "Use no máximo 128 caracteres.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(128, "Senha muito longa."),
});

// Shared shape returned by every server action to MutationForm/AuthForm.
export type FormState = {
  error?: string;
  success?: string;
  destination?: string;
  link?: string;
};
