# VuePresyo Receipts

Prices are VAT-inclusive PHP. Never subtract VAT from `unitPrice` or `lineTotal`.

## Validation

Run in `frontend/src/domain/receiptValidation.ts` and again inside `ReceiptValidator.Validate` (`backend/VuePresyo.Api/Domain/ReceiptValidator.cs`) before any write:

1. Sum of `lineTotal` equals `totals.total`.
2. Sum of VATable line totals × 12/112 ≈ printed `totals.vat`.
3. `vatableNet + vatExemptSales + vat` ≈ `total`.
4. Do not check `subtotal + VAT = total`. That is a US-style receipt formula.

`FREE` lines have `lineTotal` 0 and are excluded from price history. Flags (`struck_through`, `unclear_name`, `unclear_price`, `unclear_sku`) or a mismatch keep the user on the review screen. There is no auto-save.

## Keys and Writes

- Item id is `{storeId}_{sanitizedSku}` (`VuePresyoKeys.BuildProductItemKey`). Keys sanitize `. # $ [ ] /`.
- `saveReceipt` rejects a duplicate of store + date + invoice number + total (`DuplicateKey` unique index).
- Writes: `Stores`, `Products`, `Receipts`, `ReceiptItems`, `PriceHistory`, `PriceChanges` in `AppDbContext`.
- `saveReceipt` compares each non-free unit price with the previous purchase of `{storeId}_{sku}`, sorted by receipt date. `PriceChanges` is replaced with peso and percent deltas. The home screen shows this month's increases and decreases. A repeated price writes history and clears that item's changes.
- `scanReceipt` returns JSON plus validation. It does not persist. The sample fixture skips Gemini.
- Before upload, the scan screen runs Tesseract.js in the browser (`frontend/src/helpers/ocr/`). A photo with too little text, or text with no prices and no receipt words, stops there and Gemini is not called. The sample receipt skips this check.
- A later `saveReceipt` does not overwrite an existing product `name`, `imagePath`, or `productId`. `rawName` still follows the latest receipt.
- Package photos are optional and separate from the receipt photo. Home asks for one product that has no photo. Gemini may suggest a display name; `name` changes only after confirm. A confirmed match shares `productId`. `PriceHistory` stays per store.
- Compare reads `products`, `stores`, and `priceHistory`. It lists a `productId` only when that item has a latest price at two or more stores. Pack size is read from the name (`500ml`, `1L`, `10kg`, `5s`, `6 x 330ml`). Same pack compares the shelf price. Different packs of one kind compare per 1L, per 1kg, or per piece, and the card still shows the shelf price. A price older than 30 days is marked stale.
- Items lists every priced product. A shared `productId` is one row showing purchase count and cheapest latest shelf price.

## Privacy

The Gemini prompt must not ask for buyer name, address, or TIN. Drop those fields if a model returns them.

