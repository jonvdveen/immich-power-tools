import type { NextApiRequest, NextApiResponse } from "next";

import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { removeTag } from "@/lib/tag-manager/remove";

/** Delete a tag so that it stays deleted — see lib/tag-manager/remove.ts for why
 * Immich's own DELETE /tags/{id} isn't enough on its own. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method Not Allowed" });

  const tagId = String(req.query.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(tagId)) return res.status(400).json({ error: "Invalid tag id" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });

  try {
    const result = await removeTag({ tagId, ownerId: currentUser.id, user: currentUser });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message });
  }
}
