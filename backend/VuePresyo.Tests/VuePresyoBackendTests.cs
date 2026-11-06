using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using VuePresyo.Api.Data;
using VuePresyo.Api.Domain;
using VuePresyo.Api.Models;
using VuePresyo.Api.Services;

namespace VuePresyo.Tests;

public class VuePresyoBackendTests
{
    private sealed class FakeWebHostEnvironment : IWebHostEnvironment
    {
        public string WebRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider WebRootFileProvider { get; set; } = null!;
        public string ApplicationName { get; set; } = "VuePresyo.Tests";
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public string EnvironmentName { get; set; } = "Development";
    }

    [Fact]
    public void VuePresyoKeys_SanitizesInvalidCharacters_AndBuildsItemKey()
    {
        Assert.Equal("puregold_4800_016_644_801", VuePresyoKeys.ItemKey("puregold", "4800.016#644$801", "Raw"));
        Assert.Equal("puregold_skyflakes-crackers-250g", VuePresyoKeys.ItemKey("puregold", null, "SkyFlakes Crackers 250g"));
        Assert.Equal("lee-hypermart-dumaguete", VuePresyoKeys.StoreIdFromName("Lee Hypermart", "Dumaguete"));
    }

    [Fact]
    public void ReceiptValidator_ValidatesPhilippineVatInclusiveReceipt()
    {
        var receipt = new ExtractedReceiptDto
        {
            Store = new ReceiptStoreDto
            {
                Name = "Lee Hypermart",
                Branch = "Dumaguete",
                Date = "2026-04-17",
                Time = "14:23",
                InvoiceNo = "SI-0001842"
            },
            Items =
            [
                new ReceiptLineDto
                {
                    Sku = "4800016644801",
                    RawName = "JACK N JILL PIATTOS CHEESE 85G",
                    Name = "Jack 'n Jill Piattos Cheese 85g",
                    Qty = 2,
                    UnitPrice = 39.75,
                    LineTotal = 79.50,
                    VatType = "VAT"
                },
                new ReceiptLineDto
                {
                    Sku = "4800092110528",
                    RawName = "SKYFLAKES CRACKERS 250G",
                    Name = "SkyFlakes Crackers 250g",
                    Qty = 1,
                    UnitPrice = 64.00,
                    LineTotal = 64.00,
                    VatType = "VAT"
                },
                new ReceiptLineDto
                {
                    Sku = "200145",
                    RawName = "FRESH EGGS MEDIUM 1 DOZ",
                    Name = "Fresh Eggs Medium 1 doz",
                    Qty = 1,
                    UnitPrice = 108.00,
                    LineTotal = 108.00,
                    VatType = "EXEMPT"
                }
            ],
            Totals = new ReceiptTotalsDto
            {
                Subtotal = 251.50,
                VatableNet = 128.12,
                VatExemptSales = 108.00,
                Vat = 15.38,
                Total = 251.50
            }
        };

        var validation = ReceiptValidator.ValidateReceipt(receipt);
        Assert.True(validation.Ok);
        Assert.False(validation.NeedsReview);
        Assert.Empty(validation.Issues);
    }

    [Fact]
    public void ReceiptValidator_FlagsLineSumAndVatMismatch()
    {
        var receipt = new ExtractedReceiptDto
        {
            Store = new ReceiptStoreDto { Name = "Puregold", Date = "2026-04-17" },
            Items =
            [
                new ReceiptLineDto
                {
                    RawName = "ITEM A",
                    Name = "Item A",
                    Qty = 1,
                    UnitPrice = 100.00,
                    LineTotal = 100.00,
                    VatType = "VAT"
                }
            ],
            Totals = new ReceiptTotalsDto
            {
                VatableNet = 89.29,
                VatExemptSales = 0,
                Vat = 25.00, // Wrong VAT (should be ~10.71)
                Total = 110.00 // Mismatch with line total 100.00
            }
        };

        var validation = ReceiptValidator.ValidateReceipt(receipt);
        Assert.False(validation.Ok);
        Assert.True(validation.NeedsReview);
        Assert.Contains(validation.Issues, i => i.Code == "line_sum");
        Assert.Contains(validation.Issues, i => i.Code == "vat_amount");
    }

