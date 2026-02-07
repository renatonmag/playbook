import { createStore } from "solid-js/store";

export const [checklist, setChecklist] = createStore<
  {
    id: string;
    title: string;
    components: { id: string; title: string; markdown: string }[];
  }[]
>([
  {
    id: "ae4754",
    title: "Checklist 1",
    components: [
      { id: "ae47541", title: "Component 1", markdown: "Component 1" },
      { id: "ae47542", title: "Component 2", markdown: "Component 2" },
      { id: "ae47543", title: "Component 3", markdown: "Component 3" },
    ],
  },
  {
    id: "ae4755",
    title: "Checklist 2",
    components: [
      { id: "4", title: "Component 4", markdown: "Component 4" },
      { id: "5", title: "Component 5", markdown: "Component 5" },
      { id: "6", title: "Component 6", markdown: "Component 6" },
    ],
  },
  {
    id: "ae4756",
    title: "Checklist 3",
    components: [
      {
        id: "7",
        title: "Component 7",
        markdown: `sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss
sssssssssssssssssssssssssssssss

sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss

sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss


sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss

1. ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss
2. sssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss`,
      },
      { id: "8", title: "Component 8", markdown: "Component 8" },
      { id: "9", title: "Component 9", markdown: "Component 9" },
    ],
  },
]);
