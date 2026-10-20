import { eq } from "drizzle-orm";
import db from "@/db";
import { users } from "@/features/auth/schema";
import { sources } from "./schema";

export async function createUser() {
  const [user] = await db
    .insert(users)
    .values({
      name: "Student",
      email: `${crypto.randomUUID()}@study.example`,
    })
    .returning({ id: users.id });

  if (!user) throw new Error("Could not create user");
  return user;
}

/** Removes a fixture user. Sources are removed first so the users reference can go. */
export async function removeUser(userId: string) {
  await db.delete(sources).where(eq(sources.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}
