import type { APIEvent } from "@solidjs/start/server";
import {
  deleteComponent,
  getComponentById,
  updateComponent,
  type ComponentUpdate,
} from "~/db/queries/componentsCRUD";

const parseId = (params: APIEvent["params"]): number | null => {
  const id = params?.id;
  if (id === undefined || id === null) return null;
  const n = parseInt(String(id), 10);
  return Number.isNaN(n) ? null : n;
};

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
  const id = parseId(event.params);
  const userId = parseUserId(event);
  if (id === null) {
    return jsonResponse({ error: "Invalid or missing id" }, 400);
  }
  if (userId === null) {
    return jsonResponse(
      { error: "Missing or invalid query parameter: userId" },
      400,
    );
  }
  try {
    const component = await getComponentById(id, userId);
    if (component === null) {
      return jsonResponse({ error: "Component not found" }, 404);
    }
    return jsonResponse(component);
  } catch (err) {
    console.error("GET /api/componentsApi/[id]", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
};

export const PATCH = async (event: APIEvent) => {
  const id = parseId(event.params);
  const userId = parseUserId(event);
  if (id === null) {
    return jsonResponse({ error: "Invalid or missing id" }, 400);
  }
  if (userId === null) {
    return jsonResponse(
      { error: "Missing or invalid query parameter: userId" },
      400,
    );
  }
  let body: Partial<ComponentUpdate>;
  try {
    body = await event.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const data: ComponentUpdate = {};
  if (typeof body?.title === "string") data.title = body.title.trim();
  if (Array.isArray(body?.imageComparisons))
    data.imageComparisons = body.imageComparisons;
  if (body?.markdownId !== undefined)
    data.markdownId = body.markdownId === null ? null : body.markdownId;
  try {
    const row = await updateComponent(id, userId, data);
    if (row === null) {
      return jsonResponse({ error: "Component not found" }, 404);
    }
    return jsonResponse(row);
  } catch (err) {
    console.error("PATCH /api/componentsApi/[id]", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
};

export const DELETE = async (event: APIEvent) => {
  const id = parseId(event.params);
  const userId = parseUserId(event);
  if (id === null) {
    return jsonResponse({ error: "Invalid or missing id" }, 400);
  }
  if (userId === null) {
    return jsonResponse(
      { error: "Missing or invalid query parameter: userId" },
      400,
    );
  }
  try {
    const row = await deleteComponent(id, userId);
    if (row === null) {
      return jsonResponse({ error: "Component not found" }, 404);
    }
    return jsonResponse(row);
  } catch (err) {
    console.error("DELETE /api/componentsApi/[id]", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal server error" },
      500,
    );
  }
};
