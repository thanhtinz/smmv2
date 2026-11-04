import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Middleware hỏi endpoint này để map tên miền riêng -> slug panel con */
export async function GET(req: NextRequest) {
  const host = (req.nextUrl.searchParams.get("host") || "").toLowerCase();
  if (!host) return NextResponse.json({ error: "missing host" }, { status: 400 });
  const panel = await prisma.childPanel.findFirst({ where: { domain: host, status: "ACTIVE" }, select: { slug: true } });
  if (!panel) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ slug: panel.slug });
}
