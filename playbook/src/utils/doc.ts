import { Block } from "~/types/document";

export const blocks: Block[] = [
  {
    id: "1",
    content: "",
    type: "text" as const,
    blocks: [],
  },
];
// export const blocks: Block[] = [
//   {
//     id: "1",
//     content: "Hello, Hello, world!llo, world!llo, world!llo",
//     type: "text" as const,
//     blocks: [
//       {
//         id: "1111",
//         content: "Hello, worlssssd!",
//         type: "text" as const,
//         blocks: [],
//       },
//     ],
//   },
//   {
//     id: "2",
//     content: "Hello, world!",
//     type: "text" as const,
//     blocks: [],
//   },
//   {
//     id: "3",
//     content:
//       "Hello, Hello, world!llo, world!llo, world!llo, world!llo,Hello, Hello, world!llo, world!llo, world!llo, world!llo,Hello, Hello, world!llo, world!llo, world!llo, world!llo,Hello, Hello, world!llo, world!llo, world!llo, world!llo,Hello, Hello, world!llo, world!llo, world!llo, world!llo,Hello, Hello, world!llo, world!llo, world!llo, world!llo,",
//     type: "ol" as const,
//     order: 1,
//     blocks: [
//       {
//         id: "3s3e",
//         content: "Hello, world!",
//         type: "ol" as const,
//         order: 1,
//         blocks: [],
//       },
//       {
//         id: "3s3",
//         content: "Hello, world!",
//         type: "ol" as const,
//         order: 1,
//         blocks: [],
//       },
//       {
//         id: "3se",
//         content: "Hello, world!",
//         type: "ol" as const,
//         order: 1,
//         blocks: [],
//       },
//     ],
//   },
// ];
