using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VuePresyo.Api.Data;
using VuePresyo.Api.Models;
using VuePresyo.Api.Services;

LoadDotEnvFiles();

var builder = WebApplication.CreateBuilder(args);

var defaultDbPath = Path.Combine(builder.Environment.ContentRootPath, "vuepresyo.db");
var configuredConn = builder.Configuration.GetConnectionString("DefaultConnection");
var connectionString = string.IsNullOrWhiteSpace(configuredConn) || configuredConn == "Data Source=vuepresyo.db"
    ? $"Data Source={defaultDbPath}"
    : configuredConn;

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(connectionString));

builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<StorageService>();
builder.Services.AddHttpClient<GeminiService>();
builder.Services.AddScoped<VuePresyoService>();

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? "vuepresyo-super-secret-jwt-key-for-go-family-group-2026!";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "VuePresyo",
            ValidateAudience = true,
            ValidAudience = "VuePresyoClient",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DbSeeder.SeedAsync(db, app.Configuration);
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Helper to map exceptions consistently
static async Task<IResult> ExecuteSafeAsync<T>(Func<Task<T>> action)
{
    try
    {
        var result = await action();
        return Results.Ok(result);
    }
    catch (DuplicateReceiptException ex)
    {
        return Results.Json(new { error = ex.Message, code = "already-exists" }, statusCode: 409);
    }
    catch (KeyNotFoundException ex)
    {
        return Results.Json(new { error = ex.Message, code = "not-found" }, statusCode: 404);
    }
    catch (ArgumentException ex)
    {
        return Results.Json(new { error = ex.Message, code = "invalid-argument" }, statusCode: 400);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Json(new { error = ex.Message, code = "failed-precondition" }, statusCode: 412);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = ex.Message, code = "internal" }, statusCode: 500);
    }
}

static void LoadDotEnvFiles()
{
    var dir = Directory.GetCurrentDirectory();
    var candidates = new[]
    {
        Path.Combine(dir, "..", "..", ".env"),
        Path.Combine(dir, "..", "..", ".env.local"),
        Path.Combine(dir, ".env"),
        Path.Combine(dir, ".env.local"),
    };

    foreach (var path in candidates)
    {
        if (!File.Exists(path)) continue;
        foreach (var rawLine in File.ReadAllLines(path))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith('#')) continue;
            var eqIdx = line.IndexOf('=');
            if (eqIdx <= 0) continue;

            var key = line[..eqIdx].Trim();
            var val = line[(eqIdx + 1)..].Trim().Trim('"', '\'');
            if (!string.IsNullOrEmpty(key) && string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
            {
                Environment.SetEnvironmentVariable(key, val);
            }
        }
    }
}

static AuthUserDto GetCurrentUser(ClaimsPrincipal user)
{
    var uid = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "go-jeff";
    var email = user.FindFirstValue(ClaimTypes.Email) ?? "jeffrey.t.go@gmail.com";
    var name = user.FindFirstValue(ClaimTypes.Name) ?? "Jeff";
    var groupId = user.FindFirstValue("groupId") ?? "GO";
    return new AuthUserDto(uid, email, name, groupId);
}

// =====================================================================
// AUTH ENDPOINTS
// =====================================================================

app.MapPost("/api/auth/login", async (LoginRequest req, AppDbContext db, IConfiguration config, JwtTokenService jwtService) =>
{
    var normalizedEmail = (req.Email ?? string.Empty).Trim().ToLowerInvariant();
    AppUser? user;
    try
    {
        user = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);
    }
    catch (Microsoft.Data.Sqlite.SqliteException)
    {
        await DbSeeder.SeedAsync(db, config);
        user = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);
    }

    if (user is null || !PasswordHasher.Verify(req.Password ?? string.Empty, user.PasswordHash))
    {
        return Results.Json(
            new { error = "Sign-in failed. Only Group GO accounts registered by an admin can sign in." },
            statusCode: 401);
    }

    var token = jwtService.GenerateToken(user);
    return Results.Ok(new LoginResponse(
        token,
        new AuthUserDto(user.Id, user.Email, user.Name, user.GroupId)
    ));
});

