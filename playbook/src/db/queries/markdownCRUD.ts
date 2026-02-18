import { and, eq } from "drizzle-orm";
import { markdownTable } from "../schema";
import { db } from "../index";

export type MarkdownInsert = {
  userId: number;
  content: string;
};

export type MarkdownUpdate = {
  content?: string;
  userId?: number;
};

export const createMarkdown = async (data: MarkdownInsert) => {
  const [row] = await db
    .insert(markdownTable)
    .values({
      userId: data.userId,
      content: data.content,
    })
    .returning();
  return row;
};

export const getMarkdownById = async (id: number, userId: number) => {
  const [row] = await db
    .select()
    .from(markdownTable)
    .where(and(eq(markdownTable.id, id), eq(markdownTable.userId, userId)));
  return row ?? null;
};

export const listMarkdownsByUser = async (userId: number) => {
  return db
    .select()
    .from(markdownTable)
    .where(eq(markdownTable.userId, userId))
    .orderBy(markdownTable.id);
};

export const updateMarkdown = async (
  id: number,
  userId: number,
  data: MarkdownUpdate,
) => {
  const [row] = await db
    .update(markdownTable)
    .set({
      ...(data.content !== undefined && { content: data.content }),
      ...(data.userId !== undefined && { userId: data.userId }),
    })
    .where(and(eq(markdownTable.id, id), eq(markdownTable.userId, userId)))
    .returning();
  return row ?? null;
};

export const deleteMarkdown = async (id: number, userId: number) => {
  const [row] = await db
    .delete(markdownTable)
    .where(and(eq(markdownTable.id, id), eq(markdownTable.userId, userId)))
    .returning();
  return row ?? null;
};

export const updateOrCreateMarkdown = async (
  data: MarkdownInsert & { id?: number },
) => {
  // If id is provided, try to update existing markdown
  if (data.id !== undefined) {
    const existing = await getMarkdownById(data.id, data.userId);
    if (existing) {
      return updateMarkdown(data.id, data.userId, {
        content: data.content,
      });
    }
  }

  console.log("creating new markdown");

  // If no id provided or markdown doesn't exist, create new one
  return createMarkdown({
    userId: data.userId,
    content: data.content,
  });
};
