import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  strategies: defineTable({
    // A strategy group will have an ID and a name
    name: v.string(),
    // You can add other fields as needed, e.g., userId to link it to a user
  }),

  documents: defineTable({
    // A document will have an ID and a title
    title: v.string(),
    // The link to the parent strategy group
    strategyId: v.id("strategies"),
    // The blocks are an array of objects
    blocks: v.array(
      v.object({
        id: v.string(),
        content: v.string(),
        type: v.string(),
        galleryId: v.optional(v.id("galleries")), // assuming images are stored as an array of URLs or IDs
      })
    ),
    ownerId: v.id("users"), // Assumes you have a 'users' table
    isPublic: v.boolean(),
    forkedFromId: v.optional(v.id("documents")),
  }),
  galleries: defineTable({
    // A gallery to group images
    name: v.string(),
    // An array of image IDs that belong to this gallery
    images: v.array(v.string()),
  }),

  users: defineTable({
    // Add user-related fields here, like email, name, etc.
    email: v.string(),
  }),
});
