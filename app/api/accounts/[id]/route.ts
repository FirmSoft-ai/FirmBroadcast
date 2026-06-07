/**
 * Single connected-account endpoint.
 *
 *   DELETE /api/accounts/:id  -> disconnect an account (drops stored tokens)
 *
 * Drafts keep their history; the relation is set null via the schema's
 * onDelete behaviour.
 */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await prisma.account.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    throw err;
  }
}
