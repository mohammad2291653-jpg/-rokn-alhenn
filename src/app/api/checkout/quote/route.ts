import { NextResponse } from "next/server";
import { quoteOrder } from "@/lib/order-service";
import { assertSameOrigin, consumeRateLimit, jsonError, readJson } from "@/lib/security";

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    await consumeRateLimit(request,"quote",60,60_000);
    return NextResponse.json(await quoteOrder(await readJson(request)),{headers:{"Cache-Control":"no-store"}});
  } catch (error) { return jsonError(error); }
}
