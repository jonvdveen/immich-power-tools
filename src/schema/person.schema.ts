import { pgTable, uuid, varchar, timestamp, boolean, date, pgEnum } from "drizzle-orm/pg-core";

/**
 * Immich's people.
 *
 * **Immich 3.x moved the goalposts here.** `person` used to have its own `id`
 * primary key, and a face pointed at it via `asset_face."personId"`. Neither
 * column exists any more:
 *
 *   - Face clusters now live in their own table, `person_group`, and a face
 *     points at *that* (`asset_face."personGroupId"`).
 *   - A `person` row is no longer the person — it is one owner's *naming* of a
 *     person group. Its primary key is `(ownerId, personGroupId)`, so two users
 *     can name the same cluster differently.
 *
 * Immich's REST API did not change: `PersonResponseDto.id` is still an `id`,
 * and every endpoint that takes a person id still takes one. That id is the
 * `personGroupId`. So the mapping below is the honest one — the app and the
 * Immich API agree on the name, and this schema absorbs the column rename,
 * which is exactly what an ORM mapping is for.
 *
 * **The trap:** `personGroupId` is only unique *per owner*. Anywhere a query
 * joins or deletes by it, it must also constrain `ownerId`, or it will reach
 * into other users' rows. Under the old schema `person.id` was globally unique
 * and that was free. It is not free now.
 */
export const person = pgTable("person", {
  /** The `personGroupId` column — see the note above on why it is called `id`. */
  id: uuid("personGroupId").primaryKey(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  ownerId: uuid("ownerId").notNull(),
  name: varchar("name").notNull().default(''),
  thumbnailPath: varchar("thumbnailPath").notNull().default(''),
  isHidden: boolean("isHidden").notNull().default(false),
  birthDate: date("birthDate", { mode: "date" }),
  faceAssetId: uuid("faceAssetId"),
});

export type Person = typeof person.$inferSelect;
