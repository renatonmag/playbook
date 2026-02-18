import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { APIEvent } from "@solidjs/start/server";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const parseId = (params: APIEvent["params"]): number | null => {
  const id = params?.id;
  if (id === undefined || id === null) return null;
  const n = parseInt(String(id), 10);
  return Number.isNaN(n) ? null : n;
};

export const parseUserId = (event: APIEvent): number | null => {
  const url = new URL(event.request.url);
  const userId = url.searchParams.get("userId");
  if (userId === null) return null;
  const n = parseInt(userId, 10);
  return Number.isNaN(n) ? null : n;
};

export const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });