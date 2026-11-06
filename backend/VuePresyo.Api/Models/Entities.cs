using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace VuePresyo.Api.Models;

public class AppGroup
{
    [Key]
    [MaxLength(64)]
    public string Id { get; set; } = "GO";

    [MaxLength(128)]
    public string Name { get; set; } = "GO";
}

public class AppUser
{
    [Key]
    [MaxLength(64)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required]
    [MaxLength(256)]
    public string PasswordHash { get; set; } = string.Empty;

    [Required]
    [MaxLength(128)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(64)]
    public string GroupId { get; set; } = "GO";
}

public class StoreEntity
{
    [Key]
    [MaxLength(200)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Branch { get; set; }
}

public class ProductEntity
{
    [Key]
    [MaxLength(200)]
    public string Key { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string StoreId { get; set; } = string.Empty;

    [MaxLength(120)]
    public string? Sku { get; set; }

    [Required]
    [MaxLength(200)]
    public string RawName { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(40)]
    public string Unit { get; set; } = "pc";

    [MaxLength(120)]
    public string? ProductId { get; set; }

    [MaxLength(120)]
    public string? ProductType { get; set; }

    [MaxLength(300)]
    public string? ImagePath { get; set; }

    public string? ImagePathsJson { get; set; }

    [NotMapped]
    public List<string> ImagePaths
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(ImagePathsJson))
            {
                try
                {
                    var list = JsonSerializer.Deserialize<List<string>>(ImagePathsJson);
                    if (list is { Count: > 0 }) return list;
                }
                catch
                {
                    // fallback
                }
            }
            return !string.IsNullOrWhiteSpace(ImagePath) ? [ImagePath] : [];
        }
        set
        {
            var cleaned = (value ?? [])
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Select(p => p.Trim())
                .Distinct()
                .Take(5)
                .ToList();
            ImagePathsJson = cleaned.Count > 0 ? JsonSerializer.Serialize(cleaned) : null;
            if (cleaned.Count > 0 && string.IsNullOrWhiteSpace(ImagePath))
            {
                ImagePath = cleaned[0];
            }
        }
    }
}

public class ReceiptEntity
{
    [Key]
    [MaxLength(100)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(64)]
    public string GroupId { get; set; } = "GO";

    [Required]
    [MaxLength(200)]
    public string StoreId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string StoreName { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Branch { get; set; }

    [Required]
    [MaxLength(20)]
    public string Date { get; set; } = string.Empty;

    [MaxLength(20)]
    public string? Time { get; set; }

    [MaxLength(120)]
    public string? InvoiceNo { get; set; }

    public double? VatableNet { get; set; }

    public double VatExemptSales { get; set; }

    public double? Vat { get; set; }

    public double Total { get; set; }

    [MaxLength(300)]
    public string? ImagePath { get; set; }

    [Required]
    [MaxLength(64)]
    public string CreatedBy { get; set; } = string.Empty;

    [Required]
    [MaxLength(128)]
    public string CreatedByName { get; set; } = string.Empty;

    public int ItemCount { get; set; }

    public string? DiscrepancyNote { get; set; }

    [Required]
    [MaxLength(300)]
    public string DuplicateKey { get; set; } = string.Empty;

    public List<ReceiptItemEntity> Items { get; set; } = [];
}

public class ReceiptItemEntity
{
    [Key]
    [MaxLength(100)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ReceiptId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string ItemKey { get; set; } = string.Empty;

    public double Qty { get; set; }

    public double UnitPrice { get; set; }

    public double LineTotal { get; set; }

    [MaxLength(20)]
    public string? VatType { get; set; }

    public string? FlagsJson { get; set; }

    [NotMapped]
    public List<string> Flags
    {
        get
        {
            if (string.IsNullOrWhiteSpace(FlagsJson)) return [];
            try
            {
                return JsonSerializer.Deserialize<List<string>>(FlagsJson) ?? [];
            }
            catch
            {
                return [];
            }
        }
        set => FlagsJson = value is { Count: > 0 } ? JsonSerializer.Serialize(value) : null;
    }
}

public class PriceHistoryEntity
{
    [Key]
    [MaxLength(100)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string ItemKey { get; set; } = string.Empty;

    public double Price { get; set; }

    [Required]
    [MaxLength(20)]
    public string Date { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ReceiptId { get; set; } = string.Empty;
}

public class PriceChangeEntity
{
    [Key]
    [MaxLength(250)]
    public string Id { get; set; } = string.Empty; // "{ItemKey}/{ChangeKey}"

    [Required]
    [MaxLength(200)]
    public string ItemKey { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string ChangeKey { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string StoreId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string StoreName { get; set; } = string.Empty;

    public double Price { get; set; }

    public double PreviousPrice { get; set; }

    public double Delta { get; set; }

    public double Percent { get; set; }

    [Required]
    [MaxLength(20)]
    public string Date { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ReceiptId { get; set; } = string.Empty;
}

public class ProductLinkDeclineEntity
{
    [MaxLength(200)]
    public string ItemKey { get; set; } = string.Empty;

    [MaxLength(200)]
    public string DeclinedKey { get; set; } = string.Empty;
}

