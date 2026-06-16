export type StockMovementType = "entrada" | "reserva" | "baixa" | "cancelamento_reserva" | "ajuste";

type StockBalanceQuantities = {
  availableQty: number;
  reservedQty: number;
};

export class NegativeStockBalanceError extends Error {
  constructor() {
    super("negative_balance");
  }
}

export class ProductOrLocationNotFoundError extends Error {
  constructor() {
    super("product_or_location_not_found");
  }
}

export function applyStockMovement(
  balance: StockBalanceQuantities,
  type: StockMovementType,
  qty: number,
): StockBalanceQuantities {
  const nextBalance = { ...balance };

  if (type === "entrada" || type === "ajuste") {
    nextBalance.availableQty += qty;
  }

  if (type === "reserva") {
    nextBalance.availableQty -= qty;
    nextBalance.reservedQty += qty;
  }

  if (type === "cancelamento_reserva") {
    nextBalance.availableQty += qty;
    nextBalance.reservedQty -= qty;
  }

  if (type === "baixa") {
    nextBalance.reservedQty -= qty;
  }

  if (nextBalance.availableQty < 0 || nextBalance.reservedQty < 0) {
    throw new NegativeStockBalanceError();
  }

  return nextBalance;
}