    [Fact]
    public void StoreMatcher_ReusesCanonicalStoreForCaseAndSpacingDifferences()
    {
        var existing = new List<StoreEntity>
        {
            new() { Id = "puregold", Name = "Puregold", Branch = "Tandang Sora" }
        };

        var match = StoreMatcher.MatchStore(null, "  PUREGOLD ", "tandang sora", existing);

        Assert.True(match.IsExisting);
        Assert.Equal("puregold", match.StoreId);
        Assert.Equal("Puregold", match.Name);
        Assert.Equal("Tandang Sora", match.Branch);
    }

    [Fact]
    public async Task VuePresyoService_SaveReceipt_SeedsAndDetectsDuplicates_AndRecordsPriceChange()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connection)
            .Options;

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:RootPath"] = Path.Combine(Path.GetTempPath(), "vuepresyo-tests-" + Guid.NewGuid().ToString("N"))
            })
            .Build();

        await using var db = new AppDbContext(options);
        await DbSeeder.SeedAsync(db, config);

        var storage = new StorageService(new FakeWebHostEnvironment(), config);
        var gemini = new GeminiService(new HttpClient(), config);
        var service = new VuePresyoService(db, storage, gemini);

        var firstReceipt = new SaveReceiptRequest
        {
            Receipt = new ExtractedReceiptDto
            {
                Store = new ReceiptStoreDto
                {
                    Id = "lee_hypermart",
                    Name = "Lee Hypermart",
                    Branch = "Dumaguete",
                    Date = "2026-04-17",
                    Time = "09:00",
                    InvoiceNo = "SI-999110"
                },
                Items =
                [
                    new ReceiptLineDto
                    {
                        Sku = "4800016644801",
                        RawName = "JACK N JILL PIATTOS CHEESE 85G",
                        Name = "Jack 'n Jill Piattos Cheese 85g",
                        Qty = 1,
                        UnitPrice = 38.50,
                        LineTotal = 38.50,
                        VatType = "VAT"
                    }
                ],
                Totals = new ReceiptTotalsDto
                {
                    VatableNet = 34.38,
                    VatExemptSales = 0,
                    Vat = 4.12,
                    Total = 38.50
                }
            }
        };

        await service.SaveReceiptAsync(firstReceipt, "uid_jeff");

        var saveRequest = new SaveReceiptRequest
        {
            Receipt = new ExtractedReceiptDto
            {
                Store = new ReceiptStoreDto
                {
                    Id = "lee_hypermart",
                    Name = "Lee Hypermart",
                    Branch = "Dumaguete",
                    Date = "2026-04-18",
                    Time = "10:15",
                    InvoiceNo = "SI-999111"
                },
                Items =
                [
                    new ReceiptLineDto
                    {
                        Sku = "4800016644801",
                        RawName = "JACK N JILL PIATTOS CHEESE 85G",
                        Name = "Jack 'n Jill Piattos Cheese 85g",
                        Qty = 1,
                        UnitPrice = 42.00, // Up from 38.50 at lee_hypermart!
                        LineTotal = 42.00,
                        VatType = "VAT"
                    }
                ],
                Totals = new ReceiptTotalsDto
                {
                    VatableNet = 37.50,
                    VatExemptSales = 0,
                    Vat = 4.50,
                    Total = 42.00
                }
            }
        };

        var saved = await service.SaveReceiptAsync(saveRequest, "uid_jeff");
        Assert.False(string.IsNullOrWhiteSpace(saved.ReceiptId));

        // Verify price change was recorded (+3.50 from 38.50 to 42.00)
        var changes = await db.PriceChanges
            .Where(c => c.ItemKey == "lee_hypermart_4800016644801")
            .ToListAsync();
        Assert.Single(changes);
        Assert.Equal(42.00, changes[0].Price);
        Assert.Equal(38.50, changes[0].PreviousPrice);
        Assert.Equal(3.50, changes[0].Delta);

        // Saving the exact same receipt again must throw DuplicateReceiptException
        await Assert.ThrowsAsync<DuplicateReceiptException>(() =>
            service.SaveReceiptAsync(saveRequest, "uid_jeff"));
    }
}
