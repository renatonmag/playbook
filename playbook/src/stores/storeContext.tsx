import { createStore } from "solid-js/store";
import {
  createDocumentStore,
  DocumentStore,
  IDocumentsActions,
} from "./createDocumentStore";
import { IStoreState } from "./storeState";
import { createContext, useContext } from "solid-js";

export interface IActions extends IDocumentsActions {}

export type IStoreContext = [state: IStoreState, actions: IActions];

export function createApplicationStore(): IStoreContext {
  let documentStore: DocumentStore | undefined = undefined;

  const [state, setState] = createStore<IStoreState>({
    get documents(): any {
      return documentStore;
    },

    documentId: "a",
  });

  const actions: any = {};

  documentStore = createDocumentStore({}, actions, state, setState);

  return [state, actions];
}

export const GlobalStoreContext = createContext<IStoreContext>();

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

export function useGlobalStore(): IStoreContext {
  return useContext<IStoreContext>(GlobalStoreContext);
}
