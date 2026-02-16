import { and, eq } from "drizzle-orm";
import type { ImageComparison } from "../schema";
import { componentsTable } from "../schema";
import { db } from "../index";

export type ComponentInsert = {
  userId: number;
  title: string;
  imageComparisons?: ImageComparison[];
  markdownId?: number | null;
};

export type ComponentUpdate = {
  title?: string;
  imageComparisons?: ImageComparison[];
  markdownId?: number | null;
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
  const [row] = await db
    .select()
    .from(componentsTable)
    .where(and(eq(componentsTable.id, id), eq(componentsTable.userId, userId)));
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
  const [row] = await db
    .update(componentsTable)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.imageComparisons !== undefined && {
        imageComparisons: data.imageComparisons,
      }),
      ...(data.markdownId !== undefined && { markdownId: data.markdownId }),
    })
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
