import { expect, test } from "vitest";
import { signInSchema, signUpSchema } from "./validations";

test("sign in accepts an email and a password", () => {
  expect(
    signInSchema.safeParse({
      email: "ada@example.com",
      password: "password1",
    }).success,
  ).toBe(true);
});

test("sign in rejects a blank email", () => {
  const parsed = signInSchema.safeParse({
    email: "",
    password: "password1",
  });

  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    expect(parsed.error.issues.map((issue) => issue.message)).toContain(
      "Enter a valid email",
    );
  }
});

test("sign up accepts a name, email, and 8 character password", () => {
  const parsed = signUpSchema.safeParse({
    name: "  Ada Lovelace  ",
    email: "ada@example.com",
    password: "password1",
  });

  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.name).toBe("Ada Lovelace");
  }
});

test("sign up rejects a password shorter than 8 characters", () => {
  const parsed = signUpSchema.safeParse({
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "short",
  });

  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    expect(parsed.error.issues.map((issue) => issue.message)).toContain(
      "Use at least 8 characters",
    );
  }
});

test("sign up rejects a blank name", () => {
  const parsed = signUpSchema.safeParse({
    name: "   ",
    email: "ada@example.com",
    password: "password1",
  });

  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    expect(parsed.error.issues.map((issue) => issue.message)).toContain(
      "Enter your name",
    );
  }
});
