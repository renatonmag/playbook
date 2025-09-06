import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getDocuments = query({
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").collect();
    return await Promise.all(
      docs.map(async (d) => {
        const blockObjs = await Promise.all(
          (d.blocks ?? []).map(async (blockId) => {
            const block = await ctx.db.get(blockId);
            if (!block) return null;
            let images: Array<{ url: string; key: string }> = [];
            if (block.galleryId) {
              const gallery = await ctx.db.get(block.galleryId);
              images =
                (gallery?.urls as Array<{ url: string; key: string }>) ?? [];
            }
            return {
              id: block._id,
              type: block.type,
              content: block.content,
              galleryId: block.galleryId,
              images: images.map((it) => ({
                id: it.key,
                filename: it.key,
                size: 0,
                type: "image/*",
                url: it.url,
              })),
            };
          })
        );
        return {
          id: d._id,
          title: d.title,
          blocks: blockObjs.filter((block) => block !== null),
        };
      })
    );
  },
});

export const listDocumentsByIds = query({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const docs = await Promise.all(
      args.documentIds.map((documentId) => ctx.db.get(documentId))
    );

    const validDocs = docs.filter((doc): doc is NonNullable<typeof doc> =>
      Boolean(doc)
    );

    const results = await Promise.all(
      validDocs.map(async (doc) => {
        const blocks = await Promise.all(
          (doc.blocks ?? []).map((blockId) => ctx.db.get(blockId))
        );

        return {
          _id: doc._id,
          title: doc.title,
          blocks: blocks.filter((b): b is NonNullable<typeof b> => Boolean(b)),
        };
      })
    );

    return results;
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
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const block = await ctx.db.get(args.blockId);
    if (!block) return { success: false };

    const updates: Record<string, unknown> = {};
    if (args.content !== undefined) updates.content = args.content;
    if (args.type !== undefined) updates.type = args.type;
    if (args.checked !== undefined) updates.checked = args.checked;
    if (args.order !== undefined) updates.order = args.order;

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

export const createGalleryAndLinkBlock = mutation({
  args: {
    blockId: v.id("blocks"),
  },
  handler: async (ctx, args) => {
    const block = await ctx.db.get(args.blockId);
    if (!block) {
      return { galleryId: null };
    }

    if (block.galleryId) {
      return { galleryId: block.galleryId };
    }

    const galleryId = await ctx.db.insert("galleries", { urls: [] });
    try {
      await ctx.db.patch(args.blockId, { galleryId });
    } catch (error) {
      // Roll back gallery creation to avoid orphaned gallery
      await ctx.db.delete(galleryId);
      throw error;
    }
    return { galleryId };
  },
});

export const appendGalleryUrls = mutation({
  args: {
    galleryId: v.id("galleries"),
    items: v.array(
      v.object({
        url: v.string(),
        key: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const gallery = await ctx.db.get(args.galleryId);
    if (!gallery) {
      return { countAppended: 0 };
    }

    const existing = gallery.urls ?? [];
    const updated = [...existing, ...args.items];
    await ctx.db.patch(args.galleryId, { urls: updated });

    return { countAppended: args.items.length };
  },
});

export const removeGalleryUrl = mutation({
  args: {
    galleryId: v.id("galleries"),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const gallery = await ctx.db.get(args.galleryId);
    if (!gallery) {
      return { removed: false } as const;
    }

    const urls = gallery.urls ?? [];
    const index = urls.findIndex((u) => u.key === args.key);
    if (index === -1) {
      return { removed: false } as const;
    }

    const updated = urls.slice(0, index).concat(urls.slice(index + 1));

    if (updated.length === 0) {
      // Unset the associated block's galleryId first, then delete gallery to avoid orphaned references
      const block = await ctx.db
        .query("blocks")
        .filter((q) => q.eq(q.field("galleryId"), args.galleryId))
        .first();

      if (block) {
        await ctx.db.patch(block._id, { galleryId: undefined });
      }
      await ctx.db.delete(args.galleryId);

      return { removed: true, deletedGallery: true } as const;
    }

    await ctx.db.patch(args.galleryId, { urls: updated });
    return { removed: true, deletedGallery: false } as const;
  },
});

export const updateDocumentTitle = mutation({
  args: {
    documentId: v.id("documents"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      return { success: false, reason: "document_not_found" } as const;
    }
    await ctx.db.patch(args.documentId, { title: args.title });
    return { success: true } as const;
  },
});

export const createMessage = mutation({
  args: {
    chatId: v.id("chats"),
    content: v.string(),
    type: v.union(v.literal("ai"), v.literal("human"), v.literal("system")),
    usage_metadata: v.optional(
      v.object({
        input_tokens: v.number(),
        output_tokens: v.number(),
        total_tokens: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      chatId: args.chatId,
      content: args.content,
      type: args.type,
      usage_metadata: args.usage_metadata,
    });
  },
});
