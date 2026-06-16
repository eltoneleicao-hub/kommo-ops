import type { RequestStatus } from "@prisma/client";

export function getRequestStatusForMissingFields(missingFields: string[]): RequestStatus {
  return missingFields.length === 0 ? "pronto_para_etiqueta" : "campos_incompletos";
}
