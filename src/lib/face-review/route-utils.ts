import { NextApiRequest, NextApiResponse } from "next";

import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { personOwnedBy } from "@/lib/face-review/queries";

/**
 * Resolve the request's user and verify the URL's person belongs to them.
 * Writes the error response and returns null on failure — the multi-user
 * Immich DB is instance-wide while auth is per-user, so every person-scoped
 * Face Review route MUST pass this gate before touching the DB (a foreign
 * person id must 404, indistinguishable from nonexistent).
 */
export async function requireOwnedPerson(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<{ ownerId: string; personId: string } | null> {
  const personId = String(req.query.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(personId)) {
    res.status(400).json({ error: "Invalid person id" });
    return null;
  }
  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  if (!(await personOwnedBy(personId, currentUser.id))) {
    res.status(404).json({ error: "Person not found" });
    return null;
  }
  return { ownerId: currentUser.id, personId };
}

export async function requireUser(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<{ ownerId: string } | null> {
  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return { ownerId: currentUser.id };
}
