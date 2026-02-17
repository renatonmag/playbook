import { createContext, useContext, InitializedResource } from "solid-js";
import { createStore } from "solid-js/store";

// import { IComment, IProfile, IUser } from '../api/RealWorldApi';
// import { WorldApi } from '../api/RealWorldApi'

// import { createArticlesStore, IArticleActions } from './createArticlesStore'

import { IStoreState, IArticleMap } from "./storeState";
import createComponents from "./createComponents";
import createAgent from "./createAgent";

// export interface IActions extends IUserActions, IArticleActions, ICommentsActions, IProfileActions, ICommonActions {}

export type IStoreContext = [state: IStoreState, actions: any];

/**
 * Create the application store. This is made available to
 * the application
 *
 * @returns {IStoreContext} The application store
 */

export function createApplicationStore(): IStoreContext {
  let componentsStore = undefined;

  const [state, setState] = createStore<IStoreState>({
    // The following getters map each of
    // the resource stores onto the global store

    get components() {
      return componentsStore;
    },

    displayComponentId: 3,
    user: {
      id: 1,
    },

    token: "",
    appName: "playbook",
  });

  // Container for ALL the store's actions

  const actions = {},
    store: [any, any] = [state, actions],
    agent = createAgent(store);

  // Agent used for communication with the server

  // Instantiate all the resource stores. Each of these functions
  // returns an instance of a solidJS resource state that is updated
  // by machinery embedded in the function that accesses the associated server API
  //
  // The functions also populate the actions container with utility
  // methods that manage the resource

  componentsStore = createComponents(agent, actions, state, setState);

  // Return the fully initialised store

  return [state, actions];
}

export const StoreContext = createContext<IStoreContext>();

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
  return useContext<IStoreContext>(StoreContext);
}
