using System.Text.RegularExpressions;
using VuePresyo.Api.Models;

namespace VuePresyo.Api.Domain;

public record PricePointDto(double Price, string Date, string ReceiptId);

public record PriceChangeDto(
    double Price,
    double PreviousPrice,
    double Delta,
    double Percent,
    string Date,
    string ReceiptId
);

public static partial class PriceChangeCalculator
{
    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
    private static partial Regex ReceiptDateRegex();

    private static double RoundPercent(double value)
        => Math.Round(value * 10.0, MidpointRounding.AwayFromZero) / 10.0;

    public static List<PricePointDto> OrderedPurchases(IEnumerable<PricePointDto> points)
    {
        var usable = points
            .Where(p => ReceiptDateRegex().IsMatch(p.Date ?? "") &&
                        double.IsFinite(p.Price) &&
                        !string.IsNullOrWhiteSpace(p.ReceiptId))
            .OrderBy(p => p.Date, StringComparer.Ordinal)
            .ThenBy(p => p.ReceiptId, StringComparer.Ordinal)
            .ToList();

        var series = new List<PricePointDto>();
        foreach (var point in usable)
        {
            var prev = series.Count > 0 ? series[^1] : null;
            if (prev != null && prev.Date == point.Date && prev.ReceiptId == point.ReceiptId)
                continue;
            series.Add(point);
        }
        return series;
    }

    public static List<PriceChangeDto> PriceChangesFromHistory(IEnumerable<PricePointDto> points)
    {
        var series = OrderedPurchases(points);
        var changes = new List<PriceChangeDto>();
        for (int i = 1; i < series.Count; i++)
        {
            var previous = series[i - 1];
            var current = series[i];
            if (previous.Price <= 0) continue;
            var delta = ReceiptValidator.RoundMoney(current.Price - previous.Price);
            if (delta == 0) continue;

            changes.Add(new PriceChangeDto(
                Price: ReceiptValidator.RoundMoney(current.Price),
                PreviousPrice: ReceiptValidator.RoundMoney(previous.Price),
                Delta: delta,
                Percent: RoundPercent((delta / previous.Price) * 100.0),
                Date: current.Date,
                ReceiptId: current.ReceiptId
            ));
        }
        return changes;
    }

    public static string PriceChangeRecordId(PriceChangeDto change)
        => $"{change.Date}_{VuePresyoKeys.SanitizeKeyPart(change.ReceiptId)}";
}

