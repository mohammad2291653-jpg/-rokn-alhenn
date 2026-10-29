import { NextResponse } from "next/server";
import { createOrder } from "@/lib/order-service";
import { assertSameOrigin, consumeRateLimit, jsonError, readJson } from "@/lib/security";

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    await consumeRateLimit(request,"orders",10,60_000);
    const result = await createOrder(await readJson(request));
    return NextResponse.json(result,{status:201,headers:{"Cache-Control":"no-store"}});
  } catch (error) { return jsonError(error); }
}
