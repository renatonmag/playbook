import { DocumentStore } from "./createDocumentStore";

export type IDocument = { title: string };
export type IArticleMap = { [id: number]: IDocument };

export interface IStoreState {
  /**
   * Map of IDocuments keyed on Id
   */

  readonly documents: DocumentStore;

  /**
   * Slug of the currently active article
   */

  documentId: string;
}
