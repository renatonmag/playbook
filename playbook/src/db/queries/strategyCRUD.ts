import { and, DrizzleQueryError, eq } from "drizzle-orm";
import { strategyTable } from "../schema";
import { db } from "../index";

export type StrategyInsert = {
  userId: string;
  name: string;
  description?: string;
};

export type StrategyUpdate = {
  name?: string;
  description?: string;
};

export const createStrategy = async (data: StrategyInsert) => {
  try {
    const [row] = await db
      .insert(strategyTable)
      .values({
        userId: data.userId,
        name: data.name,
        description: data.description,
      })
      .returning();
    return row;
  } catch (err) {
    if (err instanceof DrizzleQueryError) {
      if (err?.cause?.constraint_name == "strategies_user_id_name_unique")
        throw new Error("Duplicate strategy");
    }
    throw new Error("Failed to create strategy");
  }
};

export const listStrategiesByUser = async (userId: string) => {
  return await db.query.strategyTable.findMany({
    where: (strategies, { eq }) => eq(strategies.userId, userId),
  });
};

export const getStrategyById = async (id: number, userId: string) => {
  const row = await db.query.strategyTable.findFirst({
    where: (strategies, { and, eq }) =>
      and(eq(strategies.id, id), eq(strategies.userId, userId)),
  });
  return row ?? null;
};

export const updateStrategy = async (
  id: number,
  userId: string,
  data: StrategyUpdate,
) => {
  const updateData: Partial<typeof strategyTable.$inferInsert> = {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description }),
  };

  const [row] = await db
    .update(strategyTable)
    .set(updateData)
    .where(and(eq(strategyTable.id, id), eq(strategyTable.userId, userId)))
    .returning();
  return row ?? null;
};

export const deleteStrategy = async (id: number, userId: string) => {
  const [row] = await db
    .delete(strategyTable)
    .where(and(eq(strategyTable.id, id), eq(strategyTable.userId, userId)))
    .returning();
  return row ?? null;
};
