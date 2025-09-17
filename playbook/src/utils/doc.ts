import { Block } from "~/types/document";

export const blocks: Block[] = [
  {
    id: "1",
    content: "Hello, world!",
    type: "text" as const,
    children: [
      {
        id: "1.1",
        content: "Hello, world!",
        type: "text" as const,
      },
    ],
  },
  {
    id: "2",
    content: "Hello, world!",
    type: "text" as const,
  },
  {
    id: "3",
    content: "Hello, world!",
    type: "ol" as const,
    order: 1,
    children: [
      {
        id: "3s3e",
        content: "Hello, world!",
        type: "ol" as const,
        order: 1,
      },
    ],
  },
];