app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
{
    if (user.Identity?.IsAuthenticated != true)
        return Results.Unauthorized();
    return Results.Ok(GetCurrentUser(user));
}).RequireAuthorization();

// =====================================================================
// DATA / CATALOG ENDPOINTS
// =====================================================================

app.MapGet("/api/catalog", async (AppDbContext db) =>
{
    var productsList = await db.Products.AsNoTracking().ToListAsync();
    var storesList = await db.Stores.AsNoTracking().ToListAsync();
    var historyList = await db.PriceHistory.AsNoTracking().ToListAsync();

    var products = productsList.Select(p => new
    {
        key = p.Key,
        storeId = p.StoreId,
        sku = p.Sku,
        rawName = p.RawName,
        name = p.Name,
        unit = p.Unit,
        productId = p.ProductId,
        productType = p.ProductType,
        imagePath = p.ImagePath,
        imagePaths = p.ImagePaths
    }).ToList();

    var stores = storesList.ToDictionary(
        s => s.Id,
        s => new { name = s.Name, branch = s.Branch }
    );

    var storeNames = storesList.ToDictionary(
        s => s.Id,
        s => string.IsNullOrWhiteSpace(s.Branch) ? s.Name : $"{s.Name} ({s.Branch})"
    );

    var history = historyList
        .GroupBy(h => h.ItemKey)
        .ToDictionary(
            g => g.Key,
            g => g.Select(pt => new
            {
                price = pt.Price,
                date = pt.Date,
                receiptId = pt.ReceiptId
            }).ToList()
        );

    return Results.Ok(new
    {
        products,
        stores,
        storeNames,
        history
    });
}).RequireAuthorization();

app.MapGet("/api/price-changes", async (AppDbContext db) =>
{
    var changes = await db.PriceChanges.AsNoTracking().ToListAsync();
    var rows = changes
        .OrderByDescending(c => c.Date)
        .ThenByDescending(c => c.Id)
        .Select(c => new
        {
            id = c.Id,
            itemKey = c.ItemKey,
            name = c.Name,
            storeId = c.StoreId,
            storeName = c.StoreName,
            price = c.Price,
            previousPrice = c.PreviousPrice,
            delta = c.Delta,
            percent = c.Percent,
            date = c.Date,
            receiptId = c.ReceiptId
        })
        .ToList();
    return Results.Ok(rows);
}).RequireAuthorization();

app.MapGet("/api/receipts", async (AppDbContext db) =>
{
    var receipts = await db.Receipts.AsNoTracking().ToListAsync();
    var rows = receipts
        .OrderByDescending(r => r.Date)
        .ThenByDescending(r => r.Id)
        .Select(r => new
        {
            id = r.Id,
            groupId = r.GroupId,
            storeId = r.StoreId,
            storeName = r.StoreName,
            branch = r.Branch,
            date = r.Date,
            time = r.Time,
            invoiceNo = r.InvoiceNo,
            vatableNet = r.VatableNet,
            vatExemptSales = r.VatExemptSales,
            vat = r.Vat,
            total = r.Total,
            imagePath = r.ImagePath,
            createdBy = r.CreatedBy,
            createdByName = r.CreatedByName,
            itemCount = r.ItemCount,
            discrepancyNote = r.DiscrepancyNote
        })
        .ToList();
    return Results.Ok(rows);
}).RequireAuthorization();

app.MapGet("/api/receipts/{id}", async (string id, AppDbContext db) =>
{
    var r = await db.Receipts.AsNoTracking()
        .Include(x => x.Items)
        .FirstOrDefaultAsync(x => x.Id == id);
    if (r is null)
        return Results.NotFound(new { error = "Receipt not found." });

    var receiptDto = new
    {
        id = r.Id,
        groupId = r.GroupId,
        storeId = r.StoreId,
        storeName = r.StoreName,
        branch = r.Branch,
        date = r.Date,
        time = r.Time,
        invoiceNo = r.InvoiceNo,
        vatableNet = r.VatableNet,
        vatExemptSales = r.VatExemptSales,
        vat = r.Vat,
        total = r.Total,
        imagePath = r.ImagePath,
        createdBy = r.CreatedBy,
        createdByName = r.CreatedByName,
        itemCount = r.ItemCount,
        discrepancyNote = r.DiscrepancyNote
    };

    var itemsDto = r.Items.Select(i => new
    {
        id = i.Id,
        itemKey = i.ItemKey,
        qty = i.Qty,
        unitPrice = i.UnitPrice,
        lineTotal = i.LineTotal,
        vatType = i.VatType,
        flags = i.Flags
    }).ToList();

    return Results.Ok(new
    {
        receipt = receiptDto,
        items = itemsDto
    });
}).RequireAuthorization();

