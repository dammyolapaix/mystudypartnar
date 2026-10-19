import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "./auth";

/**
 * Get the current session on the server side.
 * Returns null if not authenticated.
 */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session;
});
