// @ts-nocheck

const API_ROOT = "http://localhost:3000";

export default function createAgent([state, actions]) {
  async function send(method, url, data, resKey) {
    const headers = {},
      opts = { method, headers };

    if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(data);
    }

    if (state.token) headers["Authorization"] = `Token ${state.token}`;

    try {
      console.log(API_ROOT + url, opts);
      const response = await fetch(API_ROOT + url, opts);
      const text = await response.text(); // Get body as string first

      if (text) {
        const json = JSON.parse(text);
        return resKey ? json[resKey] : json;
      }
    } catch (err) {
      console.log(err);
      if (err && err.response && err.response.status === 401) {
        actions.logout();
      }
      return err;
    }
  }

  const Auth = {
    current: () => send("get", "/user", undefined, "user"),
    login: (email, password) =>
      send("post", "/users/login", { user: { email, password } }),
    register: (username, email, password) =>
      send("post", "/users", { user: { username, email, password } }),
    save: (user) => send("put", "/user", { user }),
  };

  const Components = {
    listByUser: (userId) =>
      send("get", `/api/components?userId=${userId}`, undefined, undefined),
    get: (id, userId) =>
      send(
        "get",
        `/api/components/${id}?userId=${userId}`,
        undefined,
        undefined,
      ),
    create: (component) => send("post", "/api/components", { ...component }),
    update: (id, userId, data) =>
      send("put", `/api/components/${id}`, { ...data, userId }, undefined),
    delete: (id, userId) =>
      send("delete", `/api/components/${id}`, undefined, undefined),
  };

  const Categories = {
    update: (userId, data) =>
      send("put", `/api/categories/${data.id}`, { ...data, userId }, undefined),
    create: (userId, data) =>
      send("post", `/api/categories`, { ...data, userId }, undefined),
  }

  return {
    Auth,
    Components,
  };
}
