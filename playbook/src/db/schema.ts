import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  firstName: varchar({ length: 255 }).notNull(),
  lastName: varchar({ length: 255 }).notNull(),
  userName: varchar({ length: 255 }).notNull(),
  age: integer().notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
});

// Define the shape of your image pair for TypeScript
export type ImageComparison = {
  before: number; // or number, depending on your imageid type
  after: number;
};

export const componentsTable = pgTable("components", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .references(() => usersTable.id)
    .notNull(),
  title: varchar({ length: 255 }).notNull(),
  imageComparisons: jsonb("image_comparisons")
    .$type<ImageComparison[]>()
    .notNull()
    .default([]),
  exemples: jsonb("exemples")
    .$type<{ uri: string; fileHash: string }[]>() // array of image uri
    .notNull()
    .default([]),
  categories: varchar({ length: 255 }),
  // For 1-to-1, we store the reference here
  markdownId: integer("markdown_id").references(() => markdownTable.id),
});

export const imagesTable = pgTable("images", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .references(() => usersTable.id)
    .notNull(),
  uri: text().notNull(),
  // For 1-to-Many, the image holds the reference to its parent component
  componentId: integer("component_id").references(() => componentsTable.id),
});

export const markdownTable = pgTable("markdown", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .references(() => usersTable.id)
    .notNull(),
  content: text().notNull(), // Changed from varchar to text for long markdown
});

export const checklistTable = pgTable("checklist", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .references(() => usersTable.id)
    .notNull(),
  title: varchar({ length: 255 }).notNull(),
});

// 1. The Categories Master Table
export const categoriesTable = pgTable(
  "categories",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .references(() => usersTable.id)
      .notNull(),
    name: varchar({ length: 50 }).notNull(),
  },
  (t) => [unique().on(t.userId, t.name)],
);

// 2. The Join Table (Links Components to Categories)
export const componentToCategories = pgTable("component_to_categories", {
  componentId: integer("component_id").references(() => componentsTable.id),
  categoryId: integer("category_id").references(() => categoriesTable.id),
});

export const componentToCategoriesRelations = relations(
  componentToCategories,
  ({ one }) => ({
    component: one(componentsTable, {
      fields: [componentToCategories.componentId],
      references: [componentsTable.id],
    }),
    category: one(categoriesTable, {
      fields: [componentToCategories.categoryId],
      references: [categoriesTable.id],
    }),
  }),
);

// junction table for Checklist <-> Components if a component can be in multiple checklists
export const checklistToComponents = pgTable("checklist_to_components", {
  checklistId: integer("checklist_id").references(() => checklistTable.id),
  componentId: integer("component_id").references(() => componentsTable.id),
});

export const usersRelations = relations(usersTable, ({ many }) => ({
  components: many(componentsTable),
  images: many(imagesTable),
  checklists: many(checklistTable),
  categories: many(categoriesTable),
}));

export const componentsRelations = relations(
  componentsTable,
  ({ one, many }) => ({
    user: one(usersTable, {
      fields: [componentsTable.userId],
      references: [usersTable.id],
    }),
    markdown: one(markdownTable, {
      fields: [componentsTable.markdownId],
      references: [markdownTable.id],
    }),
    images: many(imagesTable),
    categoryLinks: many(componentToCategories),
  }),
);

export const imagesRelations = relations(imagesTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [imagesTable.userId],
    references: [usersTable.id],
  }),
  component: one(componentsTable, {
    fields: [imagesTable.componentId],
    references: [componentsTable.id],
  }),
}));

export const checklistRelations = relations(checklistTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [checklistTable.userId],
    references: [usersTable.id],
  }),
}));

export const categoriesRelations = relations(categoriesTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [categoriesTable.userId],
    references: [usersTable.id],
  }),
}));
