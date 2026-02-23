import type { APIEvent } from "@solidjs/start/server";
import { createCategoryAndLinkToComponent } from "~/db/queries/categoriesCRUD";
import { jsonResponse } from "~/lib/utils";

export const POST = async (event: APIEvent) => {
    let body;
    try {
        body = await event.request.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    try {
        const category = await createCategoryAndLinkToComponent({
            userId: body.userId,
            componentId: body.componentId,
            name: body.name,
        });
        return jsonResponse(category);
    } catch (err) {
        console.error("GET /api/categories", err);
        return jsonResponse(
            { error: err instanceof Error ? err.message : "Internal server error" },
            500,
        );
    }
}