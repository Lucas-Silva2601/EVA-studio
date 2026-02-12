import { NextRequest, NextResponse } from "next/server";
import { getPreviewFile } from "@/lib/previewStore";

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  cjs: "application/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  xml: "application/xml",
  txt: "text/plain",
  md: "text/markdown",
};

const BASE_HREF = "/api/preview/";

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

function isHtml(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ext === "html" || ext === "htm";
}

/** Injeta <base href="..."> no HTML para que links relativos (css, js) resolvam para /api/preview/ */
function injectBaseHref(html: string): string {
  const baseTag = `<base href="${BASE_HREF}">`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/(<head[\s>])/i, `$1\n  ${baseTag}`);
  }
  return html.replace(/(<!DOCTYPE[^>]*>)/i, `$1\n${baseTag}`);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path: pathSegments } = await context.params;
  const path =
    pathSegments != null && Array.isArray(pathSegments) && pathSegments.length > 0
      ? pathSegments.join("/")
      : "index.html";
  let content = getPreviewFile(path);
  if (content === null) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (isHtml(path)) {
    content = injectBaseHref(content);
  }
  return new NextResponse(content, {
    headers: {
      "Content-Type": getContentType(path),
      "Cache-Control": "no-store",
    },
  });
}
