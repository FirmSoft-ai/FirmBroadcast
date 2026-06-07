/**
 * Connected-accounts collection endpoint.
 *
 *   GET /api/accounts  -> list connected LinkedIn accounts (token-free)
 *
 * Encrypted tokens are never serialized to the client; only display-safe
 * connection metadata is returned for the dashboard's accounts panel.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      authorType: true,
      authorUrn: true,
      name: true,
      email: true,
      scope: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ accounts });
}
