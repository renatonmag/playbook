import type { APIEvent } from "@solidjs/start/server";
import {
  createComponent,
  listComponentsByUser,
  type ComponentInsert,
} from "~/db/queries/componentsCRUD";

const parseUserId = (event: APIEvent): number | null => {
  const url = new URL(event.request.url);
  const userId = url.searchParams.get("userId");
  if (userId === null) return null;
  const n = parseInt(userId, 10);
  return Number.isNaN(n) ? null : n;
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET = async (event: APIEvent) => {
  const userId = parseUserId(event);
  if (userId === null) {
    return jsonResponse(
      { error: "Missing or invalid query parameter: userId" },
      400,
    );
  }
  try {
    const components = await listComponentsByUser(userId);
    return jsonResponse(components);
  } catch (err) {
    console.error("GET /api/components", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
};

export const POST = async (event: APIEvent) => {
  let body: Partial<ComponentInsert>;
  try {
    body = await event.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const userId = typeof body.userId === "number" ? body.userId : null;
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : null;
  if (userId === null || title === null) {
    return jsonResponse(
      {
        error: "Body must include userId (number) and title (non-empty string)",
      },
      400,
    );
  }
  try {
    const row = await createComponent({
      userId,
      title,
      imageComparisons: body.imageComparisons,
      markdownId: body.markdownId,
    });
    return jsonResponse(row, 201);
  } catch (err) {
    console.error("POST /api/componentsApi", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
};
