import type { APIEvent } from "@solidjs/start/server";

import { createCategoryAndLinkToComponent, updateCategory } from "~/db/queries/categoriesCRUD";
import { jsonResponse, parseId } from "~/lib/utils";

export const PUT = async (event: APIEvent) => {
    console.log("updating category")
    const id = parseId(event.params);
    let body;
    try {
        body = await event.request.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const userId = body.userId;
    if (id === null) {
        return jsonResponse({ error: "Invalid or missing id" }, 400);
    }
    if (!userId) {
        return jsonResponse(
            { error: "Missing or invalid body parameter: userId" },
            400,
        );
    }

    let category

    // Handle categories
    if (body.categories?.id === undefined) {
        try {
            category = await createCategoryAndLinkToComponent({
                userId,
                componentId: id,
                name: body.categories.name,
            });
        } catch (err) {
            throw new Error("Failed to create or update categories");
        }
    }
    else if (body.categories.id !== undefined) {
        try {
            category = await updateCategory(body.categories.id, userId, {
                name: body.categories.name,
            });
        } catch (err) {
            throw new Error("Failed to create or update categories");
        }
    }

    if (category === null) {
        return jsonResponse({ error: "Category not found" }, 404);
    }

    return jsonResponse(category);
}