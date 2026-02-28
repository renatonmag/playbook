import { and, DrizzleQueryError, eq } from "drizzle-orm";
import type { ImageComparison } from "../schema";
import { componentsTable } from "../schema";
import { db } from "../index";
import { updateOrCreateMarkdown } from "./markdownCRUD";
import {
  createCategoryAndLinkToComponent,
  updateCategory,
} from "./categoriesCRUD";

export type ComponentInsert = {
  userId: number;
  title: string;
  kind?: string;
  imageComparisons?: ImageComparison[];
  markdownId?: number | null;
};

export type ComponentUpdate = {
  title?: string;
  imageComparisons?: ImageComparison[];
  exemples?: number[];
  userId?: number;
  markdownId?: number;
  categories?: string;
  markdown?: string;
};

export const createComponent = async (data: ComponentInsert) => {
  try {
    const [row] = await db
      .insert(componentsTable)
      .values({
        userId: data.userId,
        title: data.title,
        kind: data.kind,
        imageComparisons: data.imageComparisons ?? [],
        markdownId: data.markdownId ?? null,
      })
      .returning();
    return row;
  } catch (err) {
    if (err instanceof DrizzleQueryError) {
      if (err?.cause?.constraint_name == "components_user_id_title_unique")
        throw new Error("Duplicate component");
    }
    throw new Error("Failed to create component");
  }
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
  return await db.query.componentsTable.findMany({
    where: (components, { eq }) => eq(components.userId, userId),
    with: {
      markdown: true, // This joins the markdownTable automatically
    },
  });
};

export const updateComponent = async (
  id: number,
  userId: number,
  data: ComponentUpdate,
) => {
  let markdownId = data.markdownId;
  // Handle markdown creation or update if markdown data is provided
  if (data.markdown !== undefined) {
    try {
      const newMarkdown = await updateOrCreateMarkdown({
        userId,
        id: data.markdownId,
        content: data.markdown,
      });
      markdownId = newMarkdown.id;
    } catch (err) {
      throw new Error("Failed to create or update markdown");
    }
  }

  // Update component with all fields
  const updateData: Partial<typeof componentsTable.$inferInsert> = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.imageComparisons !== undefined && {
      imageComparisons: data.imageComparisons,
    }),
    ...(data.exemples !== undefined && { exemples: data.exemples }),
    ...(data.categories !== undefined && { categories: data.categories }),
  };

  // Handle markdownId: prioritize explicit markdownId, otherwise use the one from markdown handling
  if (markdownId !== undefined) {
    updateData.markdownId = markdownId;
  }

  console.log(data);

  const [row] = await db
    .update(componentsTable)
    .set(data)
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
