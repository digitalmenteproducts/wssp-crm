import { NextResponse, type NextRequest } from "next/server";

import { getOptionalServerEnv } from "@/lib/env";
import { runClassificationBatch } from "@/services/openai/classification-runner.service";

export const runtime = "nodejs";

/**
 * Cron / job de clasificación.
 * Protegido con CRON_SECRET (Authorization: Bearer <secret>).
 *
 * POST /api/cron/classify?force=1&limit=20
 */
export async function POST(request: NextRequest) {
  const cronSecret = getOptionalServerEnv().CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const provided =
    authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : request.headers.get("x-cron-secret");

  if (!cronSecret || !provided || provided !== cronSecret) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20");

  const result = await runClassificationBatch({
    force,
    limit: Number.isFinite(limit) ? limit : 20,
  });

  return NextResponse.json({ ok: true, ...result });
}
