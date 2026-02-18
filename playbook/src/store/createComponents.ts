import {
  action,
  createAsync,
  createAsyncStore,
  query,
  revalidate,
  useAction,
} from "@solidjs/router";
import { createEffect, createSignal, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { ComponentUpdate } from "~/db/queries/componentsCRUD";



export default function createComponents(agent, actions, state, setState) {
  const [componentsSource, setComponentsSource] = createSignal("mine");
  const [compStore, setCompStore] = createStore({
    components: {},
    component: {},
  })

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

  const fetchSingleComponent = query(async (id, userId) => {
    console.log("fetching single component")
    return await agent.Components.get(id, userId);
  }, "single-component");

  const component = createAsync(async () => {
    const id = state.displayComponentId;
    if (!id) return {};

    return await fetchSingleComponent(id, state.user.id);
  });

  createEffect(() => {
    setCompStore("component", component());
    setCompStore("components", components());
  })


  const _updateComponent = action(async (id: string, data: ComponentUpdate) => {
    const response = await agent.Components.update(id, state.user.id, data);
    return response;
  });

  const updateComponent = useAction(_updateComponent);

  interface CategoriesUpdate {
    id: number;
    name: string;
  }

  const _updateCategory = action(async (data: CategoriesUpdate) => {
    const response = await agent.Categories.update(state.user.id, data);
    return response;
  }, "update-category");

  const updateCategory = useAction(_updateCategory);

  Object.assign(actions, {
    loadComponents(predicate) {
      setComponentsSource(predicate);
    },
    loadComponent(componentId) {
      setState("displayComponentId", componentId);
    },
    async createComponent(componentData: { title: string }) {
      const component = await agent.Components.create(componentData);
      revalidate("components");
    },
    updateComponent,
    deleteComponent(id, userId) {
      return agent.Components.delete(id, userId);
    },
    async createCategory(componentData: { componentId: number, name: string }) {
      await agent.Categories.create(componentData);
      revalidate("components");
    },
    updateCategory
  });

  return compStore
}
