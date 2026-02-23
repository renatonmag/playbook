export interface IStoreState {
  /**
   * Map of IArticles keyed on slug
   */

  readonly components: any;

  /**
   * Security token for current user
   */

  token: string;

  /**
   * The application name
   */

  appName: string;
  displayComponentId: number | null;
  user: {
    id: number;
    userName: string;
    email: string;
  };
}
