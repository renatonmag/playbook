import { and, eq } from "drizzle-orm";
import type { ImageComparison } from "../schema";
import { componentsTable } from "../schema";
import { db } from "../index";
import { updateOrCreateMarkdown } from "./markdownCRUD";

export type ComponentInsert = {
  userId: number;
  title: string;
  imageComparisons?: ImageComparison[];
  markdownId?: number | null;
};

export type ComponentUpdate = {
  title?: string;
  imageComparisons?: ImageComparison[];
  exemples?: number[];
  userId?: number;
  markdownId?: number;
  markdown?: string;
};

export const createComponent = async (data: ComponentInsert) => {
  const [row] = await db
    .insert(componentsTable)
    .values({
      userId: data.userId,
      title: data.title,
      imageComparisons: data.imageComparisons ?? [],
      markdownId: data.markdownId ?? null,
    })
    .returning();
  return row;
};

export const getComponentById = async (id: number, userId: number) => {
  const row = await db.query.componentsTable.findFirst({
    where: (components, { and, eq }) =>
      and(eq(components.id, id), eq(components.userId, userId)),
    with: {
      markdown: true, // This joins the markdownTable automatically
    },
  });

  return row ?? null;
};

export const listComponentsByUser = async (userId: number) => {
  return db
    .select()
    .from(componentsTable)
    .where(eq(componentsTable.userId, userId))
    .orderBy(componentsTable.id);
};

export const updateComponent = async (
  id: number,
  userId: number,
  data: ComponentUpdate,
) => {
  let markdownId = data.markdownId;
  // Handle markdown creation or update if markdown data is provided
  if (data.markdown !== undefined) {
    const newMarkdown = await updateOrCreateMarkdown({
      userId,
      id: data.markdownId,
      content: data.markdown,
    });
    markdownId = newMarkdown.id;
  }

  // Update component with all fields
  const updateData: Partial<typeof componentsTable.$inferInsert> = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.imageComparisons !== undefined && {
      imageComparisons: data.imageComparisons,
    }),
    ...(data.exemples !== undefined && { exemples: data.exemples }),
  };

  // Handle markdownId: prioritize explicit markdownId, otherwise use the one from markdown handling
  if (markdownId !== undefined) {
    updateData.markdownId = markdownId;
  }

  const [row] = await db
    .update(componentsTable)
    .set(updateData)
    .where(and(eq(componentsTable.id, id), eq(componentsTable.userId, userId)))
    .returning();
  return row ?? null;
};

export const deleteComponent = async (id: number, userId: number) => {
  const [row] = await db
    .delete(componentsTable)
    .where(and(eq(componentsTable.id, id), eq(componentsTable.userId, userId)))
    .returning();
  return row ?? null;
};
