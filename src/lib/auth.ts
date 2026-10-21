import db from "@/db";
import { revalidateTag } from "next/cache";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import * as schema from "@/features/auth/schema";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/auth/validations";
import { r2Storage } from "@/lib/r2";
import { createSources } from "@/features/sources/sources";
import type { SourceStorage } from "@/features/sources/types";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
  },
  databaseHooks: {
    user: {
      delete: {
        before: async (user) => {
          await createSources({
            storage: openStorageForSourceFiles(),
          }).deleteSourcesForStudent(user.id);
          try {
            revalidateTag("sources", { expire: 0 });
          } catch {
            return;
          }
        },
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds
    },
  },
  advanced: {
    database: {
      generateId: "uuid",
      joins: true,
    },
  },
});

function openStorageForSourceFiles(): SourceStorage {
  let storage: SourceStorage | undefined;
  const open = () => (storage ??= r2Storage());

  return {
    createUploadUrl: (input) => open().createUploadUrl(input),
    statObject: (key) => open().statObject(key),
    readObject: (key) => open().readObject(key),
    deleteObject: (key) => open().deleteObject(key),
  };
}
