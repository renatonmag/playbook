import * as z from "zod";
import { authed } from "./orpc";
import {
  createComponent as _createComponent,
  listComponentsByUser as _listComponentsByUser,
  updateComponent as _updateComponent,
  getComponentById as _getComponentById,
  deleteComponent as _deleteComponent,
} from "~/db/queries/componentsCRUD";
import de from "zod/v4/locales/de.cjs";

// Define your Schema (matches your earlier componentsTable logic)
export const ComponentSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  title: z.string(),
  imageComparisons: z.array(
    z.object({
      before: z.number().int(),
      after: z.number().int(),
    }),
  ),
  exemples: z.array(
    z.object({
      uri: z.string(),
      key: z.string(),
    }),
  ),
  categories: z.string().nullable(), // or z.string().nullable() if allowed to be null
  markdownId: z.number().int().nullable(),
  markdown: z
    .object({
      id: z.number().int(),
      content: z.string(),
      userId: z.number().int(),
    })
    .optional()
    .nullable(),
});

export const createComponent = authed
  .route({
    method: "POST",
    path: "/components",
  })
  .input(
    z.object({
      title: z.string().trim().min(1),
    }),
  )
  .output(ComponentSchema) // Matches your Drizzle return type
  .handler(async ({ context, input }) => {
    try {
      const row = await _createComponent({
        userId: context.user.id, // Provided by authedProcedure middleware
        title: input.title,
      });

      return row;
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Internal server error",
      );
    }
  });

export const listComponentsByUser = authed
  .route({
    method: "GET",
    path: "/components",
  })
  .output(z.array(ComponentSchema))
  .handler(async ({ context, input }) => {
    try {
      const components = await _listComponentsByUser(context.user.id);
      return components;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Database error");
    }
  });

export const updateComponent = authed
  .route({
    method: "PUT",
    path: "/components/:id",
  })
  .input(
    z.object({
      id: z.number(),
      title: z.string().trim().optional(),
      imageComparisons: z.array(z.any()).optional(),
      markdownId: z.number().optional(),
      markdown: z.string().optional(),
      exemples: z
        .array(
          z.object({
            uri: z.string(),
            key: z.string(),
          }),
        )
        .optional(),
      categories: z.string().optional(),
      questions: z.array(z.any()).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    // Extracting data from validated input
    // Only includes fields that were actually sent in the request
    // const data: ComponentUpdate = {
    //   ...(input.title !== undefined && { title: input.title }),
    //   ...(input.imageComparisons !== undefined && { imageComparisons: input.imageComparisons }),
    //   ...(input.markdownId !== undefined && { markdownId: input.markdownId }),
    //   ...(input.markdown !== undefined && { markdown: input.markdown }),
    //   ...(input.exemples !== undefined && { exemples: input.exemples }),
    //   ...(input.categories !== undefined && { categories: input.categories }),
    // };

    const { id, ...data } = input;

    try {
      const row = await _updateComponent(id, context.user.id, data);

      if (row === null) {
        throw new Error("Component not found"); // oRPC will catch and you can map to 404
      }

      return row;
    } catch (err) {
      console.error(`PUT /api/components/${input.id}`, err);
      throw new Error(
        err instanceof Error ? err.message : "Internal server error",
      );
    }
  });

export const getComponentById = authed
  .route({
    method: "GET",
    path: "/components/:id",
  })
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ context, input }) => {
    try {
      // ctx.userId is provided by the authedProcedure middleware
      const component = await _getComponentById(input.id, context.user.id);

      if (component === null) {
        throw new Error("Component not found");
      }

      return component;
    } catch (err) {
      console.error(`GET /api/components/${input.id}`, err);
      throw new Error(
        err instanceof Error ? err.message : "Internal server error",
      );
    }
  });

export const removeComponent = authed
  .route({
    method: "DELETE",
    path: "/components/:id",
  })
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ context, input }) => {
    try {
      // context.userId is extracted via the middleware's parseUserId(context.event)
      const row = await _deleteComponent(input.id, context.user.id);

      if (row === null) {
        throw new Error("Component not found");
      }

      return row;
    } catch (err) {
      console.error(`DELETE /api/components/${input.id}`, err);
      throw new Error(
        err instanceof Error ? err.message : "Internal server error",
      );
    }
  });

export const router = {
  component: {
    listByUser: listComponentsByUser,
    create: createComponent,
    update: updateComponent,
    getById: getComponentById,
    delete: removeComponent,
  },
};
