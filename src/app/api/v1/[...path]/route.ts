import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: RouteContext) {
  const upstream = process.env.HRM_API_UPSTREAM?.trim();
  if (!upstream) {
    return NextResponse.json(
      { message: "Chưa cấu hình kết nối API." },
      { status: 503 },
    );
  }
  const { path } = await context.params;
  const url = new URL(
    upstream.replace(/\/$/, "") + "/" + path.map(encodeURIComponent).join("/"),
  );
  url.search = request.nextUrl.search;
  const headers = new Headers();
  for (const key of ["authorization", "cookie", "content-type", "accept"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    // A same-origin server proxy keeps session cookies and credentials off client configuration.
    const response = await fetch(url, {
      method: request.method,
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
    });
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    const contentType = response.headers.get("content-type");
    if (contentType) outgoing.set("Content-Type", contentType);
    for (const cookie of response.headers.getSetCookie())
      outgoing.append("Set-Cookie", cookie);
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return NextResponse.json(
      { message: "Không thể kết nối máy chủ API. Vui lòng thử lại." },
      { status: 502 },
    );
  }
}
export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
