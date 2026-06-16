import { describe, expect, it } from "vitest";
import { applyStockMovement } from "./stock";

describe("stock domain", () => {
  it("reserves stock by moving quantity from available to reserved", () => {
    expect(applyStockMovement({ availableQty: 10, reservedQty: 2 }, "reserva", 3)).toEqual({
      availableQty: 7,
      reservedQty: 5,
    });
  });

  it("cancels a reservation by moving quantity back to available", () => {
    expect(applyStockMovement({ availableQty: 7, reservedQty: 5 }, "cancelamento_reserva", 2)).toEqual({
      availableQty: 9,
      reservedQty: 3,
    });
  });

  it("adds stock on entry and adjustment movements", () => {
    expect(applyStockMovement({ availableQty: 10, reservedQty: 2 }, "entrada", 4)).toEqual({
      availableQty: 14,
      reservedQty: 2,
    });
    expect(applyStockMovement({ availableQty: 10, reservedQty: 2 }, "ajuste", 4)).toEqual({
      availableQty: 14,
      reservedQty: 2,
    });
  });

  it("lowers reserved quantity on stock write-off", () => {
    expect(applyStockMovement({ availableQty: 7, reservedQty: 5 }, "baixa", 3)).toEqual({
      availableQty: 7,
      reservedQty: 2,
    });
  });

  it("rejects movements that would make available quantity negative", () => {
    expect(() => applyStockMovement({ availableQty: 1, reservedQty: 0 }, "reserva", 2)).toThrow(
      "negative_balance",
    );
  });

  it("rejects movements that would make reserved quantity negative", () => {
    expect(() => applyStockMovement({ availableQty: 0, reservedQty: 1 }, "baixa", 2)).toThrow(
      "negative_balance",
    );
  });
});