// =====================================================================
// STORAGE ENDPOINTS (LOCAL DISK FOR RECEIPT & PRODUCT PHOTOS)
// =====================================================================

app.MapPost("/api/storage/upload", async (HttpRequest request, StorageService storage) =>
{
    var path = request.Query["path"].ToString();
    if (string.IsNullOrWhiteSpace(path))
        return Results.BadRequest(new { error = "Storage path is required." });

    try
    {
        using var ms = new MemoryStream();
        if (request.HasFormContentType && request.Form.Files.Count > 0)
        {
            await request.Form.Files[0].CopyToAsync(ms);
        }
        else
        {
            await request.Body.CopyToAsync(ms);
        }
        var bytes = ms.ToArray();
        if (bytes.Length == 0)
            return Results.BadRequest(new { error = "Empty file payload." });

        await storage.SaveFileAsync(path, bytes);
        return Results.Ok(new { storagePath = path, url = $"/api/storage/{path}" });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
}).RequireAuthorization();

app.MapGet("/api/storage/{**path}", async (string path, StorageService storage) =>
{
    try
    {
        if (!storage.FileExists(path))
            return Results.NotFound();
        var bytes = await storage.ReadFileAsync(path);
        return Results.File(bytes, "image/jpeg");
    }
    catch
    {
        return Results.NotFound();
    }
});

// =====================================================================
// CLOUD FUNCTION EQUIVALENTS (/api/functions/*)
// =====================================================================

app.MapPost("/api/functions/scanReceipt", (ScanReceiptRequest req, VuePresyoService service) =>
    ExecuteSafeAsync(() => service.ScanReceiptAsync(req)))
    .RequireAuthorization();

app.MapPost("/api/functions/saveReceipt", (SaveReceiptRequest req, ClaimsPrincipal user, VuePresyoService service) =>
    ExecuteSafeAsync(() =>
    {
        var currentUser = GetCurrentUser(user);
        return service.SaveReceiptAsync(req, currentUser.Uid);
    }))
    .RequireAuthorization();

app.MapPost("/api/functions/describeProduct", (DescribeProductRequest req, VuePresyoService service) =>
    ExecuteSafeAsync(() => service.DescribeProductAsync(req)))
    .RequireAuthorization();

app.MapPost("/api/functions/confirmProductName", (ConfirmProductNameRequest req, VuePresyoService service) =>
    ExecuteSafeAsync(() => service.ConfirmProductNameAsync(req)))
    .RequireAuthorization();

app.MapPost("/api/functions/mergeProducts", (MergeProductsRequest req, VuePresyoService service) =>
    ExecuteSafeAsync(() => service.MergeProductsAsync(req)))
    .RequireAuthorization();

app.MapPost("/api/functions/resolveProductMatch", (ResolveProductMatchRequest req, VuePresyoService service) =>
    ExecuteSafeAsync(() => service.ResolveProductMatchAsync(req)))
    .RequireAuthorization();

app.MapPost("/api/functions/scanEnlistPhotos", (ScanEnlistRequest req, VuePresyoService service) =>
    ExecuteSafeAsync(() => service.ScanEnlistPhotosAsync(req)))
    .RequireAuthorization();

app.MapPost("/api/functions/saveEnlistedProduct", (SaveEnlistedPayloadDto req, VuePresyoService service) =>
    ExecuteSafeAsync(() => service.SaveEnlistedProductAsync(req)))
    .RequireAuthorization();

app.MapPost("/api/functions/updateProductInfo", (UpdateProductInfoRequest req, VuePresyoService service) =>
    ExecuteSafeAsync(() => service.UpdateProductInfoAsync(req)))
    .RequireAuthorization();

app.Run();

public partial class Program;
