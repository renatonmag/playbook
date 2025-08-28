import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  strategies: defineTable({
    // A strategy group will have an ID and a name
    name: v.string(),
  }),

  documents: defineTable({
    title: v.string(),
    strategyId: v.id("strategies"),
    blocks: v.array(v.id("blocks")),
  }),

  blocks: defineTable({
    type: v.union(
      v.literal("text"),
      v.literal("ul"),
      v.literal("ol"),
      v.literal("checkbox"),
      v.literal("radio")
    ),
    content: v.optional(v.string()),
    checked: v.optional(v.boolean()),
    pollId: v.optional(v.id("polls")),
    galleryId: v.optional(v.id("galleries")),
  }).index("by_poll_id", ["pollId"]),

  galleries: defineTable({
    name: v.string(),
    urls: v.array(v.string()),
  }),

  polls: defineTable({
    documentId: v.id("documents"),
    title: v.string(),
    optionCounts: v.record(v.id("blocks"), v.number()),
  }),

  users: defineTable({
    // Add user-related fields here, like email, name, etc.
    email: v.string(),
  }),
});
