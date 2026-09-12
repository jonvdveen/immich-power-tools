import { pgTable, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * A detected face on an asset.
 *
 * In Immich 3.x a face no longer points at a `person`; it points at a
 * `person_group` (the cluster), and a `person` row is one owner's naming of
 * that group. See `person.schema.ts` for the full story.
 *
 * `personId` here maps to the `personGroupId` column because that is what
 * Immich's own API still calls it — `AssetFaceUpdateItem.personId` — and it is
 * the id every people endpoint accepts. Renaming the property throughout the
 * app would only move the app *away* from the names Immich itself uses.
 */
export const assetFaces = pgTable("asset_face", {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("assetId").notNull(),
    /** The `personGroupId` column — see the note above. Null = unassigned face. */
    personId: uuid("personGroupId"),
    imageWidth: integer("imageWidth").notNull().default(0),
    imageHeight: integer("imageHeight").notNull().default(0),
    boundingBoxX1: integer("boundingBoxX1").notNull().default(0),
    boundingBoxY1: integer("boundingBoxY1").notNull().default(0),
    boundingBoxX2: integer("boundingBoxX2").notNull().default(0),
    boundingBoxY2: integer("boundingBoxY2").notNull().default(0),
    /** Hidden detections: statues, pets, blurs. Immich sets this rather than
     *  deleting the row. */
    isVisible: boolean("isVisible").notNull().default(true),
    deletedAt: timestamp("deletedAt", { withTimezone: true }),
});
