import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correct = process.env.ACCESS_PASSWORD;
  if (!correct) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  if (password !== correct) return NextResponse.json({ error: "비밀번호가 틀렸어요." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
