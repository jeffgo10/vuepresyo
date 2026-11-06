using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using VuePresyo.Api.Models;

namespace VuePresyo.Api.Domain;

public static partial class ReceiptValidator
{
    public const double VatNumerator = 12.0;
    public const double VatDenominator = 112.0;
    public const double MoneyTolerance = 0.05;

    private static readonly HashSet<string> ValidFlags =
    [
        "struck_through",
        "unclear_name",
        "unclear_price",
        "unclear_sku"
    ];

    private static readonly HashSet<string> ValidVatTypes =
    [
        "VAT",
        "EXEMPT",
        "FREE"
    ];

    [GeneratedRegex(@"\b[a-z]")]
    private static partial Regex WordBoundaryLetterRegex();

    public static double RoundMoney(double amount)
        => Math.Round(amount * 100.0, MidpointRounding.AwayFromZero) / 100.0;

    public static bool MoneyClose(double left, double right, double tolerance = MoneyTolerance)
        => Math.Abs(left - right) <= tolerance + 1e-9;

    public static double VatPortion(double vatableLineSum)
        => RoundMoney((vatableLineSum * VatNumerator) / VatDenominator);

    public static string DisplayNameFromRaw(string rawName)
    {
        var lower = (rawName ?? string.Empty).ToLowerInvariant();
        return WordBoundaryLetterRegex().Replace(lower, m => m.Value.ToUpperInvariant());
    }

    public static ExtractedReceiptDto NormalizeExtraction(ExtractedReceiptDto? input)
    {
        if (input == null)
            throw new ArgumentException("Extraction is missing");

        if (input.Items == null || input.Items.Count == 0)
            throw new ArgumentException("No items were found on the receipt");

        var items = new List<ReceiptLineDto>();
        for (int i = 0; i < input.Items.Count; i++)
        {
            var row = input.Items[i] ?? throw new ArgumentException($"Item {i + 1} is missing");
            var rawName = row.RawName?.Trim();
            if (string.IsNullOrEmpty(rawName))
                throw new ArgumentException($"Item {i + 1} name is missing");
            if (!double.IsFinite(row.Qty))
                throw new ArgumentException($"Item {i + 1} quantity must be a number");
            if (!double.IsFinite(row.UnitPrice))
                throw new ArgumentException($"Item {i + 1} price must be a number");
            if (!double.IsFinite(row.LineTotal))
                throw new ArgumentException($"Item {i + 1} line total must be a number");

            var name = !string.IsNullOrWhiteSpace(row.Name)
                ? row.Name.Trim()
                : DisplayNameFromRaw(rawName);

            var vatType = !string.IsNullOrWhiteSpace(row.VatType) && ValidVatTypes.Contains(row.VatType.Trim())
                ? row.VatType.Trim()
                : null;

            var flags = new List<string>();
            if (row.Flags != null)
            {
                foreach (var f in row.Flags)
                {
                    if (!string.IsNullOrWhiteSpace(f) && ValidFlags.Contains(f) && !flags.Contains(f))
                        flags.Add(f);
                }
            }

            items.Add(new ReceiptLineDto
            {
                Sku = string.IsNullOrWhiteSpace(row.Sku) ? null : row.Sku.Trim(),
                RawName = rawName,
                Name = name,
                Qty = row.Qty,
                UnitPrice = row.UnitPrice,
                LineTotal = row.LineTotal,
                VatType = vatType,
                Flags = flags,
                Unit = string.IsNullOrWhiteSpace(row.Unit) ? null : row.Unit.Trim(),
                ProductId = string.IsNullOrWhiteSpace(row.ProductId) ? null : row.ProductId.Trim(),
                LinkedItemKey = string.IsNullOrWhiteSpace(row.LinkedItemKey) ? null : row.LinkedItemKey.Trim()
            });
        }

        var lineSum = RoundMoney(items.Sum(x => x.LineTotal));
        var store = input.Store ?? new ReceiptStoreDto();
        var totals = input.Totals ?? new ReceiptTotalsDto();

        var total = double.IsFinite(totals.Total) && totals.Total > 0 ? totals.Total : lineSum;

        return new ExtractedReceiptDto
        {
            Store = new ReceiptStoreDto
            {
                Id = string.IsNullOrWhiteSpace(store.Id) ? null : store.Id.Trim(),
                Name = string.IsNullOrWhiteSpace(store.Name) ? "Unknown Store" : store.Name.Trim(),
                Branch = string.IsNullOrWhiteSpace(store.Branch) ? null : store.Branch.Trim(),
                Date = string.IsNullOrWhiteSpace(store.Date)
                    ? DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                    : store.Date.Trim(),
                Time = string.IsNullOrWhiteSpace(store.Time) ? null : store.Time.Trim(),
                InvoiceNo = string.IsNullOrWhiteSpace(store.InvoiceNo) ? null : store.InvoiceNo.Trim(),
            },
            Items = items,
            Totals = new ReceiptTotalsDto
            {
                Subtotal = totals.Subtotal,
                VatableNet = totals.VatableNet,
                VatExemptSales = totals.VatExemptSales,
                Vat = totals.Vat,
                Total = total
            }
        };
    }

