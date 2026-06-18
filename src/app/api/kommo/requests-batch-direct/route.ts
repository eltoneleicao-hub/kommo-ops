/**
 * POST /api/kommo/requests-batch-direct
 *
 * Gera etiquetas em lote a partir de payloads de leads vindos DIRETO do Kommo
 * (lidos pelo widget via sessão), sem depender do banco local já estar
 * populado. Resolve a limitação do /requests-batch, que só enxergava leads que
 * já tinham passado por geração de etiqueta.
 *
 * Modos:
 *   - validateOnly: true  → só devolve elegibilidade/campos faltando (sem gravar).
 *   - validateOnly: false → faz upsert + gera etiqueta + deduz estoque.
 *
 * Payload: { secret, deductStock?, validateOnly?, leads: [LeadPayload] }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { renderLabelText, validateLabelInput, labelDedupeKey } from "@/domain/labels";
import { getRequestStatusForMissingFields } from "@/domain/requests";
import { resolveRegion } from "@/domain/region-resolver";
import { fixMojibake } from "@/domain/encoding";
import { withCors, corsPreflight } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request.headers.get("origin"));
}

const leadSchema = z.object({
  kommoLeadId: z.string().min(1),
  kommoContactId: z.string().optional(),
  kommoPipelineId: z.string().min(1),
  kommoStageId: z.string().min(1),
  recipientName: z.string().optional(),
  recipientPhone: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  complement: z.string().optional(),
  internalOrderNotes: z.string().optional(),
  kommoUrl: z.string().optional(),
});

const payloadSchema = z.object({
  secret: z.string().min(1),
  deductStock: z.boolean().optional().default(false),
  validateOnly: z.boolean().optional().default(false),
  // false (padrão): NÃO re-enfileira etiquetas já "impresso" — re-rodar o lote
  // imprime só as novas/corrigidas. true: força reimpressão das já impressas.
  reprintPrinted: z.boolean().optional().default(false),
  // true: gera etiqueta mesmo com campos faltando (imprimir não-elegíveis).
  forceIncomplete: z.boolean().optional().default(false),
  leads: z.array(leadSchema).min(1).max(500),
});

type LeadPayload = z.infer<typeof leadSchema>;

// Conserta mojibake (acentos corrompidos por import CSV/Windows no Kommo) em
// todos os campos de texto, ANTES de validar/resolver região/gravar. Mantém os
// não-texto (IDs, URL) intactos.
const sanitizeLead = (l: LeadPayload): LeadPayload => ({
  ...l,
  recipientName: fixMojibake(l.recipientName),
  street: fixMojibake(l.street),
  neighborhood: fixMojibake(l.neighborhood),
  city: fixMojibake(l.city),
  complement: fixMojibake(l.complement),
  internalOrderNotes: fixMojibake(l.internalOrderNotes),
});

const labelInputOf = (l: LeadPayload) => ({
  recipientName: l.recipientName,
  recipientPhone: l.recipientPhone,
  street: l.street,
  number: l.number,
  neighborhood: l.neighborhood,
  postalCode: l.postalCode,
  city: l.city,
  complement: l.complement,
  internalOrderNotes: l.internalOrderNotes,
});

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return withCors(NextResponse.json({ error: "invalid_payload" }, { status: 400 }), origin);
  }
  if (parsed.data.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return withCors(NextResponse.json({ error: "unauthorized" }, { status: 401 }), origin);
  }

  const { deductStock, validateOnly, reprintPrinted, forceIncomplete } = parsed.data;
  const leads = parsed.data.leads.map(sanitizeLead);

  // ── Deduplicação ──────────────────────────────────────────────────────────
  // Carrega a assinatura (nome+endereço) de TODA etiqueta já existente (não-erro)
  // e mapeia para os leads donos. Um lead é DUPLICADO se sua assinatura já
  // pertence a OUTRO lead (não conta a si mesmo: reimpressão é permitida).
  const existingLabels = await prisma.label.findMany({
    where: { printStatus: { not: "erro" } },
    select: {
      MaterialRequest: {
        select: {
          kommoLeadId: true, recipientName: true, street: true,
          number: true, neighborhood: true, postalCode: true, city: true,
        },
      },
    },
  });
  const keyToLeads = new Map<string, Set<string>>();
  for (const lab of existingLabels) {
    const mr = lab.MaterialRequest;
    if (!mr) continue;
    const k = labelDedupeKey(mr);
    if (!k) continue;
    if (!keyToLeads.has(k)) keyToLeads.set(k, new Set());
    keyToLeads.get(k)!.add(mr.kommoLeadId ?? "");
  }
  // Devolve o lead-dono de uma assinatura, se for OUTRO lead (DB ou lote atual).
  const dupOwnerOf = (l: LeadPayload, seen: Map<string, string>): string | null => {
    const k = labelDedupeKey(l);
    if (!k) return null;
    const owners = keyToLeads.get(k);
    if (owners) { for (const id of owners) if (id && id !== l.kommoLeadId) return id; }
    const s = seen.get(k);
    return s && s !== l.kommoLeadId ? s : null;
  };

  // Modo validação: devolve elegibilidade + flag de duplicado (não grava nada).
  if (validateOnly) {
    const seen = new Map<string, string>();
    return withCors(
      NextResponse.json({
        total: leads.length,
        leads: leads.map((l) => {
          const missing = validateLabelInput(labelInputOf(l));
          const duplicateOf = dupOwnerOf(l, seen);
          const k = labelDedupeKey(l);
          if (k && !seen.has(k)) seen.set(k, l.kommoLeadId);
          return {
            kommoLeadId: l.kommoLeadId,
            recipientName: l.recipientName ?? "",
            neighborhood: l.neighborhood ?? "",
            regiao: resolveRegion(l.neighborhood, l.postalCode).regiao,
            eligible: missing.length === 0,
            missingFields: missing,
            duplicate: duplicateOf != null,
            duplicateOf: duplicateOf,
          };
        }),
      }),
      origin,
    );
  }

  // Marca duplicados na ordem do lote: o 1º com uma assinatura vence, os demais
  // (deste lote ou já existentes no banco) são pulados pra não imprimir 2x.
  const seenGen = new Map<string, string>();
  const dupOf = new Map<string, string>(); // kommoLeadId -> lead-dono
  for (const l of leads) {
    const owner = dupOwnerOf(l, seenGen);
    if (owner) dupOf.set(l.kommoLeadId, owner);
    const k = labelDedupeKey(l);
    if (k && !seenGen.has(k)) seenGen.set(k, l.kommoLeadId);
  }

  // Pré-checagem de estoque só p/ elegíveis NÃO-duplicados (evita gerar parcial).
  const eligible = leads.filter(
    (l) => !dupOf.has(l.kommoLeadId) && validateLabelInput(labelInputOf(l)).length === 0,
  ).length;
  if (deductStock && eligible > 0) {
    const sku = process.env.STOCK_PRODUCT_SKU;
    const locationName = process.env.STOCK_LOCATION_NAME;
    if (sku && locationName) {
      const product = await prisma.product.findUnique({ where: { sku } });
      const location = await prisma.stockLocation.findFirst({ where: { name: locationName, active: true } });
      if (product && location) {
        const balance = await prisma.stockBalance.findUnique({
          where: { productId_locationId: { productId: product.id, locationId: location.id } },
        });
        const available = balance?.availableQty ?? 0;
        if (available < eligible) {
          return withCors(
            NextResponse.json(
              {
                error: "insufficient_stock",
                available,
                needed: eligible,
                message: `Estoque insuficiente. Disponível: ${available}, necessário: ${eligible}`,
              },
              { status: 409 },
            ),
            origin,
          );
        }
      }
    }
  }

  let generated = 0;
  let incomplete = 0;
  let stockDeducted = 0;
  let duplicates = 0;
  let alreadyPrinted = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const l of leads) {
    // Trava de duplicado: mesmo destinatário que outro lead → não gera/imprime.
    if (dupOf.has(l.kommoLeadId)) {
      duplicates++;
      results.push({ kommoLeadId: l.kommoLeadId, status: "duplicado", duplicateOf: dupOf.get(l.kommoLeadId) });
      continue;
    }
    try {
      const labelInput = labelInputOf(l);
      const missingFields = validateLabelInput(labelInput);
      const status = getRequestStatusForMissingFields(missingFields);
      const kommoKey = {
        kommoLeadId: l.kommoLeadId,
        kommoPipelineId: l.kommoPipelineId,
        kommoStageId: l.kommoStageId,
      };
      const data = {
        kommoContactId: l.kommoContactId,
        status,
        missingFields,
        recipientName: l.recipientName,
        recipientPhone: l.recipientPhone,
        street: l.street,
        number: l.number,
        neighborhood: l.neighborhood,
        postalCode: l.postalCode,
        city: l.city,
        complement: l.complement,
        internalOrderNotes: l.internalOrderNotes,
        kommoUrl: l.kommoUrl,
      };

      // Tudo do lead numa única transação (upsert + etiqueta + estoque).
      const outcome = await prisma.$transaction(async (tx) => {
        const materialRequest = await tx.materialRequest.upsert({
          where: { kommoLeadId_kommoPipelineId_kommoStageId: kommoKey },
          create: { source: "kommo", ...kommoKey, ...data },
          update: data,
        });

        // Campos faltando → não gera, A MENOS que forceIncomplete (imprime com o
        // que tiver: a etiqueta pula as linhas vazias).
        if (missingFields.length > 0 && !forceIncomplete) {
          return { generated: false, deducted: false };
        }

        const existing = await tx.label.findUnique({ where: { requestId: materialRequest.id } });
        if (existing) {
          // Já impressa e sem forçar reimpressão → PULA (não re-enfileira).
          if (existing.printStatus === "impresso" && !reprintPrinted) {
            return { generated: false, deducted: false, alreadyPrinted: true };
          }
          await tx.label.update({
            where: { id: existing.id },
            data: { content: renderLabelText(labelInput), printStatus: "pendente", printedAt: null, errorMessage: null },
          });
          if (materialRequest.status !== "etiqueta_gerada") {
            await tx.materialRequest.update({ where: { id: materialRequest.id }, data: { status: "etiqueta_gerada" } });
          }
          return { generated: true, deducted: false }; // reimpressão: não deduz estoque
        }

        await tx.label.create({
          data: { requestId: materialRequest.id, format: "text", content: renderLabelText(labelInput) },
        });
        await tx.materialRequest.update({ where: { id: materialRequest.id }, data: { status: "etiqueta_gerada" } });

        let deducted = false;
        if (deductStock) {
          const sku = process.env.STOCK_PRODUCT_SKU;
          const locationName = process.env.STOCK_LOCATION_NAME;
          if (sku && locationName) {
            const product = await tx.product.findUnique({ where: { sku } });
            const location = await tx.stockLocation.findFirst({ where: { name: locationName, active: true } });
            if (product && location) {
              const upd = await tx.stockBalance.updateMany({
                where: { productId: product.id, locationId: location.id, availableQty: { gte: 1 } },
                data: { availableQty: { decrement: 1 } },
              });
              if (upd.count > 0) {
                await tx.stockMovement.create({
                  data: {
                    productId: product.id,
                    locationId: location.id,
                    type: "baixa",
                    qty: 1,
                    source: "kommo",
                    sourceRef: l.kommoLeadId,
                    reason: "Etiqueta gerada via lote (Kommo direto)",
                  },
                });
                deducted = true;
              }
            }
          }
        }
        return { generated: true, deducted };
      });

      if (outcome.alreadyPrinted) {
        alreadyPrinted++;
        results.push({ kommoLeadId: l.kommoLeadId, status: "ja_impresso" });
      } else if (!outcome.generated) {
        incomplete++;
        results.push({ kommoLeadId: l.kommoLeadId, status: "campos_incompletos", missingFields });
      } else {
        generated++;
        if (outcome.deducted) stockDeducted++;
        results.push({ kommoLeadId: l.kommoLeadId, status: "etiqueta_gerada" });
      }
    } catch (error) {
      console.error(`[BatchDirect] Erro no lead ${l.kommoLeadId}:`, error);
      results.push({
        kommoLeadId: l.kommoLeadId,
        status: "erro",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }

  return withCors(
    NextResponse.json({
      generated, incomplete, duplicates, alreadyPrinted,
      total: generated + incomplete + duplicates + alreadyPrinted, stockDeducted, results,
    }),
    origin,
  );
}
