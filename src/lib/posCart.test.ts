import { describe, expect, it } from "vitest";
import type { PosProduct } from "@/lib/database.types";
import { addToCart, cartTotal, categoryOf, isProductCode, setQty } from "@/lib/posCart";

const p = (id: string, price: number): PosProduct => ({
  id, code: `P-00000${id}`, name: `สินค้า ${id}`, price, category: null, active: true, image_path: null, created_at: "", updated_at: "",
});

describe("posCart", () => {
  it("scanning the same product again bumps its quantity", () => {
    const cart = addToCart(addToCart([], p("1", 10)), p("1", 10));
    expect(cart).toHaveLength(1);
    expect(cart[0]?.qty).toBe(2);
  });

  it("totals price × qty across lines and drops a line at qty 0", () => {
    let cart = addToCart(addToCart(addToCart([], p("1", 10)), p("2", 25)), p("2", 25));
    expect(cartTotal(cart)).toBe(60);
    cart = setQty(cart, "2", 0);
    expect(cart.map((l) => l.product.id)).toEqual(["1"]);
    expect(cartTotal(cart)).toBe(10);
  });

  it("caps a line at 99", () => {
    expect(setQty(addToCart([], p("1", 1)), "1", 500)[0]?.qty).toBe(99);
  });

  it("tells product codes from student barcodes and codes", () => {
    expect(isProductCode("P-000123")).toBe(true);
    expect(isProductCode("qr_abc")).toBe(false);
    expect(isProductCode("12345")).toBe(false);
  });

  it("groups blank categories under อื่นๆ", () => {
    expect(categoryOf({ category: " " })).toBe("อื่นๆ");
    expect(categoryOf({ category: "เครื่องดื่ม" })).toBe("เครื่องดื่ม");
  });
});
