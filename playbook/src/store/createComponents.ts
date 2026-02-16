import { createAsync, query } from "@solidjs/router";
import { createComponent, createSignal } from "solid-js";

export default function createComponents(agent, actions, state, setState) {
  const [componentsSource, setComponentsSource] = createSignal("mine");
  const fetchComponents = query(async (agent, userId) => {
    const result = await agent.Components.listByUser(userId);
    return result;
  }, "components");

  const fetchSingleComponent = query(async (agent, id) => {
    return await agent.Components.get(id);
  }, "single-component");

  const components = createAsync(async () => {
    if (!componentsSource()) return {};

    let components;
    if (componentsSource() === "mine") {
      components = await fetchComponents(agent, state.user.id);
    } else if (componentsSource() === "public") {
    }

    // // Normalize into the map
    // const mapped = components.reduce((memo, a) => {
    //   memo[a.slug] = a;
    //   return memo;
    // }, {});

    return components;
  });

  const component = createAsync(async () => {
    const id = state.displayedComponentId;
    if (!id) return {};

    return await fetchSingleComponent(id, agent);
  });

  Object.assign(actions, {
    loadComponents(predicate) {
      setComponentsSource(predicate);
    },
    loadComponent(componentId) {
      setState("displayedComponentId", componentId);
    },
    createComponent(component) {
      return agent.createComponent(component);
    },
    listComponentsByUser(userId) {
      return agent.listComponentsByUser(userId);
    },
    updateComponent(id, userId, data) {
      return agent.updateComponent(id, userId, data);
    },
    deleteComponent(id, userId) {
      return agent.deleteComponent(id, userId);
    },
  });

  return {
    components,
    component,
  };
}
