import {
  action,
  createAsync,
  createAsyncStore,
  query,
  revalidate,
  useAction,
} from "@solidjs/router";
import { createComponent, createSignal, untrack } from "solid-js";
import { fetchComponents, fetchSingleComponent } from "./querys/components";
import { ComponentUpdate } from "~/db/queries/componentsCRUD";

const _components = [
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
];

export default function createComponents(agent, actions, state, setState) {
  const [componentsSource, setComponentsSource] = createSignal("mine");

  const fetchComponents = query(async (userId) => {
    const response = agent.Components.listByUser(userId);
    return response;
  }, "components");

  const components = createAsync(async () => {
    if (!componentsSource()) return {};

    let components;
    if (componentsSource() === "mine") {
      try {
        components = await fetchComponents(1);
        console.log(components);
      } catch (err) {
        console.log(err);
      }
    } else if (componentsSource() === "public") {
    }

    // // Normalize into the map
    // const mapped = components.reduce((memo, a) => {
    //   memo[a.slug] = a;
    //   return memo;
    // }, {});

    return components;
  });

  const fetchSingleComponent = query(async (id) => {
    return await agent.Components.get(id, state.user.id);
  }, "single-component");

  const component = createAsync(async () => {
    const id = state.displayComponentId;
    if (!id) return {};

    return await fetchSingleComponent(id);
  });

  const _saveComponent = action(async (id: string, data: ComponentUpdate) => {
    const response = await agent.Components.update(id, state.user.id, data);
    return response;
  });

  const updateComponent = useAction(_saveComponent);

  Object.assign(actions, {
    loadComponents(predicate) {
      setComponentsSource(predicate);
    },
    loadComponent(componentId) {
      setState("displayedComponentId", componentId);
    },
    async createComponent(componentData: { title: string }) {
      const component = await agent.Components.create(componentData);
      revalidate("components");
    },
    updateComponent,
    deleteComponent(id, userId) {
      return agent.Components.delete(id, userId);
    },
  });

  return {
    components,
    component,
  };
}
