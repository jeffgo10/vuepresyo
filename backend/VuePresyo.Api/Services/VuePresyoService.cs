using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using VuePresyo.Api.Data;
using VuePresyo.Api.Domain;
using VuePresyo.Api.Models;

namespace VuePresyo.Api.Services;

public partial class VuePresyoService(
    AppDbContext db,
    StorageService storage,
    GeminiService gemini)
{
    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
    private static partial Regex DatePatternRegex();

    public async Task<ScanReceiptResponse> ScanReceiptAsync(ScanReceiptRequest request)
    {
        var storagePath = request.StoragePath;
        if (string.IsNullOrWhiteSpace(storagePath) || !VuePresyoKeys.IsReceiptImagePath(storagePath))
            throw new ArgumentException("Upload a receipt photo first.");

        if (string.IsNullOrEmpty(gemini.GetApiKey()))
        {
            throw new InvalidOperationException(
                "Gemini key is not configured. Use the sample receipt, or set GEMINI_API_KEY.");
        }

        byte[] imageBytes;
        try
        {
            imageBytes = await storage.ReadFileAsync(storagePath);
        }
        catch
        {
            throw new InvalidOperationException("Could not download the receipt photo.");
        }

        var existingStores = await db.Stores.AsNoTracking().ToListAsync();
        var receipt = await gemini.ExtractReceiptAsync(imageBytes, existingStores);

        if (existingStores.Count > 0)
        {
            var matched = StoreMatcher.MatchStore(
                receipt.Store.Id,
                receipt.Store.Name,
                receipt.Store.Branch,
                existingStores);

            receipt.Store.Id = matched.StoreId;
            receipt.Store.Name = matched.Name;
            if (matched.IsExisting && !string.IsNullOrWhiteSpace(matched.Branch))
            {
                receipt.Store.Branch = matched.Branch;
            }
        }

        return new ScanReceiptResponse(receipt, ReceiptValidator.ValidateReceipt(receipt));
    }

    public async Task<SaveReceiptResponse> SaveReceiptAsync(SaveReceiptRequest request, string uid)
    {
        var imagePath = request.ImagePath;
        if (!string.IsNullOrWhiteSpace(imagePath) && !VuePresyoKeys.IsReceiptImagePath(imagePath))
            throw new ArgumentException("Receipt photo path is not valid.");

        var receipt = ReceiptValidator.NormalizeExtraction(request.Receipt);
        if (!DatePatternRegex().IsMatch(receipt.Store.Date))
            throw new ArgumentException("Receipt date must be YYYY-MM-DD.");

        var (canSave, reason) = ReceiptValidator.CanSaveReceipt(receipt);
        if (!canSave)
            throw new InvalidOperationException(reason ?? "Receipt cannot be saved.");

        var discrepancyNote = !string.IsNullOrWhiteSpace(request.DiscrepancyNote)
            ? request.DiscrepancyNote.Trim()
            : ReceiptValidator.GetReceiptDiscrepancy(receipt);

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid);
        var createdByName = !string.IsNullOrWhiteSpace(user?.Name) ? user.Name : "Member";

        var existingStores = await db.Stores.ToListAsync();
        var matched = StoreMatcher.MatchStore(
            receipt.Store.Id,
            receipt.Store.Name,
            receipt.Store.Branch,
            existingStores);

        var storeId = matched.StoreId;
        var storeName = matched.IsExisting ? matched.Name : receipt.Store.Name;
        var storeBranch = matched.IsExisting ? (matched.Branch ?? receipt.Store.Branch) : receipt.Store.Branch;

        var duplicateKey = VuePresyoKeys.DuplicateIndexKey(
            storeId,
            receipt.Store.Date,
            receipt.Store.InvoiceNo,
            receipt.Totals.Total);

        if (await db.Receipts.AnyAsync(r => r.DuplicateKey == duplicateKey))
            throw new DuplicateReceiptException("This receipt is already saved.");

        await using var tx = await db.Database.BeginTransactionAsync();

        var storeEntity = existingStores.FirstOrDefault(s => s.Id == storeId);
        if (storeEntity == null)
        {
            db.Stores.Add(new StoreEntity
            {
                Id = storeId,
                Name = storeName,
                Branch = storeBranch
            });
        }
        else
        {
            storeEntity.Name = storeName;
            storeEntity.Branch = storeBranch;
        }

        var receiptId = $"rec_{Guid.NewGuid():N}"[..20];
        var receiptEntity = new ReceiptEntity
        {
            Id = receiptId,
            GroupId = VuePresyoKeys.GroupId,
            StoreId = storeId,
            StoreName = storeName,
            Branch = storeBranch,
            Date = receipt.Store.Date,
            Time = receipt.Store.Time,
            InvoiceNo = receipt.Store.InvoiceNo,
            VatableNet = receipt.Totals.VatableNet,
            VatExemptSales = receipt.Totals.VatExemptSales,
            Vat = receipt.Totals.Vat,
            Total = receipt.Totals.Total,
            ImagePath = string.IsNullOrWhiteSpace(imagePath) ? null : imagePath,
            CreatedBy = uid,
            CreatedByName = createdByName,
            ItemCount = receipt.Items.Count,
            DiscrepancyNote = discrepancyNote,
            DuplicateKey = duplicateKey
        };
        db.Receipts.Add(receiptEntity);

        var pricedKeys = new HashSet<string>();
        var pricedLines = new List<(string Key, double Price, string Name)>();

        foreach (var line in receipt.Items)
        {
            var key = VuePresyoKeys.ItemKey(storeId, line.Sku, line.RawName);
            var existingProd = await db.Products.FirstOrDefaultAsync(p => p.Key == key);

            var targetProductId = line.ProductId;
            string? linkedImagePath = null;
            List<string>? linkedImagePaths = null;
            string? linkedProductType = null;

            if (!string.IsNullOrWhiteSpace(line.LinkedItemKey) && line.LinkedItemKey != key)
            {
                var linkedProd = await db.Products.FirstOrDefaultAsync(p => p.Key == line.LinkedItemKey);
                if (linkedProd != null)
                {
                    if (string.IsNullOrWhiteSpace(targetProductId))
                    {
                        if (!string.IsNullOrWhiteSpace(linkedProd.ProductId))
                        {
                            targetProductId = linkedProd.ProductId;
                        }
                        else
                        {
                            var createdId = $"pg_{Guid.NewGuid():N}"[..16];
                            targetProductId = createdId;
                            linkedProd.ProductId = createdId;
                        }
                    }
                    if (!string.IsNullOrWhiteSpace(linkedProd.ImagePath))
                        linkedImagePath = linkedProd.ImagePath;
                    if (linkedProd.ImagePaths.Count > 0)
                        linkedImagePaths = linkedProd.ImagePaths;
                    if (!string.IsNullOrWhiteSpace(linkedProd.ProductType))
                        linkedProductType = linkedProd.ProductType;
                }
            }

            if (existingProd == null)
            {
                var newProd = ProductDomain.MergeProductEntity(
                    null,
                    key,
                    line.Sku,
                    storeId,
                    line.RawName,
                    line.Name,
                    line.Unit,
                    targetProductId,
                    linkedImagePath,
                    linkedImagePaths,
                    linkedProductType);
                db.Products.Add(newProd);
            }
            else
            {
                ProductDomain.MergeProductEntity(
                    existingProd,
                    key,
                    line.Sku,
                    storeId,
                    line.RawName,
                    line.Name,
                    line.Unit,
                    targetProductId,
                    linkedImagePath,
                    linkedImagePaths,
                    linkedProductType);
            }

            db.ReceiptItems.Add(new ReceiptItemEntity
            {
                Id = $"ri_{Guid.NewGuid():N}"[..20],
                ReceiptId = receiptId,
                ItemKey = key,
                Qty = line.Qty,
                UnitPrice = line.UnitPrice,
                LineTotal = line.LineTotal,
                VatType = line.VatType,
                Flags = line.Flags
            });

            if (line.VatType == "FREE" || pricedKeys.Contains(key))
                continue;

            pricedKeys.Add(key);
            db.PriceHistory.Add(new PriceHistoryEntity
            {
                Id = $"ph_{Guid.NewGuid():N}"[..20],
                ItemKey = key,
                Price = line.UnitPrice,
                Date = receipt.Store.Date,
                ReceiptId = receiptId
            });
            pricedLines.Add((key, line.UnitPrice, line.Name));
        }

        foreach (var (key, price, name) in pricedLines)
        {
            var priorEntities = await db.PriceHistory
                .AsNoTracking()
                .Where(p => p.ItemKey == key)
                .ToListAsync();

            var points = priorEntities
                .Select(p => new PricePointDto(p.Price, p.Date, p.ReceiptId))
                .Append(new PricePointDto(price, receipt.Store.Date, receiptId))
                .ToList();

            await ReplacePriceChangesForKeyAsync(key, name, storeId, storeName, points);
        }

        await db.SaveChangesAsync();
        await tx.CommitAsync();

        return new SaveReceiptResponse(receiptId);
    }

    public async Task<DescribeProductResponse> DescribeProductAsync(DescribeProductRequest request)
    {
        var itemKey = request.ItemKey?.Trim();
        if (string.IsNullOrEmpty(itemKey) || !VuePresyoKeys.IsItemKey(itemKey))
            throw new ArgumentException("That product was not found.");

        var rawPaths = (request.PhotoPaths ?? [])
            .Where(VuePresyoKeys.IsProductImagePath)
            .Take(VuePresyoKeys.MaxProductPhotos)
            .ToList();

        var effectivePaths = rawPaths.Count > 0 ? rawPaths : [VuePresyoKeys.ProductImagePath(itemKey)];

        var allProducts = await db.Products.ToListAsync();
        var current = allProducts.FirstOrDefault(p => p.Key == itemKey)
            ?? throw new KeyNotFoundException("Save the receipt before adding a photo.");

        var images = new List<byte[]>();
        foreach (var path in effectivePaths)
        {
            try
            {
                images.Add(await storage.ReadFileAsync(path));
            }
            catch
            {
                throw new ArgumentException("Upload a package photo first.");
            }
        }

        var declinedList = await db.ProductLinkDeclines
            .AsNoTracking()
            .Where(d => d.ItemKey == itemKey)
            .Select(d => d.DeclinedKey)
            .ToListAsync();
        var declined = declinedList.ToHashSet();

        var selected = ProductDomain.PackageMatchCandidates(allProducts, current, declined);

        current.ImagePath = effectivePaths[0];
        current.ImagePaths = effectivePaths;

        if (!string.IsNullOrWhiteSpace(current.ProductId))
        {
            foreach (var prod in allProducts)
            {
                if (prod.Key != itemKey && prod.ProductId == current.ProductId && string.IsNullOrWhiteSpace(prod.ImagePath))
                {
                    prod.ImagePath = effectivePaths[0];
                    prod.ImagePaths = effectivePaths;
                }
            }
        }
        await db.SaveChangesAsync();

        if (string.IsNullOrEmpty(gemini.GetApiKey()))
        {
            return new DescribeProductResponse(
                null, null, null, null, null,
                "Photo saved. A Gemini key is needed to suggest a name.");
        }

        var withImages = new List<(string Key, string Name, byte[] Image)>();
        foreach (var cand in selected)
        {
            if (string.IsNullOrWhiteSpace(cand.ImagePath)) continue;
            try
            {
                var bytes = await storage.ReadFileAsync(cand.ImagePath);
                withImages.Add((cand.Key, cand.Name, bytes));
            }
            catch
            {
                // skip missing candidate photo
            }
        }

        GeminiPackageDescription described;
        try
        {
            described = await gemini.DescribePackageAsync(images, withImages);
        }
        catch
        {
            return new DescribeProductResponse(null, null, null, null, null, "Photo saved.");
        }

        var stores = await db.Stores.AsNoTracking().ToDictionaryAsync(s => s.Id, s => s.Name);
        var matchKey = described.SameItemKeys.FirstOrDefault(k => withImages.Any(w => w.Key == k));
        var matched = matchKey != null ? selected.FirstOrDefault(m => m.Key == matchKey) : null;

        var suggestedProductType = ProductDomain.CleanSuggestedName(described.SuggestedProductType);
        var suggestedSku = ProductDomain.CleanSku(described.SuggestedSku);
        var suggestedUnit = ProductDomain.CleanSuggestedName(described.SuggestedUnit)?.ToLowerInvariant();

        if (!string.IsNullOrWhiteSpace(suggestedProductType))
        {
            current.ProductType = suggestedProductType;
            if (!string.IsNullOrWhiteSpace(current.ProductId))
            {
                foreach (var prod in allProducts.Where(p => p.ProductId == current.ProductId))
                {
                    prod.ProductType = suggestedProductType;
                }
            }
        }
        if (!string.IsNullOrWhiteSpace(suggestedSku) && string.IsNullOrWhiteSpace(current.Sku))
        {
            current.Sku = suggestedSku;
        }
        if (!string.IsNullOrWhiteSpace(suggestedUnit) && string.IsNullOrWhiteSpace(current.Unit))
        {
            current.Unit = suggestedUnit;
        }
        await db.SaveChangesAsync();

        ProductMatchDto? matchDto = null;
        if (matched != null)
        {
            var sName = stores.TryGetValue(matched.StoreId, out var n) && !string.IsNullOrWhiteSpace(n)
                ? n
                : "Another store";
            matchDto = new ProductMatchDto(matched.Key, matched.Name, sName);
        }

        return new DescribeProductResponse(
            SuggestedName: ProductDomain.CleanSuggestedName(described.SuggestedName),
            SuggestedProductType: suggestedProductType,
            SuggestedSku: suggestedSku,
            SuggestedUnit: suggestedUnit,
            Match: matchDto,
            Notice: null
        );
    }

    public async Task<ConfirmProductNameResponse> ConfirmProductNameAsync(ConfirmProductNameRequest request)
    {
        var itemKey = request.ItemKey?.Trim();
        if (string.IsNullOrEmpty(itemKey) || !VuePresyoKeys.IsItemKey(itemKey))
            throw new ArgumentException("That product was not found.");

        var name = ProductDomain.CleanSuggestedName(request.Name);
        if (string.IsNullOrEmpty(name))
            throw new ArgumentException("Enter a product name.");

        var rawType = ProductDomain.CleanSuggestedName(request.ProductType);
        var rawSku = ProductDomain.CleanSku(request.Sku);
        var rawUnit = ProductDomain.CleanSuggestedName(request.Unit)?.ToLowerInvariant();

        var allProducts = await db.Products.ToListAsync();
        var product = allProducts.FirstOrDefault(p => p.Key == itemKey)
            ?? throw new KeyNotFoundException("That product was not found.");

        var productId = string.IsNullOrWhiteSpace(product.ProductId) ? null : product.ProductId.Trim();
        var myPack = ProductDomain.ParsePackSize(name);
        var keysToUpdate = new HashSet<string> { itemKey };

        if (productId != null)
        {
            foreach (var p in allProducts.Where(p => p.ProductId?.Trim() == productId))
            {
                var otherPack = ProductDomain.ParsePackSize(p.Name);
                if (myPack != null && otherPack != null &&
                    (myPack.Dimension != otherPack.Dimension || Math.Abs(myPack.Quantity - otherPack.Quantity) > 1e-6))
                {
                    continue;
                }
                keysToUpdate.Add(p.Key);
            }
        }

        foreach (var k in keysToUpdate)
        {
            var prod = allProducts.First(p => p.Key == k);
            prod.Name = name;
            if (!string.IsNullOrWhiteSpace(rawType)) prod.ProductType = rawType;
            if (!string.IsNullOrWhiteSpace(rawSku)) prod.Sku = rawSku;

            var changes = await db.PriceChanges.Where(c => c.ItemKey == k).ToListAsync();
            foreach (var c in changes) c.Name = name;
        }

        if (!string.IsNullOrWhiteSpace(rawUnit))
        {
            product.Unit = rawUnit;
        }

        await db.SaveChangesAsync();
        return new ConfirmProductNameResponse(name, rawType, rawSku, rawUnit);
    }

    public async Task<MergeProductsResponse> MergeProductsAsync(MergeProductsRequest request)
    {
        var sourceKey = request.SourceKey?.Trim();
        var targetKey = request.TargetKey?.Trim();
        if (string.IsNullOrEmpty(sourceKey) || !VuePresyoKeys.IsItemKey(sourceKey))
            throw new ArgumentException("Source product was not found.");
        if (string.IsNullOrEmpty(targetKey) || !VuePresyoKeys.IsItemKey(targetKey))
            throw new ArgumentException("Target product was not found.");
        if (sourceKey == targetKey)
            throw new ArgumentException("Source and target products must be different.");

        var source = await db.Products.FirstOrDefaultAsync(p => p.Key == sourceKey)
            ?? throw new KeyNotFoundException("Source product was not found.");
        var target = await db.Products.FirstOrDefaultAsync(p => p.Key == targetKey)
            ?? throw new KeyNotFoundException("Target product was not found.");

        var confirmedName = ProductDomain.CleanSuggestedName(request.Name) ?? target.Name;
        var confirmedType = ProductDomain.CleanSuggestedName(request.ProductType);
        var confirmedSku = ProductDomain.CleanSku(request.Sku) ?? ProductDomain.CleanSku(target.Sku);

        var mergedPhotos = target.ImagePaths
            .Concat(source.ImagePaths)
            .Distinct()
            .Take(VuePresyoKeys.MaxProductPhotos)
            .ToList();

        if (!string.IsNullOrWhiteSpace(source.StoreId) && source.StoreId == target.StoreId)
        {
            // Same store merge
            var receiptItems = await db.ReceiptItems.Where(ri => ri.ItemKey == sourceKey).ToListAsync();
            foreach (var ri in receiptItems) ri.ItemKey = targetKey;

            var sourceHist = await db.PriceHistory.Where(ph => ph.ItemKey == sourceKey).ToListAsync();
            foreach (var ph in sourceHist) ph.ItemKey = targetKey;

            var sourceChanges = await db.PriceChanges.Where(pc => pc.ItemKey == sourceKey).ToListAsync();
            db.PriceChanges.RemoveRange(sourceChanges);

            if (!string.IsNullOrWhiteSpace(confirmedName)) target.Name = confirmedName;
            if (!string.IsNullOrWhiteSpace(confirmedType)) target.ProductType = confirmedType;
            if (!string.IsNullOrWhiteSpace(confirmedSku)) target.Sku = confirmedSku;
            if (mergedPhotos.Count > 0)
            {
                target.ImagePath = mergedPhotos[0];
                target.ImagePaths = mergedPhotos;
            }
            if (string.IsNullOrWhiteSpace(target.ProductId) && !string.IsNullOrWhiteSpace(source.ProductId))
            {
                target.ProductId = source.ProductId;
            }

            db.Products.Remove(source);
            await db.SaveChangesAsync();

            var store = await db.Stores.AsNoTracking().FirstOrDefaultAsync(s => s.Id == target.StoreId);
            var allHist = await db.PriceHistory.AsNoTracking().Where(p => p.ItemKey == targetKey).ToListAsync();
            await ReplacePriceChangesForKeyAsync(
                targetKey,
                target.Name,
                target.StoreId,
                store?.Name ?? target.StoreId,
                allHist.Select(p => new PricePointDto(p.Price, p.Date, p.ReceiptId)));
            await db.SaveChangesAsync();

            return new MergeProductsResponse(true, targetKey, "merged");
        }
        else
        {
            // Cross-store link
            var createdId = $"pg_{Guid.NewGuid():N}"[..16];
            var productId = ProductDomain.ProductIdForLink(source.ProductId, target.ProductId, createdId);

            source.ProductId = productId;
            target.ProductId = productId;

            if (!string.IsNullOrWhiteSpace(confirmedName))
            {
                source.Name = confirmedName;
                var sourcePack = ProductDomain.ParsePackSize(confirmedName);
                var targetPack = ProductDomain.ParsePackSize(target.Name);
                if (string.IsNullOrWhiteSpace(target.Name) || targetPack == null ||
                    (sourcePack != null && targetPack.Dimension == sourcePack.Dimension &&
                     Math.Abs(targetPack.Quantity - sourcePack.Quantity) < 1e-6))
                {
                    target.Name = confirmedName;
                }
            }
            if (!string.IsNullOrWhiteSpace(confirmedType))
            {
                source.ProductType = confirmedType;
                target.ProductType = confirmedType;
            }
            if (!string.IsNullOrWhiteSpace(confirmedSku))
            {
                source.Sku = confirmedSku;
            }
            if (mergedPhotos.Count > 0)
            {
                source.ImagePath = mergedPhotos[0];
                source.ImagePaths = mergedPhotos;
            }

            await db.SaveChangesAsync();
            return new MergeProductsResponse(true, sourceKey, "linked");
        }
    }

    public async Task<ResolveProductMatchResponse> ResolveProductMatchAsync(ResolveProductMatchRequest request)
    {
        var itemKey = request.ItemKey?.Trim();
        var otherKey = request.OtherKey?.Trim();
        if (string.IsNullOrEmpty(itemKey) || !VuePresyoKeys.IsItemKey(itemKey) ||
            string.IsNullOrEmpty(otherKey) || !VuePresyoKeys.IsItemKey(otherKey) ||
            itemKey == otherKey || request.Same == null)
        {
            throw new ArgumentException("Choose whether the products are the same.");
        }

        if (!request.Same.Value)
        {
            if (!await db.ProductLinkDeclines.AnyAsync(d => d.ItemKey == itemKey && d.DeclinedKey == otherKey))
                db.ProductLinkDeclines.Add(new ProductLinkDeclineEntity { ItemKey = itemKey, DeclinedKey = otherKey });
            if (!await db.ProductLinkDeclines.AnyAsync(d => d.ItemKey == otherKey && d.DeclinedKey == itemKey))
                db.ProductLinkDeclines.Add(new ProductLinkDeclineEntity { ItemKey = otherKey, DeclinedKey = itemKey });
            await db.SaveChangesAsync();
            return new ResolveProductMatchResponse(null);
        }

        var left = await db.Products.FirstOrDefaultAsync(p => p.Key == itemKey);
        var right = await db.Products.FirstOrDefaultAsync(p => p.Key == otherKey);
        if (left == null || right == null || left.StoreId == right.StoreId)
            throw new InvalidOperationException("Those products cannot be linked.");

        var createdId = $"pg_{Guid.NewGuid():N}"[..16];
        var productId = ProductDomain.ProductIdForLink(left.ProductId, right.ProductId, createdId);

        left.ProductId = productId;
        right.ProductId = productId;

        var combinedPhotos = left.ImagePaths
            .Concat(right.ImagePaths)
            .Distinct()
            .Take(VuePresyoKeys.MaxProductPhotos)
            .ToList();

        if (combinedPhotos.Count > 0)
        {
            if (string.IsNullOrWhiteSpace(left.ImagePath))
            {
                left.ImagePath = combinedPhotos[0];
                left.ImagePaths = combinedPhotos;
            }
            if (string.IsNullOrWhiteSpace(right.ImagePath))
            {
                right.ImagePath = combinedPhotos[0];
                right.ImagePaths = combinedPhotos;
            }
        }

        if (!string.IsNullOrWhiteSpace(left.ProductType) && string.IsNullOrWhiteSpace(right.ProductType))
            right.ProductType = left.ProductType;
        else if (!string.IsNullOrWhiteSpace(right.ProductType) && string.IsNullOrWhiteSpace(left.ProductType))
            left.ProductType = right.ProductType;

        await db.SaveChangesAsync();
        return new ResolveProductMatchResponse(productId);
    }

    public async Task<ScanEnlistResponse> ScanEnlistPhotosAsync(ScanEnlistRequest request)
    {
        var photoPaths = request.PhotoPaths;
        if (photoPaths == null || photoPaths.Count == 0)
            throw new ArgumentException("At least one photo is required.");
        if (photoPaths.Count > VuePresyoKeys.MaxProductPhotos)
            throw new ArgumentException($"Maximum of {VuePresyoKeys.MaxProductPhotos} photos allowed.");

        var images = new List<byte[]>();
        foreach (var path in photoPaths)
        {
            if (!VuePresyoKeys.IsProductImagePath(path))
                throw new ArgumentException($"Invalid photo path: {path}");
            images.Add(await storage.ReadFileAsync(path));
        }

        var extraction = await gemini.ExtractEnlistPhotosAsync(images);

        var candidateMatches = new List<CandidateMatchDto>();
        var products = await db.Products.AsNoTracking().ToListAsync();
        var stores = await db.Stores.AsNoTracking().ToDictionaryAsync(s => s.Id, s => s.Name);

        var extractedSku = extraction.Sku;
        var extractedName = extraction.SuggestedName?.ToLowerInvariant() ?? string.Empty;

        foreach (var p in products)
        {
            var storeName = stores.TryGetValue(p.StoreId, out var sName) ? sName : p.StoreId;
            var pName = p.Name.ToLowerInvariant();
            bool matched = false;

            if (!string.IsNullOrWhiteSpace(extractedSku) && !string.IsNullOrWhiteSpace(p.Sku) && extractedSku == p.Sku)
            {
                matched = true;
            }
            else if (!string.IsNullOrEmpty(extractedName) &&
                     (pName.Contains(extractedName, StringComparison.Ordinal) ||
                      extractedName.Contains(pName, StringComparison.Ordinal)))
            {
                matched = true;
            }

            if (matched)
            {
                candidateMatches.Add(new CandidateMatchDto(
                    p.Key, p.Name, p.StoreId, storeName, p.Sku, p.ImagePath));
                if (candidateMatches.Count >= 3) break;
            }
        }

        return new ScanEnlistResponse(extraction, candidateMatches);
    }

    public async Task<SaveEnlistedResponse> SaveEnlistedProductAsync(SaveEnlistedPayloadDto request)
    {
        var issues = new List<string>();
        if (string.IsNullOrWhiteSpace(request.StoreName)) issues.Add("Store name is required.");
        if (string.IsNullOrWhiteSpace(request.Name)) issues.Add("Product name is required.");
        if (!double.IsFinite(request.Price) || request.Price <= 0) issues.Add("Price must be a positive number.");
        if (request.ImagePaths == null || request.ImagePaths.Count == 0)
            issues.Add("At least one photo is required.");
        else if (request.ImagePaths.Count > VuePresyoKeys.MaxProductPhotos)
            issues.Add($"Maximum of {VuePresyoKeys.MaxProductPhotos} photos allowed.");
        else if (request.ImagePaths.Any(p => !VuePresyoKeys.IsProductImagePath(p)))
            issues.Add("Invalid image path.");

        if (issues.Count > 0)
            throw new ArgumentException(string.Join(" ", issues));

        var existingStores = await db.Stores.ToListAsync();
        var matched = StoreMatcher.MatchStore(null, request.StoreName, request.Branch, existingStores);
        var storeId = matched.StoreId;
        var finalStoreName = matched.IsExisting ? matched.Name : request.StoreName.Trim();
        var finalBranch = matched.IsExisting
            ? (matched.Branch ?? (string.IsNullOrWhiteSpace(request.Branch) ? null : request.Branch.Trim()))
            : (string.IsNullOrWhiteSpace(request.Branch) ? null : request.Branch.Trim());

        var storeEntity = existingStores.FirstOrDefault(s => s.Id == storeId);
        if (storeEntity == null)
        {
            db.Stores.Add(new StoreEntity { Id = storeId, Name = finalStoreName, Branch = finalBranch });
        }
        else
        {
            storeEntity.Name = finalStoreName;
            storeEntity.Branch = finalBranch;
        }

        var key = VuePresyoKeys.ItemKey(storeId, request.Sku, request.Name);
        var existing = await db.Products.FirstOrDefaultAsync(p => p.Key == key);
        var isExisting = existing != null;

        var targetProductId = existing?.ProductId;
        string? linkedImagePath = null;
        List<string>? linkedImagePaths = null;
        string? linkedProductType = null;

        if (!string.IsNullOrWhiteSpace(request.LinkedItemKey) && request.LinkedItemKey != key)
        {
            var linked = await db.Products.FirstOrDefaultAsync(p => p.Key == request.LinkedItemKey);
            if (linked != null)
            {
                if (string.IsNullOrWhiteSpace(targetProductId))
                {
                    if (!string.IsNullOrWhiteSpace(linked.ProductId))
                    {
                        targetProductId = linked.ProductId;
                    }
                    else
                    {
                        var createdId = $"pg_{Guid.NewGuid():N}"[..16];
                        targetProductId = createdId;
                        linked.ProductId = createdId;
                    }
                }
                linkedImagePath = linked.ImagePath;
                if (linked.ImagePaths.Count > 0) linkedImagePaths = linked.ImagePaths;
                linkedProductType = linked.ProductType;
            }
        }

        var effectiveImagePaths = request.ImagePaths is { Count: > 0 } ? request.ImagePaths : linkedImagePaths;

        if (existing == null)
        {
            var created = ProductDomain.MergeProductEntity(
                null,
                key,
                request.Sku,
                storeId,
                request.Name.Trim(),
                request.Name.Trim(),
                request.Unit,
                targetProductId,
                effectiveImagePaths?.FirstOrDefault() ?? linkedImagePath,
                effectiveImagePaths,
                !string.IsNullOrWhiteSpace(request.ProductType) ? request.ProductType.Trim() : linkedProductType);
            db.Products.Add(created);
        }
        else
        {
            ProductDomain.MergeProductEntity(
                existing,
                key,
                request.Sku,
                storeId,
                request.Name.Trim(),
                request.Name.Trim(),
                request.Unit,
                targetProductId,
                effectiveImagePaths?.FirstOrDefault() ?? linkedImagePath,
                effectiveImagePaths,
                !string.IsNullOrWhiteSpace(request.ProductType) ? request.ProductType.Trim() : linkedProductType);
        }

        var today = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var receiptId = $"enlist_{today}";

        db.PriceHistory.Add(new PriceHistoryEntity
        {
            Id = $"ph_{Guid.NewGuid():N}"[..20],
            ItemKey = key,
            Price = request.Price,
            Date = today,
            ReceiptId = receiptId
        });

        var priorHistory = await db.PriceHistory.AsNoTracking().Where(p => p.ItemKey == key).ToListAsync();
        var points = priorHistory
            .Select(p => new PricePointDto(p.Price, p.Date, p.ReceiptId))
            .Append(new PricePointDto(request.Price, today, receiptId))
            .ToList();

        await ReplacePriceChangesForKeyAsync(key, request.Name.Trim(), storeId, finalStoreName, points);
        await db.SaveChangesAsync();

        return new SaveEnlistedResponse(true, key, storeId, isExisting);
    }

    public async Task<UpdateProductInfoResponse> UpdateProductInfoAsync(UpdateProductInfoRequest request)
    {
        var itemKey = request.ItemKey?.Trim();
        if (string.IsNullOrEmpty(itemKey) || !VuePresyoKeys.IsItemKey(itemKey))
            throw new ArgumentException("Choose a product first.");

        var name = ProductDomain.CleanSuggestedName(request.Name);
        if (string.IsNullOrEmpty(name))
            throw new ArgumentException("Enter a valid product name.");

        var rawUnit = (request.Unit ?? "pc").Trim().ToLowerInvariant();
        if (rawUnit.Length > 20) rawUnit = rawUnit[..20];
        var unit = string.IsNullOrEmpty(rawUnit) ? "pc" : rawUnit;

        var productType = ProductDomain.CleanSuggestedName(request.ProductType);
        var scope = request.Scope ?? "all";

        var allProducts = await db.Products.ToListAsync();
        var product = allProducts.FirstOrDefault(p => p.Key == itemKey)
            ?? throw new KeyNotFoundException("That product was not found.");

        var productId = string.IsNullOrWhiteSpace(product.ProductId) ? null : product.ProductId.Trim();
        var keysToUpdate = new HashSet<string> { itemKey };

        if (scope != "store" && productId != null)
        {
            foreach (var p in allProducts.Where(p => p.ProductId?.Trim() == productId))
            {
                keysToUpdate.Add(p.Key);
            }
        }

        foreach (var k in keysToUpdate)
        {
            var prod = allProducts.First(p => p.Key == k);
            prod.Name = name;
            prod.Unit = unit;
            prod.ProductType = productType;

            var changes = await db.PriceChanges.Where(c => c.ItemKey == k).ToListAsync();
            foreach (var c in changes) c.Name = name;
        }

        await db.SaveChangesAsync();
        return new UpdateProductInfoResponse(name, unit, productType);
    }

    private async Task ReplacePriceChangesForKeyAsync(
        string key,
        string name,
        string storeId,
        string storeName,
        IEnumerable<PricePointDto> points)
    {
        var existingChanges = await db.PriceChanges.Where(c => c.ItemKey == key).ToListAsync();
        if (existingChanges.Count > 0)
            db.PriceChanges.RemoveRange(existingChanges);

        var changes = PriceChangeCalculator.PriceChangesFromHistory(points);
        foreach (var change in changes)
        {
            var changeKey = PriceChangeCalculator.PriceChangeRecordId(change);
            db.PriceChanges.Add(new PriceChangeEntity
            {
                Id = $"{key}/{changeKey}",
                ItemKey = key,
                ChangeKey = changeKey,
                Name = name,
                StoreId = storeId,
                StoreName = storeName,
                Price = change.Price,
                PreviousPrice = change.PreviousPrice,
                Delta = change.Delta,
                Percent = change.Percent,
                Date = change.Date,
                ReceiptId = change.ReceiptId
            });
        }
    }
}

public class DuplicateReceiptException(string message) : Exception(message);

