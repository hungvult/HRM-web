import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = Object.fromEntries(["api", "auth"].map((name) => [name,
  ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function browser(fetcher, storage = new Map([["hrm_access_token", "original-token"]]), globals = {}) {
  const target = new EventTarget();
  const redirects = [];
  const location = { pathname: "/employees", origin: "https://hrm.example", href: "", replace: (path) => redirects.push(path) };
  const window = {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    dispatchEvent: (event) => target.dispatchEvent(event),
    addEventListener: (...args) => target.addEventListener(...args),
    removeEventListener: (...args) => target.removeEventListener(...args),
    location,
  };
  const modules = {};
  for (const name of ["api", "auth"]) {
    const sandbox = {
      exports: {}, window, Event, Headers, Response, URL, Blob, FormData, URLSearchParams, ArrayBuffer, AbortSignal,
      crypto: { randomUUID }, process: { env: {} }, fetch: fetcher,
      require: (path) => path === "@/lib/api" ? modules.api : assert.fail(`Unexpected dependency ${path}`),
      ...globals,
    };
    vm.runInNewContext(compiled[name], sandbox);
    modules[name] = sandbox.exports;
  }
  return { ...modules, window, storage, redirects };
}

test("logout calls the server with the original token, clears local tokens and stays signed out", async () => {
  const requests = [];
  const app = browser(async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.get("Authorization"), "Bearer original-token");
    assert.equal(options.credentials, "include");
    assert.equal(app.api.hasActiveAuthSession(), false);
    return new Response(null, { status: 204 });
  });
  await app.api.logoutCurrentSession();
  assert.deepEqual(requests, ["/api/v1/auth/logout"]);
  assert.equal(app.storage.has("hrm_access_token"), false);
  assert.equal(app.api.hasActiveAuthSession(), false);
});

test("Back or reload after logout cannot make a protected request or refresh the cookie", async () => {
  let calls = 0;
  const app = browser(async () => { calls++; return new Response(null, { status: 204 }); });
  await app.api.logoutCurrentSession();
  await assert.rejects(app.api.apiRequest("/me/profile"), { status: 401 });
  assert.equal(calls, 1);
  const reloaded = browser(() => assert.fail("A signed-out reload must not call the API"), app.storage);
  await assert.rejects(reloaded.api.apiRequest("/employees"), { status: 401 });
});

test("double logout shares one request", async () => {
  const response = deferred();
  let calls = 0;
  const app = browser(async () => { calls++; return response.promise; });
  const first = app.api.logoutCurrentSession();
  const second = app.api.logoutCurrentSession();
  assert.equal(first, second);
  response.resolve(new Response(null, { status: 204 }));
  await first;
  assert.equal(calls, 1);
});

test("logout during refresh revokes the late rotated token without storing it or retrying the business request", async () => {
  const refresh = deferred();
  const started = deferred();
  const revoked = [];
  let businessCalls = 0;
  const app = browser(async (url, options) => {
    if (url.endsWith("/auth/refresh")) { started.resolve(); return refresh.promise; }
    if (url.endsWith("/auth/logout")) {
      revoked.push(options.headers.get("Authorization"));
      return new Response(null, { status: 204 });
    }
    businessCalls++;
    return Response.json({}, { status: 401 });
  });
  const request = app.api.apiRequest("/employees");
  const rejected = assert.rejects(request, { status: 401 });
  await started.promise;
  const logout = app.api.logoutCurrentSession();
  refresh.resolve(Response.json({ accessToken: "late-rotated-token" }));
  await Promise.all([rejected, logout]);
  assert.deepEqual(revoked, ["Bearer late-rotated-token", "Bearer original-token"]);
  assert.equal(businessCalls, 1);
  assert.equal(app.api.hasActiveAuthSession(), false);
  assert.equal(app.storage.has("hrm_access_token"), false);
});

test("an expired access token refreshes only to revoke the current session", async () => {
  const revoked = [];
  const app = browser(async (url, options) => {
    if (url.endsWith("/auth/refresh")) return Response.json({ accessToken: "logout-only-token" });
    revoked.push(options.headers.get("Authorization"));
    return new Response(null, { status: revoked.length === 1 ? 401 : 204 });
  });
  await app.api.logoutCurrentSession();
  assert.deepEqual(revoked, ["Bearer original-token", "Bearer logout-only-token"]);
  assert.equal(app.storage.has("hrm_access_token"), false);
});

test("a failed logout leaves a durable local block and reports failure", async () => {
  const app = browser(async () => { throw new Error("network unavailable"); });
  await assert.rejects(app.api.logoutCurrentSession(), /network unavailable/);
  assert.equal(app.api.hasActiveAuthSession(), false);
  assert.equal(app.api.isLogoutInProgress(), false);
  await assert.rejects(app.api.apiRequest("/me/profile"), { status: 401 });
});

test("a fresh successful login is the only operation that reopens the signed-out session", async () => {
  const app = browser(async () => Response.json({ accessToken: "new-login-token", user: { roles: ["HR"] } }));
  app.api.clearAuthTokens();
  assert.equal(app.api.storeAuthTokensFromResponse({ accessToken: "stale-refresh" }), "");
  await app.auth.loginWithApi({ identity: "qa", password: "fixture", remember: false });
  assert.equal(app.api.hasActiveAuthSession(), true);
  assert.equal(app.storage.get("hrm_access_token"), "new-login-token");
});

test("logout in one tab blocks API calls in another tab", async () => {
  const first = browser(async () => new Response(null, { status: 204 }));
  const second = browser(() => assert.fail("Other tab must not refresh after logout"), first.storage);
  await first.api.logoutCurrentSession();
  assert.equal(second.api.hasActiveAuthSession(), false);
  await assert.rejects(second.api.apiRequest("/employees"), { status: 401 });
});

test("a response from an old account cannot update data or clear a newer login", async () => {
  const oldResponse = deferred();
  const app = browser(async (url) => url.endsWith("/auth/login")
    ? Response.json({ accessToken: "second-user-token" }) : oldResponse.promise);
  const oldRequest = app.api.apiRequest("/employees");
  const rejected = assert.rejects(oldRequest, { status: 401 });
  await app.auth.loginWithApi({ identity: "other", password: "fixture", remember: false });
  oldResponse.resolve(Response.json({ content: ["private old account data"] }));
  await rejected;
  assert.equal(app.storage.get("hrm_access_token"), "second-user-token");
  assert.equal(app.api.hasActiveAuthSession(), true);
  assert.equal(app.window.location.href, "");
});

test("ordinary concurrent 401s still share a refresh and retry successfully", async () => {
  let refreshes = 0;
  const app = browser(async (url, options) => {
    if (url.endsWith("/auth/refresh")) { refreshes++; return Response.json({ accessToken: "refreshed-token" }); }
    return options.headers.get("Authorization") === "Bearer refreshed-token"
      ? Response.json({ ok: true }) : Response.json({}, { status: 401 });
  });
  const responses = await Promise.all([app.api.apiRequest("/employees"), app.api.apiRequest("/me/profile")]);
  assert.ok(responses.every((item) => item.ok));
  assert.equal(refreshes, 1);
});

function locks() {
  let previous = Promise.resolve();
  return {
    request(_name, { signal }, action) {
      const released = deferred();
      const waitingFor = previous;
      previous = released.promise;
      return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        waitingFor.then(async () => {
          signal.removeEventListener("abort", abort);
          try {
            signal.throwIfAborted();
            resolve(await action());
          } catch (error) { reject(error); }
          finally { released.resolve(); }
        });
      });
    },
  };
}

