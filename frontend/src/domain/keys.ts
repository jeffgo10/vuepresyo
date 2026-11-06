/** Realtime Database keys cannot contain . # $ [ ] / */
const FORBIDDEN_KEY_CHARS = /[.#$[\]/]/g;

export function sanitizeKeyPart(value: string): string {
  return value.replace(FORBIDDEN_KEY_CHARS, "_");
}

export function storeIdFromName(name: string, branch: string | null): string {
  const raw = [name, branch ?? ""].join(" ").trim().toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitizeKeyPart(slug || "store");
}

export function itemKey(storeId: string, sku: string | null, rawName: string): string {
  const skuPart = sku && sku.trim()
    ? sanitizeKeyPart(sku.trim())
    : sanitizeKeyPart(rawName.trim().toLowerCase().replace(/\s+/g, "-") || "item");
  return `${sanitizeKeyPart(storeId)}_${skuPart}`;
}

/** Stable duplicate id. Total is in centavos so the key has no decimal point. */
export function duplicateIndexKey(
  storeId: string,
  date: string,
  invoiceNo: string | null,
  total: number,
): string {
  const cents = Math.round(total * 100);
  const invoice = sanitizeKeyPart((invoiceNo ?? "no-invoice").trim() || "no-invoice");
  return `${sanitizeKeyPart(storeId)}_${date}_${invoice}_${cents}`;
}

export function storageObjectPath(id: string): string {
  return `receipts/GO/${id}.jpg`;
}

const STORAGE_PATH = /^receipts\/GO\/[A-Za-z0-9-]{8,80}\.jpg$/;

export function isReceiptImagePath(path: string): boolean {
  return STORAGE_PATH.test(path);
}

export const MAX_PRODUCT_PHOTOS = 5;

export function productImagePath(itemKey: string): string {
  return `products/GO/${sanitizeKeyPart(itemKey)}.jpg`;
}

export function productImageObjectPath(itemKey: string, index = 0): string {
  const suffix = index === 0 ? "" : `_${index}`;
  return `products/GO/${sanitizeKeyPart(itemKey)}${suffix}.jpg`;
}

export function enlistImageObjectPath(tempId: string, index = 0): string {
  return `products/GO/enlist_${sanitizeKeyPart(tempId)}_${index}.jpg`;
}

const PRODUCT_IMAGE_PREFIX = "products/GO/";
const PRODUCT_IMAGE_SUFFIX = ".jpg";


export function isProductImagePath(path: string): boolean {
  if (typeof path !== "string") return false;
  if (!path.startsWith(PRODUCT_IMAGE_PREFIX) || !path.endsWith(PRODUCT_IMAGE_SUFFIX)) {
    return false;
  }
  const fileName = path.slice(PRODUCT_IMAGE_PREFIX.length, -PRODUCT_IMAGE_SUFFIX.length);
  if (fileName.length < 1 || fileName.length > 200) return false;
  if (/[.#$[\]/]/.test(fileName)) return false;
  if (/[\x00-\x1f\x7f\s]/.test(fileName)) return false;
  return true;
}

export function isItemKey(value: string): boolean {
  if (typeof value !== "string") return false;
  if (value.length < 1 || value.length > 200) return false;
  if (/[.#$[\]/]/.test(value)) return false;
  if (/[\x00-\x1f\x7f\s]/.test(value)) return false;
  return true;
}

