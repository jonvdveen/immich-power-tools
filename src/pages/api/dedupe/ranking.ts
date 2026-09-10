import type { NextApiRequest, NextApiResponse } from "next";

import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { DEFAULT_RANKING } from "@/lib/duplicates/ranking";
import { getRanking, saveRanking } from "@/lib/duplicates/rankingStore";

/** GET the account's keeper-ranking, PUT a new one, DELETE to reset to the
 *  measured default. Stored server-side so it follows the user across
 *  browsers, same as the GPS Manager's saved locations. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });

  try {
    if (req.method === "GET") {
      return res.status(200).json({ ranking: await getRanking(currentUser.id) });
    }
    if (req.method === "PUT") {
      const input = req.body?.ranking;
      if (!Array.isArray(input)) {
        return res.status(400).json({ error: "ranking must be an array" });
      }
      return res.status(200).json({ ranking: await saveRanking(currentUser.id, input) });
    }
    if (req.method === "DELETE") {
      return res.status(200).json({ ranking: await saveRanking(currentUser.id, [...DEFAULT_RANKING]) });
    }
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
