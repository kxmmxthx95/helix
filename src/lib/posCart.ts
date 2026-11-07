import type { PosProduct } from "@/lib/database.types";

/** Same bound as pos_sale / pos_sale_items (migration 0124): one sale is at most 500 baht, a line at most 99. */
export const CART_MAX_TOTAL = 500;
export const LINE_MAX_QTY = 99;

export type CartLine = { product: PosProduct; qty: number };

/** Products are printed as P-000123 — the prefix keeps them apart from student barcodes (qr_…) and student codes. */
export const isProductCode = (raw: string) => /^P-\d{6,}$/.test(raw.trim());

/** Adds one of `product`, or bumps its line. */
export function addToCart(cart: CartLine[], product: PosProduct): CartLine[] {
  const hit = cart.find((l) => l.product.id === product.id);
  return hit
    ? cart.map((l) => (l === hit ? { ...l, qty: Math.min(l.qty + 1, LINE_MAX_QTY) } : l))
    : [...cart, { product, qty: 1 }];
}

/** Sets a line's quantity; 0 (or less) removes it. */
export function setQty(cart: CartLine[], productId: string, qty: number): CartLine[] {
  return cart.flatMap((l) => (l.product.id !== productId ? [l] : qty <= 0 ? [] : [{ ...l, qty: Math.min(qty, LINE_MAX_QTY) }]));
}

export const cartTotal = (cart: CartLine[]) => cart.reduce((sum, l) => sum + l.product.price * l.qty, 0);

/** Group label for a product; null / blank categories collect under "อื่นๆ". */
export const categoryOf = (p: Pick<PosProduct, "category">) => p.category?.trim() || "อื่นๆ";
