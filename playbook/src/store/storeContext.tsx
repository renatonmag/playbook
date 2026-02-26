import { createContext, useContext, InitializedResource } from "solid-js";
import { createStore } from "solid-js/store";

// import { IComment, IProfile, IUser } from '../api/RealWorldApi';
// import { WorldApi } from '../api/RealWorldApi'

// import { createArticlesStore, IArticleActions } from './createArticlesStore'

import { IStoreState, IArticleMap } from "./storeState";
import createComponents from "./createComponents";
import createAgent from "./createAgent";
import createTradeSessions from "./createTradeSessions";

// export interface IActions extends IUserActions, IArticleActions, ICommentsActions, IProfileActions, ICommonActions {}

export type IStoreContext = [state: IStoreState, actions: any];

/**
 * Create the application store. This is made available to
 * the application
 *
 * @returns {IStoreContext} The application store
 */

export function createApplicationStore(): IStoreContext {
  let componentsStore: any = undefined,
    sessionsStore = undefined;

  const [state, setState] = createStore<IStoreState>({
    // The following getters map each of
    // the resource stores onto the global store

    get components() {
      return componentsStore;
    },

    get sessions() {
      return sessionsStore;
    },

    displayComponentId: null,
    user: {
      id: 1,
    },

    token: "",
    appName: "playbook",
  });

  const actions = {},
    store: [any, any] = [state, actions],
    agent = createAgent(store);

  componentsStore = createComponents(agent, actions, state, setState);
  sessionsStore = createTradeSessions(agent, actions, state, setState);

  return [state, actions];
}

export const _StoreContext = createContext<IStoreContext>();
export const StoreContext = (props: any) => {
  const store = createApplicationStore();
  return (
    <_StoreContext.Provider value={store}>
      {props.children}
    </_StoreContext.Provider>
  );
};

/**
 * Globally accessible application store and associated utility
 * functions
 * ```
 *
 * Example:
 *
 *    const [store, { setPage, loadArticles, unfollow, follow }] = useStore()
 *
 *    const article = store.articles[slug]
 *    const comment = store.comments[45]
 *
 *    setPage(page.page + 1)
 *
 *
 * ```
 * @returns IStoreContext - The global application context
 */

export function useStore(): IStoreContext {
  return useContext<IStoreContext>(_StoreContext);
}
