import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  handler: async (ctx) => {
    return await ctx.db.query("documents").collect();
  },
});

export const getDocuments = query({
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").collect();
    return await Promise.all(
      docs.map(async (d) => {
        const blockObjs = await Promise.all(
          (d.blocks ?? []).map(async (blockId) => {
            const block = await ctx.db.get(blockId);
            if (!block) return null;
            return {
              id: block._id,
              type: block.type,
              content: block.content,
              images: [],
            };
          })
        );
        return {
          _id: d._id,
          title: d.title,
          blocks: blockObjs.filter((block) => block !== null),
        };
      })
    );
  },
});

export const createDocument = mutation({
  args: {
    title: v.optional(v.string()),
    strategyId: v.id("strategies"),
  },
  handler: async (ctx, args) => {
    const firstBlockId = await ctx.db.insert("blocks", {
      type: "text",
      content: "",
    });

    const documentId = await ctx.db.insert("documents", {
      title: args.title ?? "Untitled",
      strategyId: args.strategyId,
      blocks: [firstBlockId],
    });

    return { documentId, firstBlockId };
  },
});

export const getDocumentById = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;

    const blocks = await Promise.all(
      (doc.blocks ?? []).map((blockId) => ctx.db.get(blockId))
    );

    return {
      document: { _id: doc._id, title: doc.title, blocks: doc.blocks },
      blocks: blocks.filter((b): b is NonNullable<typeof b> => Boolean(b)),
    };
  },
});

export const addBlock = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return { blockId: null };

    const blockId = await ctx.db.insert("blocks", {
      type: "text",
      content: "",
    });

    const updatedBlocks = [...(doc.blocks ?? []), blockId];
    await ctx.db.patch(args.documentId, { blocks: updatedBlocks });

    return { blockId };
  },
});

export const updateBlock = mutation({
  args: {
    blockId: v.id("blocks"),
    content: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("text"),
        v.literal("ul"),
        v.literal("ol"),
        v.literal("checkbox"),
        v.literal("radio")
      )
    ),
    checked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const block = await ctx.db.get(args.blockId);
    if (!block) return { success: false };

    const updates: Record<string, unknown> = {};
    if (args.content !== undefined) updates.content = args.content;
    if (args.type !== undefined) updates.type = args.type;
    if (args.checked !== undefined) updates.checked = args.checked;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.blockId, updates);
    }
    return { success: true };
  },
});

export const removeBlock = mutation({
  args: {
    documentId: v.id("documents"),
    blockId: v.id("blocks"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return { success: false, reason: "document_not_found" };

    const blocks = doc.blocks ?? [];
    if (blocks.length <= 1) {
      return { success: false, reason: "cannot_remove_last_block" };
    }
    // TODO: check if blocks and updateBlocks have the same length
    const contains = blocks.some((b) => b === args.blockId);
    if (!contains) {
      return { success: false, reason: "block_not_in_document" };
    }

    const updatedBlocks = blocks.filter((b) => b !== args.blockId);
    await ctx.db.patch(args.documentId, { blocks: updatedBlocks });
    await ctx.db.delete(args.blockId);

    return { success: true };
  },
});

export const deleteDocument = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return { success: false, reason: "document_not_found" };

    const blocks = doc.blocks ?? [];
    for (const blockId of blocks) {
      await ctx.db.delete(blockId);
    }

    await ctx.db.delete(args.documentId);
    return { success: true };
  },
});
