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
      const response = await fetch(API_ROOT + url, opts);
      const json = await response.json();
      return resKey ? json[resKey] : json;
    } catch (err) {
      if (err && err.response && err.response.status === 401) {
        console.log(err);
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
      send("patch", `/api/components/${id}`, { ...data, userId }, "component"),
    delete: (id, userId) =>
      send("delete", `/api/components/${id}`, undefined, "component"),
  };

  return {
    Auth,
    Components,
  };
}
