/**
 * Shared write-path helpers: name resolution and batched face reassignment.
 * All Immich mutations go through lib/face-review/immich.ts with the
 * requesting user's credentials; the DB is only read here (name lookup).
 */
import { createPerson, reassignFace } from "@/lib/face-review/immich";
import { findPersonByName, personOwnedBy } from "@/lib/face-review/queries";

type ImmichUser = { isUsingAPIKey?: boolean; accessToken?: string };

/**
 * Map a typed name to a person id: exact case-insensitive match among the
 * owner's people wins; otherwise create a new person with that name.
 */
export async function resolveOrCreatePerson(
  user: ImmichUser,
  ownerId: string,
  name: string
): Promise<{ id: string; matchedExisting: boolean }> {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Empty name");
  const existing = await findPersonByName(ownerId, trimmed);
  if (existing) return { id: existing, matchedExisting: true };
  const created = await createPerson(user, trimmed);
  return { id: created.id, matchedExisting: false };
}

/**
 * Resolve the reassign target from a request body carrying either personId
 * or a free-typed name. A personId is verified to belong to the owner — the
 * Immich API would also reject a foreign target, but failing early keeps the
 * error comprehensible.
 */
export async function resolveTarget(
  user: ImmichUser,
  ownerId: string,
  body: { personId?: string; name?: string }
): Promise<{ id: string; matchedExisting: boolean }> {
  if (body.personId) {
    if (!(await personOwnedBy(body.personId, ownerId))) {
      throw new Error("Target person not found");
    }
    return { id: body.personId, matchedExisting: true };
  }
  return resolveOrCreatePerson(user, ownerId, body.name || "");
}

/** Reassign faces one by one (no reliable bulk endpoint), tallying failures. */
export async function reassignFaces(
  user: ImmichUser,
  faceIds: string[],
  targetPersonId: string
): Promise<{ done: number; failed: number }> {
  let done = 0, failed = 0;
  for (const faceId of faceIds) {
    try {
      await reassignFace(user, faceId, targetPersonId);
      done++;
    } catch {
      failed++;
    }
  }
  return { done, failed };
}

export function parseFaceIds(body: any): string[] {
  const ids = Array.isArray(body?.faceIds) ? body.faceIds : [];
  return ids.filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x as string));
}
