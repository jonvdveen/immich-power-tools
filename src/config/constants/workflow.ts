/** Workflow constants that both the engine and the API routes need. Kept out of
 *  lib/workflow/* so a route can validate a graph without pulling in the action
 *  executor (and with it a database pool it has no use for). */

/** Actions that reconcile a container against the matching set rather than only
 *  adding to it: whatever is in there that no longer matches gets removed. */
export const SYNC_ACTIONS = ["update_album", "update_tag"];

export const isSyncAction = (subType: string) => SYNC_ACTIONS.includes(subType);

/** Triggers that hand the engine only a slice of the library. A sync action
 *  treats "everything that matched" as the complete membership list, so on one
 *  of these it would see a handful of new photos as the whole truth and strip
 *  the album or tag back to just those. */
export const PARTIAL_SCAN_TRIGGERS = ["new_asset", "asset_updated"];

export const SYNC_TRIGGER_ERROR =
  'A sync action ("Update Album" / "Update Tag") needs the "All assets" trigger. ' +
  "On \"New assets only\" or \"Asset updated\" the run only sees part of your library, " +
  "so it would remove everything else from the album or tag. Switch the trigger to " +
  '"All assets", or use "Add to Album" / "Add Tag" instead.';

/** Returns an error message if the graph can't safely be saved or run. */
export function validateWorkflowGraph(nodes: any[] | undefined | null): string | null {
  if (!nodes?.length) return null;

  const hasSyncAction = nodes.some(
    (n) => n?.type === "action" && isSyncAction(String(n?.subType ?? ""))
  );
  if (!hasSyncAction) return null;

  const partialTrigger = nodes.find(
    (n) => n?.type === "trigger" && PARTIAL_SCAN_TRIGGERS.includes(String(n?.subType ?? ""))
  );
  return partialTrigger ? SYNC_TRIGGER_ERROR : null;
}
