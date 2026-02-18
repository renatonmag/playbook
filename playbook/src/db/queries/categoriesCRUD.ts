import { and, eq } from "drizzle-orm";
import { categoriesTable, componentToCategories } from "../schema";
import { db } from "../index";

export type CategoryInsert = {
    userId: number;
    name: string;
};

export type CategoryUpdate = {
    name?: string;
    userId?: number;
};

export const createCategory = async (data: CategoryInsert) => {
    const [row] = await db
        .insert(categoriesTable)
        .values({
            userId: data.userId,
            name: data.name,
        })
        .returning();

    return row;
};

export const getCategoryById = async (id: number, userId: number) => {
    const [row] = await db
        .select()
        .from(categoriesTable)
        .where(and(eq(categoriesTable.id, id), eq(categoriesTable.userId, userId)));

    return row ?? null;
};

export const createCategoryAndLinkToComponent = async (
    data: CategoryInsert & { componentId: number },
) => {
    return await db.transaction(async (tx) => {
        // Create the category
        const [category] = await tx
            .insert(categoriesTable)
            .values({
                userId: data.userId,
                name: data.name,
            })
            .returning();

        // Link the category to the component
        await tx.insert(componentToCategories).values({
            componentId: data.componentId,
            categoryId: category.id,
        });

        return category;
    });
};

export const listCategoriesByUser = async (userId: number) => {
    return db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.userId, userId))
        .orderBy(categoriesTable.id);
};

export const updateCategory = async (
    id: number,
    userId: number,
    data: CategoryUpdate,
) => {
    const [row] = await db
        .update(categoriesTable)
        .set({
            ...(data.name !== undefined && { name: data.name }),
            ...(data.userId !== undefined && { userId: data.userId }),
        })
        .where(and(eq(categoriesTable.id, id), eq(categoriesTable.userId, userId)))
        .returning();

    return row ?? null;
};

export const deleteCategory = async (id: number, userId: number) => {
    const [row] = await db
        .delete(categoriesTable)
        .where(and(eq(categoriesTable.id, id), eq(categoriesTable.userId, userId)))
        .returning();

    return row ?? null;
};
