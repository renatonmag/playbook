import type { APIEvent } from "@solidjs/start/server";

import { createRouteHandler } from "uploadthing/server";

import { uploadRouter } from "~/ut/uploadthing";

import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

const handler = createRouteHandler({
  router: uploadRouter,
});

export const GET = (event: APIEvent) => handler(event.request);
export const POST = (event: APIEvent) => handler(event.request);
export const DELETE = async (event: APIEvent) => {
  let fileKeys: string[] = [];
  try {
    fileKeys = await event.request.json();
    if (!fileKeys || !Array.isArray(fileKeys)) {
      return new Response(
        JSON.stringify({ error: "File keys is array and is required" }),
        {
          status: 400,
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Problem with request.body" }),
      {
        status: 500,
      }
    );
  }

  const response = await utapi.deleteFiles(fileKeys);

  if (!response.success) {
    return new Response(JSON.stringify({ error: "Error deleting files" }), {
      status: 500,
    });
  }

  return response;
};
