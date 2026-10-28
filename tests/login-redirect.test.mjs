import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function load(path, dependencies = {}, globals = {}) {
  const source = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const sandbox = {
    exports: {},
    require: (name) => name in dependencies ? dependencies[name] : require(name),
    ...globals,
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.exports;
}

const auth = load("../src/lib/auth.ts", { "@/lib/api": {} });

test("landing pages match the existing role permissions", () => {
  for (const [role, path] of [
    ["ADMIN", "/accounts"],
    ["HR", "/employees"],
    ["MANAGER", "/attendances"],
    ["EMPLOYEE", "/profile"],
  ]) {
    assert.equal(auth.getPostLoginPath([role]), path);
  }
});

test("multiple roles have a consistent priority independent of array order", () => {
  assert.equal(auth.getPostLoginPath(["EMPLOYEE", "MANAGER"]), "/attendances");
  assert.equal(auth.getPostLoginPath(["MANAGER", "HR"]), "/employees");
  assert.equal(auth.getPostLoginPath(["HR", "ADMIN"]), "/accounts");
  assert.equal(auth.getPostLoginPath(["ADMIN", "HR"]), "/accounts");
});

test("missing or unrecognised roles fall back to the personal profile", () => {
  assert.equal(auth.getPostLoginPath(), "/profile");
  assert.equal(auth.getPostLoginPath([]), "/profile");
  assert.equal(auth.getPostLoginPath(["UNKNOWN"]), "/profile");
});

function loginPage(loginWithApi) {
  let submit;
  const routes = [];
  const messages = [];
  const render = (type, props) => {
    if (type === "form") submit = props.onSubmit;
    return { type, props };
  };
  const page = load("../src/app/login/page.tsx", {
    "@/lib/auth": { ...auth, loginWithApi },
    "next/navigation": { useRouter: () => ({
      replace: (path) => routes.push(path),
      push: () => assert.fail("successful login must replace the login history entry"),
    }) },
    react: { useState: (initial) => [initial, (value) => messages.push(value)] },
    "react/jsx-runtime": { jsx: render, jsxs: render },
  }, {
    FormData: class {
      get(name) { return { identity: "qa_user", password: "test-password" }[name]; }
    },
  });
  page.default();
  return { routes, messages, submit: () => submit({ preventDefault() {}, currentTarget: {} }) };
}

for (const [role, expected] of [
  ["ADMIN", "/accounts"],
  ["HR", "/employees"],
  ["MANAGER", "/attendances"],
  ["EMPLOYEE", "/profile"],
]) {
  test(`login handler redirects ${role} using the roles in the fresh login response`, async () => {
    const page = loginPage(async (payload) => {
      assert.equal(payload.identity, "qa_user");
      return { user: { roles: [role] } };
    });
    await page.submit();
    assert.deepEqual(page.routes, [expected]);
  });
}

test("failed authentication stays on login and shows the error", async () => {
  const page = loginPage(async () => { throw new Error("invalid credentials"); });
  await page.submit();
  assert.deepEqual(page.routes, []);
  assert.ok(page.messages.includes("Tên đăng nhập/email hoặc mật khẩu không đúng."));
});
