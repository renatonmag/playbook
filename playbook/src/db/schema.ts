import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
export * from "./auth-schema";

// Define the shape of your image pair for TypeScript
export type ImageComparison = {
  before: number; // or number, depending on your imageid type
  after: number;
};

export type Question = {
  id: string;
  question: string;
  questionFunction: string;
  answers: Answer[];
};

export type Answer = {
  answer: string;
  consequence: { id: number; title: string; parentId: number };
};

export type Setup = {
  version: number;
  id: string;
  selectedComps: number[];
  detailsComps: number[];
  contextComps: number[];
  result: string;
};

export type SelectedComp = {
  component: number;
  details: number[];
};
export type Setup2 = {
  version: number;
  id: string;
  selectedComps: SelectedComp[];
  result: string;
  images?: { uri: string; key: string }[];
  setupNumber?: number;
  evolution?: number;
  asset?: string;
};

export const strategyTable = pgTable(
  "strategies",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .references(() => user.id)
      .notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    createdAt: timestamp().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.name)],
);

export const componentsTable = pgTable(
  "components",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .references(() => user.id)
      .notNull(),
    title: varchar({ length: 255 }).notNull(),
    strategyId: integer("strategy_id").references(() => strategyTable.id),
    imageComparisons: jsonb("image_comparisons")
      .$type<ImageComparison[]>()
      .notNull()
      .default([]),
    exemples: jsonb("exemples")
      .$type<{ uri: string; key: string }[]>() // array of image uri
      .notNull()
      .default([]),
    categories: varchar({ length: 255 }),
    // For 1-to-1, we store the reference here
    markdownId: integer("markdown_id").references(() => markdownTable.id),
    // `kind` can be "component" or "detail". Default is "component"
    kind: varchar({ length: 255 }).notNull().default("component"),
    questions: jsonb("questions").$type<Question[]>().notNull().default([]),
    details: jsonb("details").$type<number[]>().notNull().default([]),
  },
  (t) => [unique().on(t.userId, t.title, t.strategyId)],
);

export const setupsTable = pgTable("setups", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull(),
  createdAt: timestamp().defaultNow(),
  setups: jsonb("setups").$type<Setup[]>().notNull().default([]),
  setups2: jsonb("setups2").$type<Setup2[]>().notNull().default([]),
  strategies: jsonb("strategies").$type<number[]>().notNull().default([]),
});

export const imagesTable = pgTable("images", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull(),
  uri: text().notNull(),
  // For 1-to-Many, the image holds the reference to its parent component
  componentId: integer("component_id").references(() => componentsTable.id),
});

export const markdownTable = pgTable("markdown", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull(),
  content: text().notNull(), // Changed from varchar to text for long markdown
});

export const strategyRelations = relations(strategyTable, ({ one, many }) => ({
  user: one(user, {
    fields: [strategyTable.userId],
    references: [user.id],
  }),
  components: many(componentsTable),
}));

export const componentsRelations = relations(
  componentsTable,
  ({ one, many }) => ({
    user: one(user, {
      fields: [componentsTable.userId],
      references: [user.id],
    }),
    strategy: one(strategyTable, {
      fields: [componentsTable.strategyId],
      references: [strategyTable.id],
    }),
    markdown: one(markdownTable, {
      fields: [componentsTable.markdownId],
      references: [markdownTable.id],
    }),
    images: many(imagesTable),
  }),
);

export const imagesRelations = relations(imagesTable, ({ one }) => ({
  user: one(user, {
    fields: [imagesTable.userId],
    references: [user.id],
  }),
  component: one(componentsTable, {
    fields: [imagesTable.componentId],
    references: [componentsTable.id],
  }),
}));