test("logout queued behind a newer login does not send a stale request that clears its cookie", async () => {
  const sharedLocks = locks();
  let logouts = 0;
  let cookie = "old-session";
  const first = browser(async () => { logouts++; cookie = ""; return new Response(null, { status: 204 }); }, undefined, { navigator: { locks: sharedLocks } });
  const second = browser(async () => { cookie = "new-session"; return Response.json({ accessToken: "new-login" }); }, first.storage, { navigator: { locks: sharedLocks } });
  const logout = first.api.logoutCurrentSession();
  const login = second.auth.loginWithApi({ identity: "new", password: "fixture", remember: false });
  await Promise.all([logout, login]);
  assert.equal(logouts, 0);
  assert.equal(cookie, "new-session");
  assert.equal(first.storage.get("hrm_access_token"), "new-login");
});

test("logout stops waiting for a locked session after the lock timeout", async () => {
  const sharedLocks = locks();
  const loginResponse = deferred();
  const started = deferred();
  const first = browser(() => assert.fail("Timed-out lock must not send logout"), undefined, {
    navigator: { locks: sharedLocks }, AbortSignal: { timeout: () => AbortSignal.timeout(10) },
  });
  const second = browser(async () => { started.resolve(); return loginResponse.promise; }, first.storage, { navigator: { locks: sharedLocks } });
  const login = second.auth.loginWithApi({ identity: "new", password: "fixture", remember: false });
  const rejectedLogin = assert.rejects(login, { status: 401 });
  await started.promise;
  const rejectedLogout = assert.rejects(first.api.logoutCurrentSession(), { name: "TimeoutError" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await rejectedLogout;
  assert.equal(first.api.isLogoutInProgress(), false);
  assert.equal(first.api.hasActiveAuthSession(), false);
  loginResponse.resolve(Response.json({ accessToken: "cancelled-login" }));
  await rejectedLogin;
});

test("a failed login in another tab does not skip revoking the old session", async () => {
  const sharedLocks = locks();
  let logouts = 0;
  const first = browser(async () => { logouts++; return new Response(null, { status: 204 }); }, undefined, { navigator: { locks: sharedLocks } });
  const second = browser(async () => Response.json({ message: "invalid credentials" }, { status: 401 }), first.storage, { navigator: { locks: sharedLocks } });
  const logout = first.api.logoutCurrentSession();
  const failedLogin = assert.rejects(second.auth.loginWithApi({ identity: "new", password: "fixture", remember: false }), { status: 401 });
  await Promise.all([logout, failedLogin]);
  assert.equal(logouts, 1);
  assert.equal(first.api.hasActiveAuthSession(), false);
});

test("initial server snapshot does not redirect a valid session during hydration", () => {
  const app = browser(() => assert.fail("Hydration must not fetch"));
  const source = ts.transpileModule(readFileSync(new URL("../src/components/auth-session-guard.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const effects = [];
  const sandbox = {
    exports: {}, window: app.window,
    require: (name) => {
      if (name === "@/lib/api") return app.api;
      if (name === "next/navigation") return { usePathname: () => "/profile" };
      if (name === "react") return { useEffect: (action) => effects.push(action), useSyncExternalStore: (_subscribe, _client, server) => server() };
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
      assert.fail(`Unexpected dependency ${name}`);
    },
  };
  vm.runInNewContext(source, sandbox);
  sandbox.exports.default({ children: "private content" });
  effects.forEach((action) => action());
  assert.deepEqual(app.redirects, []);
  app.api.clearAuthTokens();
  effects.forEach((action) => action());
  assert.deepEqual(app.redirects, ["/login"]);
});
