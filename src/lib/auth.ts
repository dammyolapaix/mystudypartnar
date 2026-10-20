import db from "@/db";
import { revalidateTag } from "next/cache";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import * as schema from "@/features/auth/schema";
import { r2Storage } from "@/features/sources/r2-storage";
import { createSources } from "@/features/sources/sources";
import type { SourceStorage } from "@/features/sources/types";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
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
