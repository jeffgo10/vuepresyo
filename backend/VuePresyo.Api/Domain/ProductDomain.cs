using System.Text.RegularExpressions;
using VuePresyo.Api.Models;

namespace VuePresyo.Api.Domain;

public record PackSize(string Dimension, double Quantity);

public static partial class ProductDomain
{
    public const int MaxPackageMatches = 4;
    public const int MaxProductNameLength = 80;

    [GeneratedRegex(@"[\u0000-\u001F]")]
    private static partial Regex ControlCharsRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();

    [GeneratedRegex(@"[^a-zA-Z0-9]")]
    private static partial Regex NonAlphanumericSkuRegex();

    [GeneratedRegex(@"(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|l|kg|g)\b", RegexOptions.IgnoreCase)]
    private static partial Regex MultipliedSizeRegex();

    [GeneratedRegex(@"(\d+(?:\.\d+)?)\s*(ml|l|kg|g)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SingleSizeRegex();

    [GeneratedRegex(@"(\d+)\s*[-]?\s*(pcs|pc|pieces|piece|sachets?|packs?|pk|pouches?|sticks?|boxes?|bx|bars?|rolls?|bottles?|btl|cans?|s)\b", RegexOptions.IgnoreCase)]
    private static partial Regex PackCountRegex();

    [GeneratedRegex(@"(?:box|pack|pouch|bag|case|bundle)\s+of\s+(\d+)\b", RegexOptions.IgnoreCase)]
    private static partial Regex PackOfRegex();

    [GeneratedRegex(@"\b(sachet|stick|pouch|piece)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SingleUnitWordRegex();

    public static string? CleanSuggestedName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var cleaned = ControlCharsRegex().Replace(value, "");
        cleaned = WhitespaceRegex().Replace(cleaned, " ").Trim();
        if (string.IsNullOrEmpty(cleaned) || cleaned.Length > MaxProductNameLength) return null;
        return cleaned;
    }

    public static string? CleanSku(string? sku)
    {
        if (string.IsNullOrWhiteSpace(sku)) return null;
        var cleaned = NonAlphanumericSkuRegex().Replace(sku, "").Trim();
        return cleaned.Length > 0 ? cleaned : null;
    }

    public static ProductEntity MergeProductEntity(
        ProductEntity? existing,
        string key,
        string? sku,
        string storeId,
        string rawName,
        string name,
        string? unit,
        string? productId,
        string? imagePath,
        List<string>? imagePaths,
        string? productType)
    {
        var incomingPaths = imagePaths is { Count: > 0 }
            ? imagePaths
            : (!string.IsNullOrWhiteSpace(imagePath) ? [imagePath] : []);

        if (existing == null)
        {
            var capped = incomingPaths.Where(p => !string.IsNullOrWhiteSpace(p)).Take(VuePresyoKeys.MaxProductPhotos).ToList();
            return new ProductEntity
            {
                Key = key,
                Sku = string.IsNullOrWhiteSpace(sku) ? null : sku.Trim(),
                StoreId = storeId,
                RawName = rawName,
                Name = name,
                Unit = string.IsNullOrWhiteSpace(unit) ? "pc" : unit.Trim(),
                ProductId = string.IsNullOrWhiteSpace(productId) ? null : productId.Trim(),
                ImagePath = capped.FirstOrDefault() ?? imagePath,
                ImagePaths = capped,
                ProductType = string.IsNullOrWhiteSpace(productType) ? null : productType.Trim()
            };
        }

        var existingPaths = existing.ImagePaths;
        var combinedPaths = existingPaths
            .Concat(incomingPaths)
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Distinct()
            .Take(VuePresyoKeys.MaxProductPhotos)
            .ToList();

        existing.Sku = string.IsNullOrWhiteSpace(sku) ? null : sku.Trim();
        existing.StoreId = storeId;
        existing.RawName = rawName;
        if (!string.IsNullOrWhiteSpace(unit))
            existing.Unit = unit.Trim();
        else if (string.IsNullOrWhiteSpace(existing.Unit))
            existing.Unit = "pc";

        existing.ImagePath ??= combinedPaths.FirstOrDefault();
        if (combinedPaths.Count > 0)
            existing.ImagePaths = combinedPaths;

        if (!string.IsNullOrWhiteSpace(productId) && string.IsNullOrWhiteSpace(existing.ProductId))
            existing.ProductId = productId.Trim();

        if (!string.IsNullOrWhiteSpace(productType))
            existing.ProductType = productType.Trim();

        return existing;
    }

    public static List<ProductEntity> PackageMatchCandidates(
        IEnumerable<ProductEntity> products,
        ProductEntity current,
        ISet<string> declinedKeys)
    {
        return products
            .Where(p =>
            {
                if (p.Key == current.Key || p.StoreId == current.StoreId) return false;
                if (string.IsNullOrWhiteSpace(p.ImagePath)) return false;
                if (declinedKeys.Contains(p.Key)) return false;
                if (!string.IsNullOrWhiteSpace(current.ProductId) && p.ProductId == current.ProductId) return false;
                return true;
            })
            .OrderBy(p => p.Name, StringComparer.Ordinal)
            .ThenBy(p => p.Key, StringComparer.Ordinal)
            .Take(MaxPackageMatches)
            .ToList();
    }

    public static string ProductIdForLink(string? current, string? other, string createdId)
    {
        if (!string.IsNullOrWhiteSpace(current)) return current.Trim();
        if (!string.IsNullOrWhiteSpace(other)) return other.Trim();
        return createdId;
    }

    public static PackSize? ParsePackSize(string? text, string? unit = null)
    {
        var input = text ?? string.Empty;

        var multMatches = MultipliedSizeRegex().Matches(input);
        if (multMatches.Count > 0)
        {
            var m = multMatches[^1];
            if (double.TryParse(m.Groups[1].Value, out var count) &&
                double.TryParse(m.Groups[2].Value, out var amount) && count > 0)
            {
                var size = ToBase(amount, m.Groups[3].Value);
                if (size != null)
                {
                    var q = Math.Round(size.Quantity * count * 1000.0) / 1000.0;
                    if (q > 0) return new PackSize(size.Dimension, q);
                }
            }
        }

        var packOfMatches = PackOfRegex().Matches(input);
        if (packOfMatches.Count > 0)
        {
            var m = packOfMatches[^1];
            if (double.TryParse(m.Groups[1].Value, out var count) && count > 0)
                return new PackSize("count", count);
        }

        var sizeMatches = SingleSizeRegex().Matches(input);
        var countMatches = PackCountRegex().Matches(input);

        PackSize? singleSize = null;
        if (sizeMatches.Count > 0)
        {
            var sm = sizeMatches[^1];
            if (double.TryParse(sm.Groups[1].Value, out var amt))
                singleSize = ToBase(amt, sm.Groups[2].Value);
        }

        double packCount = 0;
        if (countMatches.Count > 0)
        {
            var cm = countMatches[^1];
            double.TryParse(cm.Groups[1].Value, out packCount);
        }

        if (singleSize != null && packCount > 0)
        {
            var q = Math.Round(singleSize.Quantity * packCount * 1000.0) / 1000.0;
            if (q > 0) return new PackSize(singleSize.Dimension, q);
        }
        if (singleSize != null) return singleSize;
        if (packCount > 0) return new PackSize("count", packCount);
        if (SingleUnitWordRegex().IsMatch(input)) return new PackSize("count", 1);

        if (!string.IsNullOrWhiteSpace(unit))
        {
            var u = unit.Trim();
            var fromUnit = ParsePackSize(u, null);
            if (fromUnit != null) return fromUnit;
            if (SingleUnitWordRegex().IsMatch(u) ||
                Regex.IsMatch(u, @"^(sachet|stick|pouch|pc|piece|bar)$", RegexOptions.IgnoreCase))
            {
                return new PackSize("count", 1);
            }
        }

        return null;
    }

    private static PackSize? ToBase(double amount, string unit)
    {
        if (!double.IsFinite(amount) || amount <= 0) return null;
        var norm = unit.ToLowerInvariant();
        return norm switch
        {
            "ml" => new PackSize("volume", amount),
            "l" => new PackSize("volume", amount * 1000.0),
            "g" => new PackSize("mass", amount),
            "kg" => new PackSize("mass", amount * 1000.0),
            _ => null
        };
    }
}

