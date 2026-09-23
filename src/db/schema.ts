import {
  pgTable,
  text,
  timestamp,
  integer,
  doublePrecision,
  date,
  uuid,
  jsonb,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable("staff_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  ...timestamps(),
});

export const benches = pgTable(
  "bench",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    description: text("description").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    state: text("state", { enum: ["in_service", "unavailable", "retired"] })
      .default("in_service")
      .notNull(),
    source: text("source", { enum: ["sample", "staff", "import"] }).notNull(),
    version: integer("version").default(1).notNull(),
    ...timestamps(),
  },
  (t) => [
    check("bench_latitude", sql`${t.latitude} BETWEEN -90 AND 90`),
    check("bench_longitude", sql`${t.longitude} BETWEEN -180 AND 180`),
    check(
      "bench_state",
      sql`${t.state} IN ('in_service', 'unavailable', 'retired')`,
    ),
  ],
);
export const donors = pgTable(
  "donor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    version: integer("version").default(1).notNull(),
    ...timestamps(),
  },
  (t) => [
    check("normalized_email", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);
export const adoptions = pgTable(
  "adoption",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    benchId: uuid("bench_id")
      .notNull()
      .references(() => benches.id),
    donorId: uuid("donor_id")
      .notNull()
      .references(() => donors.id),
    publicName: text("public_name"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    cancelledOn: date("cancelled_on"),
    source: text("source", {
      enum: ["sample", "guest", "staff", "import"],
    }).notNull(),
    requestId: uuid("request_id").unique(),
    requestHash: text("request_hash"),
    externalId: text("external_id").unique(),
    importHash: text("import_hash"),
    version: integer("version").default(1).notNull(),
    ...timestamps(),
  },
  (t) => [
    check("adoption_positive_period", sql`${t.endsOn} > ${t.startsOn}`),
    check(
      "adoption_valid_cancellation",
      sql`${t.cancelledOn} IS NULL OR ${t.cancelledOn} >= ${t.startsOn}`,
    ),
    index("adoption_bench_idx").on(t.benchId),
    index("adoption_donor_idx").on(t.donorId),
    index("adoption_ends_idx").on(t.endsOn),
  ],
);
export const auditEvents = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").references(() => users.id),
    origin: text("origin").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)],
);
export const submissionLimits = pgTable("submission_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
});
export const importBatches = pgTable(
  "import_batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fingerprint: text("fingerprint").notNull(),
    kind: text("kind").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("import_request_idx").on(t.fingerprint, t.actorId)],
);