    public static ValidationResultDto ValidateReceipt(ExtractedReceiptDto receipt)
    {
        var issues = new List<ValidationIssueDto>();

        if (receipt.Items.Count == 0)
        {
            issues.Add(new ValidationIssueDto("empty", "Add at least one line."));
        }

        var lineSum = RoundMoney(receipt.Items.Sum(x => x.LineTotal));
        if (!MoneyClose(lineSum, receipt.Totals.Total))
        {
            issues.Add(new ValidationIssueDto(
                "line_sum",
                $"Line totals add up to {lineSum:F2}, but the receipt total is {receipt.Totals.Total:F2}."
            ));
        }

        var vatableSum = receipt.Items
            .Where(x => x.VatType == "VAT")
            .Sum(x => x.LineTotal);

        if (receipt.Totals.Vat.HasValue)
        {
            var expectedVat = VatPortion(vatableSum);
            if (!MoneyClose(expectedVat, receipt.Totals.Vat.Value))
            {
                issues.Add(new ValidationIssueDto(
                    "vat_amount",
                    $"VATable lines imply VAT {expectedVat:F2}, but the receipt prints {receipt.Totals.Vat.Value:F2}."
                ));
            }
        }

        var vatableNet = receipt.Totals.VatableNet ?? 0.0;
        var vat = receipt.Totals.Vat ?? 0.0;
        var parts = RoundMoney(vatableNet + receipt.Totals.VatExemptSales + vat);
        if (!MoneyClose(parts, receipt.Totals.Total))
        {
            issues.Add(new ValidationIssueDto(
                "total_parts",
                $"VATable net, VAT-exempt, and VAT add up to {parts:F2}, but the total is {receipt.Totals.Total:F2}."
            ));
        }

        foreach (var line in receipt.Items)
        {
            if (line.VatType == "FREE" && line.LineTotal != 0)
            {
                issues.Add(new ValidationIssueDto(
                    "free_price",
                    $"{line.Name} is marked free but has a price."
                ));
            }
            if (line.Flags.Count > 0)
            {
                issues.Add(new ValidationIssueDto(
                    "flags",
                    $"{line.Name} needs a look ({string.Join(", ", line.Flags)})."
                ));
            }
        }

        var blocking = issues.Where(x => x.Code != "flags").ToList();
        return new ValidationResultDto(
            Ok: blocking.Count == 0,
            NeedsReview: issues.Count > 0,
            Issues: issues
        );
    }

    public static string? GetReceiptDiscrepancy(ExtractedReceiptDto receipt)
    {
        var lineSum = RoundMoney(receipt.Items.Sum(x => x.LineTotal));
        var total = receipt.Totals.Total;
        var notes = new List<string>();

        if (!MoneyClose(lineSum, total))
        {
            var diff = RoundMoney(lineSum - total);
            var diffSign = diff > 0 ? "+" : "";
            notes.Add($"Line totals sum to ₱{lineSum:F2}, but receipt total is ₱{total:F2} (diff: {diffSign}₱{diff:F2})");
        }

        var vatableSum = receipt.Items
            .Where(x => x.VatType == "VAT")
            .Sum(x => x.LineTotal);

        if (receipt.Totals.Vat.HasValue)
        {
            var expectedVat = VatPortion(vatableSum);
            if (!MoneyClose(expectedVat, receipt.Totals.Vat.Value))
            {
                notes.Add($"VATable lines imply VAT ₱{expectedVat:F2}, but receipt prints ₱{receipt.Totals.Vat.Value:F2}");
            }
        }

        var vatableNet = receipt.Totals.VatableNet ?? 0.0;
        var vat = receipt.Totals.Vat ?? 0.0;
        var parts = RoundMoney(vatableNet + receipt.Totals.VatExemptSales + vat);
        if (!MoneyClose(parts, total))
        {
            notes.Add($"Tax breakdown adds up to ₱{parts:F2}, differing from total ₱{total:F2}");
        }

        return notes.Count > 0 ? string.Join(" · ", notes) : null;
    }

    public static (bool CanSave, string? Reason) CanSaveReceipt(ExtractedReceiptDto receipt)
    {
        if (receipt.Items.Count == 0)
            return (false, "Add at least one line.");

        foreach (var line in receipt.Items)
        {
            if (line.VatType == "FREE" && line.LineTotal != 0)
                return (false, $"{line.Name} is marked free but has a price.");
        }

        return (true, null);
    }
}

