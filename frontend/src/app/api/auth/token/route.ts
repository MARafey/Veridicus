/**
 * Returns the raw NextAuth JWT so the frontend axios client can
 * attach it as a Bearer token to backend API requests.
 */
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ token: null }, { status: 401 });
  }
  // Return the encoded JWT (not the decoded payload)
  const raw = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, raw: true });
  return NextResponse.json({ token: raw });
}
