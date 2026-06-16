import { describe, expect, it } from "vitest";
import { getRequestStatusForMissingFields } from "./requests";

describe("request domain", () => {
  it("marks requests without missing fields as ready for label", () => {
    expect(getRequestStatusForMissingFields([])).toBe("pronto_para_etiqueta");
  });

  it("marks requests with missing fields as incomplete", () => {
    expect(getRequestStatusForMissingFields(["CEP"])).toBe("campos_incompletos");
  });
});
