using System.Globalization;
using Microsoft.EntityFrameworkCore;
using VuePresyo.Api.Domain;
using VuePresyo.Api.Models;
using VuePresyo.Api.Services;

namespace VuePresyo.Api.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext db, IConfiguration config)
    {
        await db.Database.EnsureCreatedAsync();

        var groupId = VuePresyoKeys.GroupId;
        if (!await db.Groups.AnyAsync(g => g.Id == groupId))
        {
            db.Groups.Add(new AppGroup { Id = groupId, Name = groupId });
        }

        var seedPassword = config["VuePresyo:SeedPassword"]
            ?? Environment.GetEnvironmentVariable("VUEPRESYO_SEED_PASSWORD")
            ?? "local-only";

        var members = new[]
        {
            (Id: "uid_aidee", Email: "abdinglasa@gmail.com", Name: "Aidee"),
            (Id: "uid_jeff", Email: "jeffrey.t.go@gmail.com", Name: "Jeff"),
        };

        foreach (var member in members)
        {
            var existing = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == member.Email.ToLower());
            if (existing == null)
            {
                db.Users.Add(new AppUser
                {
                    Id = member.Id,
                    Email = member.Email,
                    Name = member.Name,
                    GroupId = groupId,
                    PasswordHash = PasswordHasher.Hash(seedPassword)
                });
            }
            else
            {
                existing.Name = member.Name;
                existing.GroupId = groupId;
            }
        }

        var demoStores = new[]
        {
            new StoreEntity { Id = "puregold", Name = "Puregold", Branch = "Dumaguete" },
            new StoreEntity { Id = "lee_hypermart", Name = "Lee Hypermart", Branch = "Dumaguete City" },
            new StoreEntity { Id = "sm_hypermarket", Name = "SM Hypermarket", Branch = "Dumaguete" },
        };

        foreach (var store in demoStores)
        {
            if (!await db.Stores.AnyAsync(s => s.Id == store.Id))
            {
                db.Stores.Add(store);
            }
        }

        if (!await db.Products.AnyAsync())
        {
            var today = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var demoProducts = new[]
            {
                new ProductEntity
                {
                    Key = "puregold_minola_oil",
                    StoreId = "puregold",
                    Name = "Minola Coconut Oil 1L",
                    RawName = "MINOLA COCONUT OIL 1L",
                    Sku = "4800016111111",
                    Unit = "bottle",
                    ProductType = "Coconut Oil"
                },
                new ProductEntity
                {
                    Key = "lee_baguio_oil",
                    StoreId = "lee_hypermart",
                    Name = "Baguio Pure Coconut Oil 500ml",
                    RawName = "BAGUIO COCONUT OIL 500ML",
                    Sku = "4800016222222",
                    Unit = "bottle",
                    ProductType = "Coconut Oil"
                },
                new ProductEntity
                {
                    Key = "sm_fiesta_oil",
                    StoreId = "sm_hypermarket",
                    Name = "Golden Fiesta Coconut Oil 1L",
                    RawName = "GOLDEN FIESTA COCONUT OIL 1L",
                    Sku = "4800016333333",
                    Unit = "bottle",
                    ProductType = "Coconut Oil"
                },
                new ProductEntity
                {
                    Key = "lee_titays_rosquillos",
                    StoreId = "lee_hypermart",
                    Name = "Titay's Rosquillos Corazon 120g",
                    RawName = "TITAYS ROSQUILLOS 120G",
                    Sku = "4800016444444",
                    Unit = "pack",
                    ProductType = "Rosquillos"
                },
                new ProductEntity
                {
                    Key = "sm_shamrock_rosquillos",
                    StoreId = "sm_hypermarket",
                    Name = "Shamrock Special Rosquillos 150g",
                    RawName = "SHAMROCK ROSQUILLOS 150G",
                    Sku = "4800016555555",
                    Unit = "pack",
                    ProductType = "Rosquillos"
                },
                new ProductEntity
                {
                    Key = "lee_almond_milk",
                    StoreId = "lee_hypermart",
                    Name = "Blue Diamond Almond Milk 1L",
                    RawName = "BLUE DIAMOND ALMOND MILK 1L",
                    Sku = "8850096848503",
                    Unit = "carton",
                    ProductId = "prod_almond_milk",
                    ProductType = "Almond Milk"
                },
                new ProductEntity
                {
                    Key = "sm_almond_milk",
                    StoreId = "sm_hypermarket",
                    Name = "Blue Diamond Almond Milk 1L",
                    RawName = "BLUE DIAMOND ALMOND MILK 1L",
                    Sku = "8850096848503",
                    Unit = "carton",
                    ProductId = "prod_almond_milk",
                    ProductType = "Almond Milk"
                },
                new ProductEntity
                {
                    Key = "puregold_almond_milk",
                    StoreId = "puregold",
                    Name = "Blue Diamond Almond Milk 1L",
                    RawName = "BLUE DIAMOND ALMOND MILK 1L",
                    Sku = "8850096848503",
                    Unit = "carton",
                    ProductId = "prod_almond_milk",
                    ProductType = "Almond Milk"
                },
            };

            db.Products.AddRange(demoProducts);

            var demoHistory = new[]
            {
                new PriceHistoryEntity { Id = "p1", ItemKey = "puregold_minola_oil", Price = 140.0, Date = today, ReceiptId = "rec_demo_1" },
                new PriceHistoryEntity { Id = "p2", ItemKey = "lee_baguio_oil", Price = 78.0, Date = today, ReceiptId = "rec_demo_2" },
                new PriceHistoryEntity { Id = "p3", ItemKey = "sm_fiesta_oil", Price = 155.0, Date = today, ReceiptId = "rec_demo_3" },
                new PriceHistoryEntity { Id = "p4", ItemKey = "lee_titays_rosquillos", Price = 80.0, Date = today, ReceiptId = "rec_demo_4" },
                new PriceHistoryEntity { Id = "p5", ItemKey = "sm_shamrock_rosquillos", Price = 90.0, Date = today, ReceiptId = "rec_demo_5" },
                new PriceHistoryEntity { Id = "p6", ItemKey = "lee_almond_milk", Price = 57.25, Date = today, ReceiptId = "rec_demo_6" },
                new PriceHistoryEntity { Id = "p7", ItemKey = "sm_almond_milk", Price = 52.0, Date = today, ReceiptId = "rec_demo_7" },
                new PriceHistoryEntity { Id = "p8", ItemKey = "puregold_almond_milk", Price = 54.5, Date = today, ReceiptId = "rec_demo_8" },
            };

            db.PriceHistory.AddRange(demoHistory);
        }

        await db.SaveChangesAsync();
    }
}

