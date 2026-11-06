using System.Text.RegularExpressions;

namespace VuePresyo.Api.Domain;

public static partial class VuePresyoKeys
{
    public const int MaxProductPhotos = 5;
    public const string GroupId = "GO";

    [GeneratedRegex(@"[.#$\[\]/]")]
    private static partial Regex ForbiddenKeyCharsRegex();

    [GeneratedRegex(@"[^a-z0-9]+")]
    private static partial Regex NonAlphanumericSlugRegex();

    [GeneratedRegex(@"^-+|-+$")]
    private static partial Regex TrimDashesRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();

    [GeneratedRegex(@"^receipts/GO/[A-Za-z0-9-]{8,80}\.jpg$")]
    private static partial Regex StoragePathRegex();

    [GeneratedRegex(@"[\x00-\x1f\x7f\s]")]
    private static partial Regex ControlOrWhitespaceRegex();

    public static string SanitizeKeyPart(string value)
    {
        return ForbiddenKeyCharsRegex().Replace(value ?? string.Empty, "_");
    }

    public static string StoreIdFromName(string name, string? branch)
    {
        var raw = $"{name} {branch ?? ""}".Trim().ToLowerInvariant();
        var slug = NonAlphanumericSlugRegex().Replace(raw, "-");
        slug = TrimDashesRegex().Replace(slug, "");
        return SanitizeKeyPart(string.IsNullOrEmpty(slug) ? "store" : slug);
    }

    public static string ItemKey(string storeId, string? sku, string rawName)
    {
        string skuPart;
        if (!string.IsNullOrWhiteSpace(sku))
        {
            skuPart = SanitizeKeyPart(sku.Trim());
        }
        else
        {
            var rawClean = WhitespaceRegex().Replace((rawName ?? string.Empty).Trim().ToLowerInvariant(), "-");
            skuPart = SanitizeKeyPart(string.IsNullOrEmpty(rawClean) ? "item" : rawClean);
        }
        return $"{SanitizeKeyPart(storeId)}_{skuPart}";
    }

    public static string DuplicateIndexKey(string storeId, string date, string? invoiceNo, double total)
    {
        var cents = (long)Math.Round(total * 100, MidpointRounding.AwayFromZero);
        var inv = (invoiceNo ?? "no-invoice").Trim();
        if (string.IsNullOrEmpty(inv)) inv = "no-invoice";
        var invoice = SanitizeKeyPart(inv);
        return $"{SanitizeKeyPart(storeId)}_{date}_{invoice}_{cents}";
    }

    public static string StorageObjectPath(string id) => $"receipts/GO/{id}.jpg";

    public static bool IsReceiptImagePath(string? path)
    {
        if (string.IsNullOrEmpty(path)) return false;
        return StoragePathRegex().IsMatch(path);
    }

    public static string ProductImagePath(string itemKey)
        => $"products/GO/{SanitizeKeyPart(itemKey)}.jpg";

    public static string ProductImageObjectPath(string itemKey, int index = 0)
    {
        var suffix = index == 0 ? "" : $"_{index}";
        return $"products/GO/{SanitizeKeyPart(itemKey)}{suffix}.jpg";
    }

    public static string EnlistImageObjectPath(string tempId, int index = 0)
        => $"products/GO/enlist_{SanitizeKeyPart(tempId)}_{index}.jpg";

    public static bool IsProductImagePath(string? path)
    {
        if (string.IsNullOrEmpty(path)) return false;
        const string prefix = "products/GO/";
        const string suffix = ".jpg";
        if (!path.StartsWith(prefix, StringComparison.Ordinal) || !path.EndsWith(suffix, StringComparison.Ordinal))
            return false;

        var fileName = path.Substring(prefix.Length, path.Length - prefix.Length - suffix.Length);
        if (fileName.Length is < 1 or > 200) return false;
        if (ForbiddenKeyCharsRegex().IsMatch(fileName)) return false;
        if (ControlOrWhitespaceRegex().IsMatch(fileName)) return false;
        return true;
    }

    public static bool IsItemKey(string? value)
    {
        if (string.IsNullOrEmpty(value)) return false;
        if (value.Length is < 1 or > 200) return false;
        if (ForbiddenKeyCharsRegex().IsMatch(value)) return false;
        if (ControlOrWhitespaceRegex().IsMatch(value)) return false;
        return true;
    }
}

