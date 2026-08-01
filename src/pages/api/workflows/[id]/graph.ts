import { appDb } from "@/db";
import { workflows, workflowNodes, workflowEdges } from "@/db/schema/workflows.schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { eq, and } from "drizzle-orm";
import { NextApiRequest, NextApiResponse } from "next";
import { validateWorkflowGraph } from "@/config/constants/workflow";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

  const { id } = req.query as { id: string };

  if (req.method !== "PUT") return res.status(405).json({ message: "Method not allowed" });

  const [workflow] = await appDb
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.ownerId, currentUser.id)));
  if (!workflow) return res.status(404).json({ message: "Workflow not found" });

  const { nodes, edges, viewport } = req.body;

  const graphError = validateWorkflowGraph(nodes);
  if (graphError) return res.status(400).json({ message: graphError });

  await appDb.delete(workflowEdges).where(eq(workflowEdges.workflowId, id));
  await appDb.delete(workflowNodes).where(eq(workflowNodes.workflowId, id));

  if (nodes && nodes.length > 0) {
    await appDb.insert(workflowNodes).values(
      nodes.map((n: any) => ({
        id: n.id,
        workflowId: id,
        type: n.type,
        subType: n.subType,
        data: typeof n.data === "string" ? n.data : JSON.stringify(n.data),
        positionX: n.positionX ?? n.position?.x ?? 0,
        positionY: n.positionY ?? n.position?.y ?? 0,
      }))
    );
  }

  if (edges && edges.length > 0) {
    await appDb.insert(workflowEdges).values(
      edges.map((e: any) => ({
        id: e.id,
        workflowId: id,
        sourceNodeId: e.sourceNodeId ?? e.source,
        targetNodeId: e.targetNodeId ?? e.target,
        sourceHandle: e.sourceHandle ?? null,
      }))
    );
  }

  if (viewport) {
    await appDb.update(workflows).set({
      viewport: typeof viewport === "string" ? viewport : JSON.stringify(viewport),
    }).where(eq(workflows.id, id));
  }

  return res.status(200).json({ success: true });
}
