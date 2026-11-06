using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using VuePresyo.Api.Domain;
using VuePresyo.Api.Models;

namespace VuePresyo.Api.Services;

public record GeminiPackageDescription(
    string SuggestedName,
    string SuggestedProductType,
    string SuggestedSku,
    string SuggestedUnit,
    List<string> SameItemKeys
);

public class GeminiService(HttpClient httpClient, IConfiguration config)
{
    public const string GeminiModel = "gemini-3.8-flash";

    private const string ReceiptRequest = "Extract the receipt in this image following the system rules. Return only the JSON object.";

    private const string ReceiptSystemPrompt = """
You are a receipt data extraction engine for VuePresyo, a price-tracking app used in the Philippines. You receive one photo of a receipt and return only a JSON object that follows the schema. No explanation, no markdown, no code fences.

Rules:

1. Currency is Philippine peso (PHP). Use plain numbers with a decimal point, no commas or currency symbols.

2. Store info:
   - store.name: the retailer's brand name (e.g. "Lee Hypermart"), not the operating company.
   - store.branch: city or branch location if printed, else null.
   - store.date: ISO format YYYY-MM-DD.
   - store.time: 24-hour HH:MM if printed, else null.
   - store.invoiceNo: the sales invoice or official receipt number (e.g. "SI #", "OR #"), else null.
   - Do NOT extract the buyer's name, address, or customer details. Do NOT extract the buyer's TIN.

3. Items: one entry per product line. Do not merge duplicate products. For each:
   - sku: the barcode or item code printed before the product name, kept exactly as printed (digits only, no spaces). If none is printed, use null.
   - rawName: the product name exactly as printed, including abbreviations. Do not expand or correct it.
   - qty: quantity purchased (integer, or decimal for weighted items).
   - unitPrice: price per unit as printed. This is VAT-inclusive.
   - lineTotal: total for the line as printed. This is VAT-inclusive.
   - vatType: one of:
     - "VAT" if the line has a V marker or the item is taxable.
     - "EXEMPT" if the line has an N marker or is VAT-exempt.
     - "FREE" if the lineTotal is 0.00.
     - null if you cannot tell.
   - flags: an array of any of these strings that apply:
     - "struck_through" if the line appears crossed out.
     - "unclear_name" if you are not confident in the product name.
     - "unclear_price" if you are not confident in a price or quantity.
     - "unclear_sku" if you are not confident in the SKU digits.
   Use an empty array when none apply.

4. Prices are VAT-inclusive. Never subtract VAT from unitPrice or lineTotal. Copy the printed values.

5. Totals:
   - totals.vatableNet: VATable sales before VAT, if printed (else null).
   - totals.vatExemptSales: VAT-exempt sales, if printed (else 0).
   - totals.vat: the printed VAT amount, if printed (else null).
   - totals.total: the amount due or total paid. If the grand total is not explicitly labeled, use the sum of line totals.
   - totals.subtotal: the printed subtotal, if any, else null.

6. Do not invent values. If a field is not visible, use null (or an empty array for lists). Never guess a price.

7. If the image is not a receipt, or is too blurry or cropped to read, return:
   {"error": "reason", "store": null, "items": null, "totals": null} with a short reason in error.
   Otherwise, error must be null, and you must extract store, items, and totals.
""";

    private const string PackagePrompt = """
You identify grocery packages and packaging units for a Philippine household. You receive 1 or more photos of a package (e.g. front packaging, back label, barcode, or nutritional facts), then zero or more candidate photos from other stores.

Correlate details across all photos:
Return JSON only.
- suggestedName: the brand, product variant, and pack size or count (e.g. "Bear Brand Fortified Powdered Milk 300g", "Pocari Sweat 500ml").
  * MULTI-PACKS / BOXES: If the package is a multi-pack, box, or bundle containing multiple sachets, pouches, sticks, or cans (e.g. a box containing 8 sachets, or a 6-pack of 330ml cans), ALWAYS include the count or multiplier in suggestedName (e.g. "Swiss Miss Milk Chocolate 8s", "Swiss Miss Milk Chocolate 8 x 28g", "San Miguel Pale Pilsen 6 x 330ml", "Nescafe 3in1 30s").
  * SINGLE UNITS / SACHETS: Include the net weight or "1pc"/"1s" (e.g. "Swiss Miss Milk Chocolate 28g", "Swiss Miss Milk Chocolate 1pc", "Coke 330ml").
  * Use a shopper-facing name. Do not invent details you cannot see. Empty string if unreadable.
- suggestedProductType: concise grocery item category or type (e.g. "Hot Cocoa", "Coconut Oil", "Rosquillos", "Almond Milk", "Soy Sauce", "Corned Beef", "Powdered Milk", "Dishwashing Liquid", "Rice"). Empty string if unknown.
- suggestedSku: barcode digits (UPC/EAN) or retailer item code if visible on the back or packaging. Digits only, no spaces. Empty string if not visible.
- suggestedUnit: packaging unit / Unit of Measure (UOM) recognized from the photos (e.g. "box", "sachet", "can", "bottle", "pack", "pouch", "stick", "roll", "bag", "pc", "kg", "g", "L", "ml"). Default to "pc" if unknown or standard piece.
- sameItemKeys: at most one candidate key, copied exactly, when that package is the same item a shopper would buy. A different flavor or variant is not the same item. Use an empty array when none match.
""";

