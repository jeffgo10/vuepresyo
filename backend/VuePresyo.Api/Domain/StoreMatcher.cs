using System.Text.RegularExpressions;
using VuePresyo.Api.Models;

namespace VuePresyo.Api.Domain;

public record MatchStoreResult(string StoreId, string Name, string? Branch, bool IsExisting);

public static partial class StoreMatcher
{
    private static readonly string[] MajorCities =
    [
        "dumaguete",
        "cebu",
        "mandaue",
        "lapu-lapu",
        "manila",
        "quezon",
        "makati",
        "pasig",
        "taguig",
        "davao",
        "iloilo",
        "bacolod",
        "cagayan de oro",
        "tagbilaran",
        "zamboanga",
        "pampanga",
        "cavite",
        "laguna",
        "batangas",
        "sibulan",
        "valencia",
        "bacong",
        "tanjay",
        "bais",
    ];

    private static readonly HashSet<string> StopWords =
    [
        "road", "rd", "street", "st", "avenue", "ave", "highway", "hwy", "blvd", "city", "negros", "oriental"
    ];

    [GeneratedRegex(@"['’]")]
    private static partial Regex ApostropheRegex();

    [GeneratedRegex(@"\b(inc|incorporated|corp|corporation|co|company|ltd|limited)\b\.?", RegexOptions.IgnoreCase)]
    private static partial Regex LegalSuffixRegex();

    [GeneratedRegex(@"[^a-z0-9]+")]
    private static partial Regex NonAlphanumericRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();

    public static string NormalizeStoreName(string name)
    {
        var lower = (name ?? string.Empty).ToLowerInvariant();
        lower = ApostropheRegex().Replace(lower, "");
        lower = LegalSuffixRegex().Replace(lower, "");
        lower = NonAlphanumericRegex().Replace(lower, " ");
        return lower.Trim();
    }

    public static HashSet<string> BranchTokens(string? branch)
    {
        if (string.IsNullOrWhiteSpace(branch)) return [];
        var cleaned = NonAlphanumericRegex().Replace(ApostropheRegex().Replace(branch.ToLowerInvariant(), ""), " ").Trim();
        if (string.IsNullOrEmpty(cleaned)) return [];
        return WhitespaceRegex()
            .Split(cleaned)
            .Where(w => w.Length > 1 && !StopWords.Contains(w))
            .ToHashSet();
    }

    public static string? CityFromBranch(string? branch)
    {
        if (string.IsNullOrWhiteSpace(branch)) return null;
        var lower = branch.ToLowerInvariant();
        foreach (var city in MajorCities)
        {
            if (lower.Contains(city, StringComparison.Ordinal)) return city;
        }
        return null;
    }

    public static bool BranchesAreCompatible(string? b1, string? b2)
    {
        if (string.IsNullOrWhiteSpace(b1) || string.IsNullOrWhiteSpace(b2)) return true;
        var norm1 = b1.Trim().ToLowerInvariant();
        var norm2 = b2.Trim().ToLowerInvariant();
        if (norm1 == norm2) return true;
        if (norm1.Contains(norm2, StringComparison.Ordinal) || norm2.Contains(norm1, StringComparison.Ordinal)) return true;

        var city1 = CityFromBranch(b1);
        var city2 = CityFromBranch(b2);
        if (city1 != null && city2 != null && city1 != city2) return false;

        var tokens1 = BranchTokens(b1);
        var tokens2 = BranchTokens(b2);
        if (tokens1.Overlaps(tokens2)) return true;

        if (city1 == null || city2 == null || city1 == city2) return true;
        return false;
    }

    public static MatchStoreResult MatchStore(string? id, string name, string? branch, IReadOnlyList<StoreEntity> existingStores)
    {
        var inputName = (name ?? string.Empty).Trim();
        var inputBranch = string.IsNullOrWhiteSpace(branch) ? null : branch.Trim();

        if (!string.IsNullOrWhiteSpace(id))
        {
            var byId = existingStores.FirstOrDefault(s => s.Id == id.Trim());
            if (byId != null)
            {
                return new MatchStoreResult(byId.Id, byId.Name, byId.Branch ?? inputBranch, true);
            }
        }

        if (string.IsNullOrEmpty(inputName))
        {
            return new MatchStoreResult(VuePresyoKeys.StoreIdFromName(inputName, inputBranch), inputName, inputBranch, false);
        }

        var normInputName = NormalizeStoreName(inputName);

        foreach (var store in existingStores)
        {
            if (NormalizeStoreName(store.Name) == normInputName &&
                (store.Branch?.Trim().ToLowerInvariant() ?? "") == (inputBranch?.ToLowerInvariant() ?? ""))
            {
                return new MatchStoreResult(store.Id, store.Name, store.Branch ?? inputBranch, true);
            }
        }

        var nameMatches = existingStores.Where(s =>
        {
            var sNorm = NormalizeStoreName(s.Name);
            return sNorm == normInputName ||
                   WhitespaceRegex().Replace(sNorm, "") == WhitespaceRegex().Replace(normInputName, "");
        }).ToList();

        if (nameMatches.Count == 1)
        {
            var candidate = nameMatches[0];
            if (BranchesAreCompatible(candidate.Branch, inputBranch))
            {
                return new MatchStoreResult(candidate.Id, candidate.Name, candidate.Branch ?? inputBranch, true);
            }
        }
        else if (nameMatches.Count > 1)
        {
            StoreEntity? bestMatch = null;
            int maxOverlap = 0;
            var inputToks = BranchTokens(inputBranch);

            foreach (var candidate in nameMatches)
            {
                if (!BranchesAreCompatible(candidate.Branch, inputBranch)) continue;
                var candToks = BranchTokens(candidate.Branch);
                int overlap = inputToks.Count(candToks.Contains);
                if (overlap > maxOverlap)
                {
                    maxOverlap = overlap;
                    bestMatch = candidate;
                }
            }

            if (bestMatch != null)
            {
                return new MatchStoreResult(bestMatch.Id, bestMatch.Name, bestMatch.Branch ?? inputBranch, true);
            }
        }

        return new MatchStoreResult(VuePresyoKeys.StoreIdFromName(inputName, inputBranch), inputName, inputBranch, false);
    }
}

