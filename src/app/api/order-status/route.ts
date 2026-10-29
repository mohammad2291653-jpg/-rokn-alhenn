import { NextResponse } from "next/server";
import { lookupOrder, OrderError } from "@/lib/order-service";
import { assertSameOrigin, consumeRateLimit, jsonError, readJson } from "@/lib/security";
import { z } from "zod";

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    await consumeRateLimit(request,"tracking",10,60_000);
    const parsed = z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().safeParse(await readJson(request));
    if (!parsed.success)
      throw new OrderError("أدخلي رمز المتابعة الآمن.");
    return NextResponse.json(await lookupOrder(parsed.data.token),{headers:{"Cache-Control":"no-store"}});
  } catch (error) { return jsonError(error); }
}
