import { NextRequest, NextResponse } from "next/server";
import { setPreviewFiles } from "@/lib/previewStore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const files = body?.files as { path: string; contents: string }[] | undefined;
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "Body must include files array" }, { status: 400 });
    }
    setPreviewFiles(files);
    return NextResponse.json({ ok: true, count: files.length });
  } catch (err) {
    console.warn("[api] preview sync error", { message: err instanceof Error ? err.message : "Invalid request" });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
