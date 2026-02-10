import { relations } from "drizzle-orm";
import { integer, pgTable, text, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    firstName: varchar({ length: 255 }).notNull(),
    lastName: varchar({ length: 255 }).notNull(),
    userName: varchar({ length: 255 }).notNull(),
    age: integer().notNull(),
    email: varchar({ length: 255 }).notNull().unique(),
});

export const componentsTable = pgTable("components", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 255 }).notNull(),
    // For 1-to-1, we store the reference here
    markdownId: integer("markdown_id").references(() => markdownTable.id),
  });
  
  export const imagesTable = pgTable("images", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    uri: text().notNull(),
    // For 1-to-Many, the image holds the reference to its parent component
    componentId: integer("component_id").references(() => componentsTable.id),
  });
  
  export const markdownTable = pgTable("markdown", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 255 }).notNull(),
    content: text().notNull(), // Changed from varchar to text for long markdown
  });
  
  export const checklistTable = pgTable("checklist", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 255 }).notNull(),
  });
  
  // junction table for Checklist <-> Components if a component can be in multiple checklists
  export const checklistToComponents = pgTable("checklist_to_components", {
    checklistId: integer("checklist_id").references(() => checklistTable.id),
    componentId: integer("component_id").references(() => componentsTable.id),
  });

export const componentsRelations = relations(componentsTable, ({ one, many }) => ({
    markdown: one(markdownTable, {
      fields: [componentsTable.markdownId],
      references: [markdownTable.id],
    }),
    images: many(imagesTable),
  }));
  
export const imagesRelations = relations(imagesTable, ({ one }) => ({
    component: one(componentsTable, {
      fields: [imagesTable.componentId],
      references: [componentsTable.id],
    }),
  }));