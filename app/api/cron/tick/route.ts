import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron/auth";
import { runCronTick } from "@/lib/cron/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel cron entry point — runs once per minute in production. */
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const result = await runCronTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
