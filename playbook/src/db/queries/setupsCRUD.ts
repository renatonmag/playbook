import { and, eq } from "drizzle-orm";
import type { Setup, Setup2 } from "../schema";
import { setupsTable } from "../schema";
import { db } from "../index";

export type SetupsRowInsert = {
  userId: number;
  setups?: Setup[];
  setups2?: Setup2[];
};

export type SetupsRowUpdate = {
  setups?: Setup[];
};

export const createSetupsRow = async (data: SetupsRowInsert) => {
  const [row] = await db
    .insert(setupsTable)
    .values({
      userId: data.userId,
      setups2: data.setups2 ?? [],
      setups: data.setups ?? [],
    })
    .returning();
  return row;
};

export const getSetupsRowById = async (id: number, userId: number) => {
  const [row] = await db
    .select()
    .from(setupsTable)
    .where(and(eq(setupsTable.id, id), eq(setupsTable.userId, userId)));
  return row ?? null;
};

// export const getSetupsRowById = async (userId: number) => {
//   const [row] = await db
//     .select()
//     .from(setupsTable)
//     .where(eq(setupsTable.userId, userId))
//     .orderBy(setupsTable.id)
//     .limit(1);

//   return row ?? null;
// };

export const listSetupsRowsByUser = async (userId: number) => {
  return db
    .select()
    .from(setupsTable)
    .where(eq(setupsTable.userId, userId))
    .orderBy(setupsTable.id);
};

export const updateSetupsRow = async (
  id: number,
  userId: number,
  setups: Setup2[],
) => {
  const [row] = await db
    .update(setupsTable)
    .set({
      setups2: setups,
    })
    .where(and(eq(setupsTable.id, id), eq(setupsTable.userId, userId)))
    .returning();
  return row ?? null;
};

export const updateOrCreateSetupsRowByUser = async (data: {
  id: number;
  userId: number;
  setups: Setup[];
}) => {
  const existing = await getSetupsRowById(data.id, data.userId);
  if (existing) {
    return updateSetupsRow(existing.id, data.userId, { setups: data.setups });
  }
  return createSetupsRow({ userId: data.userId, setups: data.setups });
};

export const deleteSetupsRow = async (id: number, userId: number) => {
  const [row] = await db
    .delete(setupsTable)
    .where(and(eq(setupsTable.id, id), eq(setupsTable.userId, userId)))
    .returning();
  return row ?? null;
};

export const deleteAllSetupsRowsByUser = async (userId: number) => {
  return db.delete(setupsTable).where(eq(setupsTable.userId, userId));
};

export const listSetupsForUser = async (id: number, userId: number) => {
  const row = await getSetupsRowById(id, userId);
  return row?.setups ?? [];
};

export const getSetupItemForUser = async (
  id: number,
  userId: number,
  setupId: string,
) => {
  const row = await getSetupsRowById(id, userId);
  return row?.setups.find((s) => s.id === setupId) ?? null;
};

export const upsertSetupItemForUser = async (
  id: number,
  userId: number,
  setup: Setup,
) => {
  const row = await getSetupsRowById(id, userId);
  if (!row) {
    return createSetupsRow({ userId, setups: [setup] });
  }

  const existingIndex = row.setups.findIndex((s) => s.id === setup.id);
  const nextSetups =
    existingIndex === -1
      ? [...row.setups, setup]
      : row.setups.map((s, idx) => (idx === existingIndex ? setup : s));

  return updateSetupsRow(row.id, userId, { setups: nextSetups });
};

export type SetupItemPatch = Partial<Omit<Setup, "id">>;

export const patchSetupItemForUser = async (
  id: number,
  userId: number,
  setupId: string,
  patch: SetupItemPatch,
) => {
  const row = await getSetupsRowById(id, userId);
  if (!row) return null;

  const existingIndex = row.setups.findIndex((s) => s.id === setupId);
  if (existingIndex === -1) return null;

  const nextSetups = row.setups.map((s, idx) =>
    idx === existingIndex ? { ...s, ...patch, id: setupId } : s,
  );

  return updateSetupsRow(row.id, userId, { setups: nextSetups });
};

export const deleteSetupItemForUser = async (
  id: number,
  userId: number,
  setupId: string,
) => {
  const row = await getSetupsRowById(id, userId);
  if (!row) return null;

  const nextSetups = row.setups.filter((s) => s.id !== setupId);
  if (nextSetups.length === row.setups.length) return null;

  return updateSetupsRow(row.id, userId, { setups: nextSetups });
};
