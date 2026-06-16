/**
 * Exemplo de como adicionar CORS headers ao endpoint da Kommo
 *
 * Coloque isso na rota: src/app/api/kommo/requests/route.ts
 *
 * Adicione ao arquivo existente:
 */

import { NextRequest, NextResponse } from "next/server";

// ... seu código existente ...

/**
 * Handler OPTIONS para preflight CORS
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Permitir requests de qualquer origem (você pode restringir para *.kommo.com)
  const allowedOrigins = [
    /^https:\/\/.*\.kommo\.com$/,  // Qualquer subdomínio da Kommo
    "http://localhost:3000",        // Desenvolvimento local
  ];

  const isAllowed = allowedOrigins.some((allowed) => {
    if (typeof allowed === "string") {
      return origin === allowed;
    }
    return allowed.test(origin || "");
  });

  if (!isAllowed) {
    return NextResponse.json({ error: "CORS not allowed" }, { status: 403 });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400", // 24 horas
    },
  });
}

/**
 * Sua função POST existente
 */
export async function POST(request: NextRequest) {
  // ... seu código de validação ...

  const origin = request.headers.get("origin");

  // Processar requisição normalmente
  const response = NextResponse.json({
    requestId: "...",
    status: "etiqueta_gerada",
    missingFields: [],
    labelId: "...",
  });

  // Adicionar headers CORS na resposta
  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return response;
}
