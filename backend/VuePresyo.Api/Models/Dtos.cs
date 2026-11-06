namespace VuePresyo.Api.Models;

public record LoginRequest(string Email, string Password);

public record AuthUserDto(string Uid, string Email, string Name, string GroupId);

public record LoginResponse(string Token, AuthUserDto User);

public class ReceiptLineDto
{
    public string? Sku { get; set; }
    public string RawName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public double Qty { get; set; }
    public double UnitPrice { get; set; }
    public double LineTotal { get; set; }
    public string? VatType { get; set; }
    public List<string> Flags { get; set; } = [];
    public string? Unit { get; set; }
    public string? ProductId { get; set; }
    public string? LinkedItemKey { get; set; }
}

public class ReceiptTotalsDto
{
    public double? Subtotal { get; set; }
    public double? VatableNet { get; set; }
    public double VatExemptSales { get; set; }
    public double? Vat { get; set; }
    public double Total { get; set; }
}

public class ReceiptStoreDto
{
    public string? Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Branch { get; set; }
    public string Date { get; set; } = string.Empty;
    public string? Time { get; set; }
    public string? InvoiceNo { get; set; }
}

public class ExtractedReceiptDto
{
    public ReceiptStoreDto Store { get; set; } = new();
    public List<ReceiptLineDto> Items { get; set; } = [];
    public ReceiptTotalsDto Totals { get; set; } = new();
}

public record ValidationIssueDto(string Code, string Message);

public record ValidationResultDto(bool Ok, bool NeedsReview, List<ValidationIssueDto> Issues);

public record ScanReceiptRequest(string? StoragePath);

public record ScanReceiptResponse(ExtractedReceiptDto Receipt, ValidationResultDto Validation);

public class SaveReceiptRequest
{
    public ExtractedReceiptDto? Receipt { get; set; }
    public string? ImagePath { get; set; }
    public string? DiscrepancyNote { get; set; }
}

public record SaveReceiptResponse(string ReceiptId);

public class DescribeProductRequest
{
    public string? ItemKey { get; set; }
    public List<string>? PhotoPaths { get; set; }
}

public record ProductMatchDto(string ItemKey, string Name, string StoreName);

public record DescribeProductResponse(
    string? SuggestedName,
    string? SuggestedProductType,
    string? SuggestedSku,
    string? SuggestedUnit,
    ProductMatchDto? Match,
    string? Notice
);

public class ConfirmProductNameRequest
{
    public string? ItemKey { get; set; }
    public string? Name { get; set; }
    public string? ProductType { get; set; }
    public string? Sku { get; set; }
    public string? Unit { get; set; }
}

public record ConfirmProductNameResponse(
    string Name,
    string? ProductType,
    string? Sku,
    string? Unit
);

public class MergeProductsRequest
{
    public string? SourceKey { get; set; }
    public string? TargetKey { get; set; }
    public string? Name { get; set; }
    public string? ProductType { get; set; }
    public string? Sku { get; set; }
}

public record MergeProductsResponse(bool Success, string TargetKey, string Mode);

public class ResolveProductMatchRequest
{
    public string? ItemKey { get; set; }
    public string? OtherKey { get; set; }
    public bool? Same { get; set; }
}

public record ResolveProductMatchResponse(string? ProductId);

public class ScanEnlistRequest
{
    public List<string>? PhotoPaths { get; set; }
}

public record EnlistPhotoExtractionDto(
    string? SuggestedName,
    string? SuggestedProductType,
    double? Price,
    string? Sku,
    string? Unit
);

public record CandidateMatchDto(
    string ItemKey,
    string Name,
    string StoreId,
    string StoreName,
    string? Sku,
    string? ImagePath
);

public record ScanEnlistResponse(
    EnlistPhotoExtractionDto Extraction,
    List<CandidateMatchDto> CandidateMatches
);

public class SaveEnlistedPayloadDto
{
    public string StoreName { get; set; } = string.Empty;
    public string? Branch { get; set; }
    public string? StoreId { get; set; }
    public string Name { get; set; } = string.Empty;
    public double Price { get; set; }
    public string? Sku { get; set; }
    public string? Unit { get; set; }
    public string? ProductType { get; set; }
    public List<string> ImagePaths { get; set; } = [];
    public string? LinkedItemKey { get; set; }
}

public record SaveEnlistedResponse(
    bool Success,
    string ItemKey,
    string StoreId,
    bool IsExisting
);

public class UpdateProductInfoRequest
{
    public string? ItemKey { get; set; }
    public string? Name { get; set; }
    public string? Unit { get; set; }
    public string? ProductType { get; set; }
    public string? Scope { get; set; }
}

public record UpdateProductInfoResponse(
    string Name,
    string Unit,
    string? ProductType
);

