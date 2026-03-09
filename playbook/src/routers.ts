import * as z from "zod";
import { authed } from "./orpc";
import {
  createComponent as _createComponent,
  listComponentsByUser as _listComponentsByUser,
  updateComponent as _updateComponent,
  getComponentById as _getComponentById,
  deleteComponent as _deleteComponent,
} from "~/db/queries/componentsCRUD";
import {
  updateSetupsRow as _updateSetups,
  createSetupsRow as _createSetups,
  listSetupsRowsByUser,
  updateSetupsRowStrategies as _updateStrategies,
} from "~/db/queries/setupsCRUD";
import {
  createStrategy as _createStrategy,
  listStrategiesByUser as _listStrategiesByUser,
  getStrategyById as _getStrategyById,
  updateStrategy as _updateStrategy,
  deleteStrategy as _deleteStrategy,
} from "~/db/queries/strategyCRUD";
import { ORPCError } from "@orpc/server";

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
  categories: z.string().nullable(),
  markdownId: z.number().int().nullable(),
  markdown: z
    .object({
      id: z.number().int(),
      content: z.string(),
      userId: z.number().int(),
    })
    .optional()
    .nullable(),
  questions: z.array(z.any()).optional(),
});

export const createComponent = authed
  .route({
    method: "POST",
    path: "/components",
  })
  .input(
    z.object({
      title: z.string().trim().min(1),
      kind: z.string().trim().min(1).optional(),
      strategyId: z.number().int(),
    }),
  )
  // .output(ComponentSchema) // Matches your Drizzle return type
  .handler(async ({ context, input }) => {
    try {
      const row = await _createComponent({
        userId: context.user.id,
        title: input.title,
        kind: input.kind,
        strategyId: input.strategyId,
      });

      return row;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      console.error(`POST /api/components`, message);
      throw new ORPCError("CONFLICT", { message });
    }
  });

export const listComponentsByUser = authed
  .route({
    method: "GET",
    path: "/components",
  })
  // .output(z.array(ComponentSchema))
  .handler(async ({ context }) => {
    try {
      const components = await _listComponentsByUser(context.user.id);
      console.log("components");
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
      exemples: z.array(z.any()).optional(),
      categories: z.string().optional(),
      questions: z.array(z.any()).optional(),
      details: z.array(z.number()).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
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

const createTrades = authed
  .route({
    method: "POST",
    path: "/trades",
  })
  .input(
    z
      .object({
        setups: z.array(
          z.object({
            version: z.number().int(),
            id: z.string(),
            selectedComps: z.array(z.any()),
            result: z.string(),
          }),
        ),
      })
      .optional(),
  )
  .handler(async ({ context, input }) => {
    try {
      const row = await _createSetups({
        userId: context.user.id,
        setups2: input?.setups,
      });

      return row;
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Internal server error",
      );
    }
  });

const updateTrades = authed
  .route({
    method: "PUT",
    path: "/trades/:id",
  })
  .input(
    z.object({
      id: z.number(),
      setups: z.array(z.any()),
    }),
  )
  .handler(async ({ context, input }) => {
    try {
      const row = await _updateSetups(input.id, context.user.id, input.setups);

      if (row === null) {
        throw new Error("Setup not found"); // oRPC will catch and you can map to 404
      }

      return row;
    } catch (err) {
      console.error(`PUT /api/setups/${input.id}`, err);
      throw new Error(
        err instanceof Error ? err.message : "Internal server error",
      );
    }
  });

const listTradeSessions = authed
  .route({
    method: "GET",
    path: "/sessions",
  })
  .handler(async ({ context, input }) => {
    try {
      console.log("sessions 1");
      const sessions = await listSetupsRowsByUser(context.user.id);
      console.log("sessions 2");
      return sessions;
    } catch (err) {
      console.log("sessions err", err);
      throw new Error(err instanceof Error ? err.message : "Database error");
    }
  });

const createStrategy = authed
  .route({ method: "POST", path: "/strategies" })
  .input(z.object({ name: z.string().trim().min(1), description: z.string().optional() }))
  .handler(async ({ context, input }) => {
    try {
      const row = await _createStrategy({ userId: context.user.id, ...input });
      return row;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("POST /api/strategies", message);
      throw new ORPCError("CONFLICT", { message });
    }
  });

const listStrategiesByUser = authed
  .route({ method: "GET", path: "/strategies" })
  .handler(async ({ context }) => {
    try {
      return await _listStrategiesByUser(context.user.id);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Database error");
    }
  });

const getStrategyById = authed
  .route({ method: "GET", path: "/strategies/:id" })
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    try {
      const row = await _getStrategyById(input.id, context.user.id);
      if (row === null) throw new Error("Strategy not found");
      return row;
    } catch (err) {
      console.error(`GET /api/strategies/${input.id}`, err);
      throw new Error(err instanceof Error ? err.message : "Internal server error");
    }
  });

const updateStrategy = authed
  .route({ method: "PUT", path: "/strategies/:id" })
  .input(z.object({ id: z.number(), name: z.string().trim().min(1).optional(), description: z.string().optional() }))
  .handler(async ({ context, input }) => {
    const { id, ...data } = input;
    try {
      const row = await _updateStrategy(id, context.user.id, data);
      if (row === null) throw new Error("Strategy not found");
      return row;
    } catch (err) {
      console.error(`PUT /api/strategies/${input.id}`, err);
      throw new Error(err instanceof Error ? err.message : "Internal server error");
    }
  });

const removeStrategy = authed
  .route({ method: "DELETE", path: "/strategies/:id" })
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    try {
      const row = await _deleteStrategy(input.id, context.user.id);
      if (row === null) throw new Error("Strategy not found");
      return row;
    } catch (err) {
      console.error(`DELETE /api/strategies/${input.id}`, err);
      throw new Error(err instanceof Error ? err.message : "Internal server error");
    }
  });

const updateTradeStrategies = authed
  .route({ method: "PUT", path: "/trades/:id/strategies" })
  .input(z.object({ id: z.number(), strategies: z.array(z.number()) }))
  .handler(async ({ context, input }) => {
    try {
      const row = await _updateStrategies(input.id, context.user.id, input.strategies);
      if (!row) throw new Error("Session not found");
      return row;
    } catch (err) {
      console.error(`PUT /api/trades/${input.id}/strategies`, err);
      throw new Error(err instanceof Error ? err.message : "Internal server error");
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
  trade: {
    create: createTrades,
    update: updateTrades,
    updateStrategies: updateTradeStrategies,
    listByUser: listTradeSessions,
  },
  strategy: {
    create: createStrategy,
    listByUser: listStrategiesByUser,
    getById: getStrategyById,
    update: updateStrategy,
    delete: removeStrategy,
  },
};
