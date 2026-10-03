import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/app/api/v1/[...path]/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function proxy(upstream, fetcher) {
  const sandbox = {
    exports: {}, URL, Headers, Response,
    process: { env: { HRM_API_UPSTREAM: upstream } },
    fetch: fetcher,
    require: () => ({ NextResponse: { json: (body, options) => Response.json(body, options) } }),
  };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports;
}
function request(method = "GET", headers = {}, body) {
  const url = "http://localhost:3000/api/v1/employees?q=Nguyen&page=0";
  const req = new Request(url, { method, headers, body });
  req.nextUrl = new URL(url);
  return req;
}
const context = { params: Promise.resolve({ path: ["employees"] }) };
test("proxy fails closed when the server upstream is not configured", async () => {
  const route = proxy(undefined, () => assert.fail("Must not make upstream requests"));
  assert.equal((await route.GET(request(), context)).status, 503);
});
test("proxy keeps the configured upstream and forwards query, token and cookie, not host/origin", async () => {
  const route = proxy("https://test.vteach.site/api/v1/", async (url, options) => {
    assert.equal(url.href, "https://test.vteach.site/api/v1/employees?q=Nguyen&page=0");
    assert.equal(options.headers.get("authorization"), "Bearer fixture");
    assert.equal(options.headers.get("cookie"), "refreshToken=fixture");
    assert.equal(options.headers.has("host"), false);
    assert.equal(options.headers.has("origin"), false);
    assert.equal(options.cache, "no-store");
    return Response.json({ content: [] });
  });
  const response = await route.GET(request("GET", { authorization: "Bearer fixture", cookie: "refreshToken=fixture", origin: "http://localhost:3000", host: "localhost:3000" }), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("proxy preserves mutation method, JSON body and cancellation signal", async () => {
  const req = request("PATCH", { "content-type": "application/json" }, JSON.stringify({ phone: "0900000123" }));
  const route = proxy("https://test.vteach.site/api/v1", async (url, options) => {
    assert.equal(options.method, "PATCH");
    assert.equal(options.signal, req.signal);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(options.body)), { phone: "0900000123" });
    return Response.json({ id: 1 });
  });
  assert.equal((await route.PATCH(req, context)).status, 200);
});
test("proxy preserves field validation status/body and refresh cookies", async () => {
  const route = proxy("https://test.vteach.site/api/v1", async () => {
    const response = Response.json({ message: "Duplicate name", errors: [{ field: "name", message: "Already exists" }] }, { status: 409 });
    response.headers.append("set-cookie", "refreshToken=fixture; HttpOnly; Secure; SameSite=Lax");
    return response;
  });
  const response = await route.POST(request("POST", { "content-type": "application/json" }, "{}"), context);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).errors[0].field, "name");
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
});
test("proxy returns an empty 204 response for logout", async () => {
  const route = proxy("https://test.vteach.site/api/v1", async () => new Response(null, { status: 204 }));
  const response = await route.POST(request("POST"), context);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});
test("proxy reports upstream connection failure without exposing internal errors", async () => {
  const route = proxy("https://test.vteach.site/api/v1", async () => { throw new Error("sensitive upstream details"); });
  const response = await route.GET(request(), context);
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes("sensitive"), false);
});
