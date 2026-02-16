import { createMemo } from "solid-js";
import { createStore, produce } from "solid-js/store";

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

export const [patterns, setPatterns] = createStore<
  {
    id: string;
    title: string;
    markdown: string;
  }[]
>([
  {
    id: "1",
    title: "Pattern 1",
    markdown: "Pattern 1",
    images: [],
  },
  {
    id: "2",
    title: "Pattern 2",
    markdown: "Pattern 2",
    images: [],
  },
  {
    id: "3",
    title: "Pattern 3",
    markdown: "Pattern 3",
    images: [],
  },
  {
    id: "4",
    title: "Pattern 4",
    markdown: "Pattern 4",
    images: [],
  },
  {
    id: "5",
    title: "Pattern 5",
    markdown: "Pattern 5",
    images: [],
  },
]);

export const getListComponent = (componentID: string) => {
  return patterns.find((component) => component.id === componentID);
};

export const [selectedComponentsID, setSelectedComponentsID] = createStore<
  {
    id: string;
    components: string[];
  }[]
>([]);

export const selectComponent = (listID: string, componentID: string) => {
  setSelectedComponentsID(
    produce((items) => {
      const item = items.find((item) => item.id === listID);
      if (item) {
        if (item.components.includes(componentID)) return;
        const components = checklist.find(
          (item) => item.id === listID,
        )?.components;
        const index = components?.findIndex(
          (component) => component.id === componentID,
        );
        if (index === -1) return;
        const selectedSeq = components?.slice(0, index! + 1);
        item.components = selectedSeq!.map((item) => item.id);
      } else {
        const components = checklist.find(
          (item) => item.id === listID,
        )?.components;
        const index = components?.findIndex(
          (component) => component.id === componentID,
        );
        if (index === -1) return;
        const selectedSeq = components?.slice(0, index! + 1);
        items.push({
          id: listID,
          components: [...selectedSeq!.map((item) => item.id)],
        });
      }
    }),
  );
};

export const deselectComponent = (listID: string, componentID: string) => {
  setSelectedComponentsID(
    produce((items) => {
      const item = items.find((item) => item.id === listID);
      if (item) {
        const index = item.components?.findIndex(
          (component) => component === componentID,
        );
        if (index === -1) return;
        const selectedSeq = item.components?.slice(0, index!);
        item.components = selectedSeq;
      }
    }),
  );
};
