import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { componentsTable } from "../schema";

const USER_ID = "8uheCEwi7w0x4KktkKBv22XRgqsafucc";

const components: (typeof componentsTable.$inferInsert)[] = [
  {
    userId: USER_ID,
    title: "sideways",
    markdownId: null,
    imageComparisons: [],
    exemples: [
      { key: "H7Ptp2XUgmWuxVWcWGQTtTWqmXS0QM8hOZVpBsnUH7y3gjoc", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuxVWcWGQTtTWqmXS0QM8hOZVpBsnUH7y3gjoc" },
      { key: "H7Ptp2XUgmWuGNVcKG1dwqM5Rp4Yx2POHcjJDZk6szNTQBKa", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuGNVcKG1dwqM5Rp4Yx2POHcjJDZk6szNTQBKa" },
      { key: "H7Ptp2XUgmWurwn2eDBtPwZ1a4ipr0RFY8T9XmU3267fhLQI", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWurwn2eDBtPwZ1a4ipr0RFY8T9XmU3267fhLQI" },
    ],
    categories: "pullback",
    questions: [],
    kind: "component",
  },
  {
    userId: USER_ID,
    title: "pullback",
    markdownId: null,
    imageComparisons: [],
    exemples: [
      { key: "H7Ptp2XUgmWukwoPaG0HaiUJIZvdQN6yW8GwKx4BqtCE02F5", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWukwoPaG0HaiUJIZvdQN6yW8GwKx4BqtCE02F5" },
      { key: "H7Ptp2XUgmWu8bYg5mGc19LQj5Pao7Sbt0TEKBRmkeVY4iZA", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWu8bYg5mGc19LQj5Pao7Sbt0TEKBRmkeVY4iZA" },
      { key: "H7Ptp2XUgmWurmEj8ZBtPwZ1a4ipr0RFY8T9XmU3267fhLQI", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWurmEj8ZBtPwZ1a4ipr0RFY8T9XmU3267fhLQI" },
      { key: "H7Ptp2XUgmWuxW6ZqBTtTWqmXS0QM8hOZVpBsnUH7y3gjoc5", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuxW6ZqBTtTWqmXS0QM8hOZVpBsnUH7y3gjoc5" },
    ],
    categories: null,
    questions: [
      {
        id: "5a432c12-f2bc-4d74-8a05-84cabda7dd20",
        question: "Grande ou pequeno?",
        questionFunction: "Especificação",
        answers: [
          { answer: "Grande", consequence: { id: 14, title: "big pb", parentId: 3 } },
          { answer: "Pequeno", consequence: { id: 13, title: "small pb", parentId: 3 } },
        ],
      },
      {
        id: "8921a954-d0b4-42dd-8b50-a17c42e794ac",
        question: "Sideways or trending?",
        questionFunction: "Contexto",
        answers: [
          { answer: "Sideways", consequence: { id: 1, title: "sideways", parentId: 3 } },
          { answer: "Trending", consequence: { id: 15, title: "trending pb", parentId: 3 } },
        ],
      },
    ],
    kind: "component",
  },
  {
    userId: USER_ID,
    title: "breakout",
    markdownId: null,
    imageComparisons: [],
    exemples: [
      { key: "H7Ptp2XUgmWuR5ccUutjpAq92C38PKYoOdeFjtBwmvWfiH0E", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuR5ccUutjpAq92C38PKYoOdeFjtBwmvWfiH0E" },
      { key: "H7Ptp2XUgmWuTEHRWXoStheoRVa0jkOmzG2wiZfJ7p4n8ryq", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuTEHRWXoStheoRVa0jkOmzG2wiZfJ7p4n8ryq" },
      { key: "H7Ptp2XUgmWuU1YUv2O8pQxWEAenkqsdCu15VNILMSRP0GXr", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuU1YUv2O8pQxWEAenkqsdCu15VNILMSRP0GXr" },
      { key: "H7Ptp2XUgmWuAEVQ6JWWKdg7AetHy1RBsn0MJmPTf8EFQwuq", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuAEVQ6JWWKdg7AetHy1RBsn0MJmPTf8EFQwuq" },
    ],
    categories: null,
    questions: [],
    kind: "component",
  },
  {
    userId: USER_ID,
    title: "spike and channel",
    markdownId: null,
    imageComparisons: [],
    exemples: [
      { key: "H7Ptp2XUgmWuXR5i5CwK7ChyeDxpSNvnubBL2z4GWAad9FXf", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuXR5i5CwK7ChyeDxpSNvnubBL2z4GWAad9FXf" },
      { key: "H7Ptp2XUgmWuJODgyOUdgvOjDGA5iFonTXulPb2ctzmBSIMK", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuJODgyOUdgvOjDGA5iFonTXulPb2ctzmBSIMK" },
      { key: "H7Ptp2XUgmWusTYVJv4ohpXBCv7TGzci9Ateubf8LEMWFy4r", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWusTYVJv4ohpXBCv7TGzci9Ateubf8LEMWFy4r" },
      { key: "H7Ptp2XUgmWuQ7O0HpS6KNA0ZtY48EXDbdce6OFfzCHMqhUP", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuQ7O0HpS6KNA0ZtY48EXDbdce6OFfzCHMqhUP" },
    ],
    categories: null,
    questions: [],
    kind: "component",
  },
  {
    userId: USER_ID,
    title: "trading range",
    markdownId: null,
    imageComparisons: [],
    exemples: [
      { key: "H7Ptp2XUgmWuExIMe3crup7wj2dYnDNtQv05a4Ti9kMPEg3l", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuExIMe3crup7wj2dYnDNtQv05a4Ti9kMPEg3l" },
      { key: "H7Ptp2XUgmWuJGqOVnOUdgvOjDGA5iFonTXulPb2ctzmBSIM", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuJGqOVnOUdgvOjDGA5iFonTXulPb2ctzmBSIM" },
      { key: "H7Ptp2XUgmWu1Uk4gvYpVDfsmr0FRezYk8OC6XU2yNLg7u3q", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWu1Uk4gvYpVDfsmr0FRezYk8OC6XU2yNLg7u3q" },
      { key: "H7Ptp2XUgmWu2PiPqdFEzmvfeGwQVYoNu9TRipt5nIbW2q8d", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWu2PiPqdFEzmvfeGwQVYoNu9TRipt5nIbW2q8d" },
      { key: "H7Ptp2XUgmWurRvcojBtPwZ1a4ipr0RFY8T9XmU3267fhLQI", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWurRvcojBtPwZ1a4ipr0RFY8T9XmU3267fhLQI" },
      { key: "H7Ptp2XUgmWudJ7RYD2O93wXaRC2AnKvQsuSLV1DUjNtbfYq", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWudJ7RYD2O93wXaRC2AnKvQsuSLV1DUjNtbfYq" },
      { key: "H7Ptp2XUgmWuBJyNcyUZTkElVHchQu2Zgzo5xDGANBRLseY7", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuBJyNcyUZTkElVHchQu2Zgzo5xDGANBRLseY7" },
      { key: "H7Ptp2XUgmWunW5Mm0CdQ2ugVeUzZMyXIbFiED4CBRxqLprJ", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWunW5Mm0CdQ2ugVeUzZMyXIbFiED4CBRxqLprJ" },
      { key: "H7Ptp2XUgmWuQ87uR6KNA0ZtY48EXDbdce6OFfzCHMqhUPj9", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWuQ87uR6KNA0ZtY48EXDbdce6OFfzCHMqhUPj9" },
      { key: "H7Ptp2XUgmWufEm22JpnLT82PHgkaW9xt4hX6mUvAzIK0OJw", uri: "https://9yrpm0whqq.ufs.sh/f/H7Ptp2XUgmWufEm22JpnLT82PHgkaW9xt4hX6mUvAzIK0OJw" },
    ],
    categories: "range",
    questions: [],
    kind: "component",
  },
  { userId: USER_ID, title: "small pb", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "50% pb bar", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "wedge", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "mini wedge", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  {
    userId: USER_ID,
    title: "conspicuous bar",
    markdownId: null,
    imageComparisons: [],
    exemples: [],
    categories: null,
    questions: [
      {
        id: "cf8177ac-91d0-4c10-a61b-1cf63af14783",
        question: "",
        questionFunction: "",
        answers: [{ answer: "", consequence: 0 as unknown as { id: number; title: string; parentId: number } }],
      },
    ],
    kind: "component",
  },
  { userId: USER_ID, title: "big pb", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "trending pb", markdownId: null, imageComparisons: [], exemples: [], categories: "impulse", questions: [], kind: "component" },
  { userId: USER_ID, title: "climax", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "reversal", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "parabolic wedge", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "consecutive wedges", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "late in trend", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "reversal bar", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "rejection candle", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "impulse bar", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "ma touch", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "trend", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "broad channel", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "tight channel", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "3 bars growing", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "failed wedge", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "triangle", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "small triangle", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "surprise bar", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "hod", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "lod", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "hoy", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "loy", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "double top", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "double bottom", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "micro dt", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "micro db", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "lower high", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "higher low", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "ttr", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "thousand", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "big up big down", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "big", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "small", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "medium", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "gap", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "head and shoulders", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "endless pb", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "low", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "high", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "middle", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "bull", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "bear", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "continuation bar", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "continuation", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "third leg", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "signal bar", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "good", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "bad", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "channel line", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "trend line", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
  { userId: USER_ID, title: "touch", markdownId: null, imageComparisons: [], exemples: [], categories: null, questions: [], kind: "component" },
];

export async function seedComponents() {
  const client = postgres(process.env.VITE_DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });

  console.log(`Seeding ${components.length} components...`);

  await db.insert(componentsTable).values(components).onConflictDoNothing();

  console.log("Done.");
  await client.end();
}

// Run if executed directly
seedComponents().catch((err) => {
  console.error(err);
  process.exit(1);
});
