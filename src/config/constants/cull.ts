/**
 * Pick/Reject flag tag names for the Cull tool, shared by the client
 * handlers and the cull-assets API route. Flags are plain Immich tags kept
 * independent of Immich's native star rating, because the rating field is a
 * single overloaded value ([1-5 starred | -1 rejected | null]) and can't
 * represent "4 stars AND rejected" at once. Tags also show up in Immich's
 * own tag browser/search.
 */
export const PICK_TAG_NAME = "Picked";
export const REJECT_TAG_NAME = "Rejected";
