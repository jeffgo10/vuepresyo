import type { ExtractedReceipt } from "./types";

/**
 * Short Lee Hypermart-style receipt whose lines and VAT actually add up.
 * The vault excerpt is five of 26 lines and does not sum to ₱3,166.75, so this
 * fixture uses its own consistent total. Yakult stays struck through and the
 * rice SKU stays unclear so the review screen still has something to check.
 */
export const SAMPLE_RECEIPT: ExtractedReceipt = {
  store: {
    name: "Lee Hypermart",
    branch: "Dumaguete City",
    date: "2026-10-11",
    time: "10:23",
    invoiceNo: "00-104427",
  },
  items: [
    {
      sku: "8850096848503",
      rawName: "BLUE DIAMOND MILK ALMOND 0",
      name: "Blue Diamond Milk Almond 0",
      qty: 1,
      unitPrice: 57.25,
      lineTotal: 57.25,
      vatType: "VAT",
      flags: [],
    },
    {
      sku: "8997035600560",
      rawName: "POCARI SWEAT ION DRINK PET",
      name: "Pocari Sweat Ion Drink Pet",
      qty: 2,
      unitPrice: 158,
      lineTotal: 316,
      vatType: "VAT",
      flags: [],
    },
    {
      sku: "05402367911",
      rawName: "YAKULT MILK 5S",
      name: "Yakult Milk 5s",
      qty: 2,
      unitPrice: 50,
      lineTotal: 100,
      vatType: "VAT",
      flags: ["struck_through"],
    },
    {
      sku: "8822001703870",
      rawName: "SAMPAGUITA RICE 10KG",
      name: "Sampaguita Rice 10kg",
      qty: 1,
      unitPrice: 606,
      lineTotal: 606,
      vatType: "EXEMPT",
      flags: ["unclear_sku"],
    },
    {
      sku: "8107013655691",
      rawName: "SANDO BAG BIODEGRADABLE 12",
      name: "Sando Bag Biodegradable 12",
      qty: 2,
      unitPrice: 0,
      lineTotal: 0,
      vatType: "FREE",
      flags: [],
    },
  ],
  totals: {
    subtotal: null,
    vatableNet: 422.54,
    vatExemptSales: 606,
    vat: 50.71,
    total: 1079.25,
  },
};