    private const string EnlistRequest = "Extract the grocery item details from these photos following the system rules. Return only the JSON object.";

    private const string EnlistSystemPrompt = """
You are an item data extraction engine for VuePresyo, a grocery price-tracking app in the Philippines.
You receive 1 to 5 photos of a single grocery product (e.g. front packaging, back label, barcode, shelf price tag, or nutritional facts).

Correlate details across all provided images:
1. suggestedName: Shopper-facing clean product name including brand, product variant, and pack size / count.
   - For multi-packs, boxes, or bundles containing multiple inner units (e.g. a box of 8 sachets, 10 sticks, or 6-pack cans), format with count or multiplier (e.g. "Swiss Miss Milk Chocolate 8s", "Swiss Miss Milk Chocolate 8 x 28g", "Coke 6 x 330ml", "Nescafe 3in1 30s").
   - For single units or individual sachets, include the unit weight/volume or "1pc"/"1s" (e.g. "Swiss Miss Milk Chocolate 28g" or "Swiss Miss Milk Chocolate 1pc").
   If unreadable or not a product, return null.
2. suggestedProductType: Concise grocery product type (e.g. "Hot Cocoa", "Coconut Oil", "Rosquillos", "Almond Milk", "Soy Sauce", "Corned Beef", "Instant Noodles", "Dishwashing Liquid"). If unknown, return null.
3. price: The printed shelf price, tagged price, or promotional sticker price in Philippine Peso (PHP) if visible in any photo. Return plain number with decimals (e.g. 45.50). If no price tag or shelf price is visible, return null.
4. sku: The barcode digits (UPC/EAN) or retailer item code if visible on the packaging or price tag. Digits only, no spaces. If not visible, return null.
5. unit: Packaging unit / Unit of Measure (UOM) recognizable from the packaging or shelf tag (e.g. "box", "sachet", "bottle", "can", "pack", "pouch", "stick", "roll", "bag", "pc", "kg", "g", "L", "ml"). If unknown, default to "pc".

Do not invent values. If not visible or uncertain, return null. Return JSON only following the schema.
""";

