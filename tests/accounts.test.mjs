import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/lib/accounts.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function client(request) {
  const sandbox = { exports: {}, URLSearchParams, require: () => ({ apiRequest: request }) };
  vm.runInNewContext(source, sandbox);
  return sandbox.exports;
}

test("keyword pagination preserves server totals and exact requested page", async () => {
  const calls = [];
  const api = client(async (path) => {
    calls.push(path);
    if (path.startsWith("/accounts?")) return { content: [{ id: 12, username: "hr_12" }], totalElements: 25 };
    return { id: 12, username: "hr_12" };
  });
  const result = await api.fetchUserAccounts({ keyword: " hr ", page: 2, size: 8 });
  const query = new URL(calls[0], "https://test.vteach.site").searchParams;
  assert.equal(query.get("keyword"), "hr");
  assert.equal(query.get("page"), "1");
  assert.equal(result.total, 25);
  assert.equal(result.items.length, 1);
});

test("empty keyword result does not scan an unfiltered first page or invent negative totals", async () => {
  let calls = 0;
  const api = client(async () => { calls++; return { content: [], totalElements: 0 }; });
  const result = await api.fetchUserAccounts({ keyword: "không có", page: 1 });
  assert.equal(result.total, 0);
  assert.equal(result.items.length, 0);
  assert.equal(calls, 1);
});

test("nested list response preserves a valid total of zero", async () => {
  const api = client(async () => ({ data: { content: [], totalElements: 0 } }));
  assert.equal((await api.fetchUserAccounts({})).total, 0);
});

test("aborted detail enrichment cannot resolve as a stale account list", async () => {
  const controller = new AbortController();
  const api = client(async (path) => {
    if (path.startsWith("/accounts?")) return { content: [{ id: 1 }], totalElements: 1 };
    controller.abort();
    throw new Error("response đã cũ");
  });
  await assert.rejects(api.fetchUserAccounts({}, controller.signal), { name: "AbortError" });
});
