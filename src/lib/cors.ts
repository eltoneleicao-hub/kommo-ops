import { NextResponse } from "next/server";

/** Adiciona headers CORS a uma resposta (permite chamadas do widget Kommo). */
export function withCors(response: NextResponse, origin?: string | null): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

/** Resposta padrão para preflight OPTIONS. */
export function corsPreflight(origin?: string | null): Response {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
