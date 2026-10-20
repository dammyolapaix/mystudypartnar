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

/** Leaves passages in place. Retry must remove them rather than append. */
export async function failSourceKeepingPassages(sourceId: string) {
  await db
    .update(sources)
    .set({ status: "failed", failureReason: "no_text" })
    .where(eq(sources.id, sourceId));
}

/** Removes a fixture user. Sources are removed first so the users reference can go. */
export async function removeUser(userId: string) {
  await db.delete(sources).where(eq(sources.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}