    public string GetApiKey()
    {
        return (config["Gemini:ApiKey"] ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY") ?? string.Empty).Trim();
    }

    public async Task<ExtractedReceiptDto> ExtractReceiptAsync(byte[] imageBytes, IReadOnlyList<StoreEntity> knownStores)
    {
        var apiKey = GetApiKey();
        if (string.IsNullOrEmpty(apiKey))
            throw new InvalidOperationException("Gemini key is not configured. Use the sample receipt, or set GEMINI_API_KEY.");

        var systemPrompt = ReceiptSystemPrompt;
        if (knownStores.Count > 0)
        {
            var storeLines = string.Join("\n", knownStores.Take(20).Select(s =>
                $"- \"{s.Name}\"{(!string.IsNullOrWhiteSpace(s.Branch) ? $" (branch: \"{s.Branch}\")" : "")}"));
            systemPrompt += $"\n\n8. Known stores in our database:\n{storeLines}\nIf the receipt matches one of these known stores, use the exact store.name and store.branch listed above.";
        }

        var parts = new List<object>
        {
            new { text = ReceiptRequest },
            new { inlineData = new { mimeType = "image/jpeg", data = Convert.ToBase64String(imageBytes) } }
        };

        var jsonText = await CallGeminiJsonAsync(apiKey, systemPrompt, parts);
        var root = JsonNode.Parse(jsonText)?.AsObject()
            ?? throw new InvalidOperationException("Gemini returned invalid JSON.");

        var errorText = root["error"]?.GetValue<string>()?.Trim();
        if (!string.IsNullOrEmpty(errorText))
            throw new ArgumentException(errorText);

        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var dto = JsonSerializer.Deserialize<ExtractedReceiptDto>(jsonText, opts)
            ?? throw new InvalidOperationException("Gemini returned an empty extraction.");
        return ReceiptValidator.NormalizeExtraction(dto);
    }

    public async Task<GeminiPackageDescription> DescribePackageAsync(
        IReadOnlyList<byte[]> images,
        IReadOnlyList<(string Key, string Name, byte[] Image)> candidates)
    {
        var apiKey = GetApiKey();
        var parts = new List<object>();
        for (int i = 0; i < images.Count; i++)
        {
            parts.Add(new { text = $"Package photo {i + 1} of {images.Count} (packaging, labels, barcode, or size):" });
            parts.Add(new { inlineData = new { mimeType = "image/jpeg", data = Convert.ToBase64String(images[i]) } });
        }
        foreach (var cand in candidates)
        {
            parts.Add(new { text = $"Candidate key {cand.Key}. Current name: {cand.Name}." });
            parts.Add(new { inlineData = new { mimeType = "image/jpeg", data = Convert.ToBase64String(cand.Image) } });
        }

        var jsonText = await CallGeminiJsonAsync(apiKey, PackagePrompt, parts);
        var root = JsonNode.Parse(jsonText)?.AsObject()
            ?? throw new InvalidOperationException("The package photo could not be read.");

        var sameKeys = new List<string>();
        if (root["sameItemKeys"] is JsonArray arr)
        {
            foreach (var item in arr)
            {
                var k = item?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(k)) sameKeys.Add(k);
            }
        }

        return new GeminiPackageDescription(
            SuggestedName: root["suggestedName"]?.GetValue<string>() ?? string.Empty,
            SuggestedProductType: root["suggestedProductType"]?.GetValue<string>() ?? string.Empty,
            SuggestedSku: root["suggestedSku"]?.GetValue<string>() ?? string.Empty,
            SuggestedUnit: root["suggestedUnit"]?.GetValue<string>() ?? string.Empty,
            SameItemKeys: sameKeys
        );
    }

    public async Task<EnlistPhotoExtractionDto> ExtractEnlistPhotosAsync(IReadOnlyList<byte[]> images)
    {
        var apiKey = GetApiKey();
        if (string.IsNullOrEmpty(apiKey))
        {
            return new EnlistPhotoExtractionDto(null, null, null, null, "pc");
        }

        var parts = new List<object> { new { text = EnlistRequest } };
        for (int i = 0; i < images.Count; i++)
        {
            parts.Add(new { text = $"Photo {i + 1} of {images.Count}:" });
            parts.Add(new { inlineData = new { mimeType = "image/jpeg", data = Convert.ToBase64String(images[i]) } });
        }

        try
        {
            var jsonText = await CallGeminiJsonAsync(apiKey, EnlistSystemPrompt, parts);
            var root = JsonNode.Parse(jsonText)?.AsObject();
            if (root == null) return new EnlistPhotoExtractionDto(null, null, null, null, "pc");

            var suggestedName = ProductDomain.CleanSuggestedName(root["suggestedName"]?.GetValue<string>());
            var suggestedType = ProductDomain.CleanSuggestedName(root["suggestedProductType"]?.GetValue<string>());

            double? price = null;
            if (root["price"] is JsonValue pv && pv.TryGetValue<double>(out var pVal) && double.IsFinite(pVal) && pVal > 0)
            {
                price = ReceiptValidator.RoundMoney(pVal);
            }

            var skuRaw = root["sku"]?.GetValue<string>()?.Trim();
            var unitRaw = root["unit"]?.GetValue<string>()?.Trim();

            return new EnlistPhotoExtractionDto(
                SuggestedName: suggestedName,
                SuggestedProductType: suggestedType,
                Price: price,
                Sku: string.IsNullOrEmpty(skuRaw) ? null : skuRaw,
                Unit: string.IsNullOrEmpty(unitRaw) ? "pc" : unitRaw
            );
        }
        catch
        {
            return new EnlistPhotoExtractionDto(null, null, null, null, "pc");
        }
    }

    private async Task<string> CallGeminiJsonAsync(string apiKey, string systemPrompt, List<object> parts)
    {
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{GeminiModel}:generateContent";
        var payload = new
        {
            systemInstruction = new { parts = new[] { new { text = systemPrompt } } },
            contents = new[] { new { role = "user", parts } },
            generationConfig = new { responseMimeType = "application/json" }
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Add("x-goog-api-key", apiKey);
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await httpClient.SendAsync(req);
        var body = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            try
            {
                var errNode = JsonNode.Parse(body);
                var msg = errNode?["error"]?["message"]?.GetValue<string>()?.Trim();
                if (!string.IsNullOrEmpty(msg))
                    throw new InvalidOperationException(msg.Length > 280 ? msg[..280] : msg);
            }
            catch (Exception ex) when (ex is not InvalidOperationException)
            {
                // fall through
            }
            throw new InvalidOperationException($"Gemini returned {(int)response.StatusCode}. Try the photo again.");
        }

        var respNode = JsonNode.Parse(body);
        var text = respNode?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(text))
            throw new InvalidOperationException("Gemini returned an empty extraction.");
        return text;
    }
}

