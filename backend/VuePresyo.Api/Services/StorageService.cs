using VuePresyo.Api.Domain;

namespace VuePresyo.Api.Services;

public class StorageService
{
    private readonly string _rootPath;

    public StorageService(IWebHostEnvironment env, IConfiguration config)
    {
        var configured = config["Storage:RootPath"];
        _rootPath = !string.IsNullOrWhiteSpace(configured)
            ? configured
            : Path.Combine(env.ContentRootPath, "storage");
        Directory.CreateDirectory(_rootPath);
    }

    public static bool IsValidStoragePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return false;
        return VuePresyoKeys.IsReceiptImagePath(path) || VuePresyoKeys.IsProductImagePath(path);
    }

    public string ResolveFilePath(string storagePath)
    {
        if (!IsValidStoragePath(storagePath))
            throw new ArgumentException($"Invalid storage path: {storagePath}");

        var normalized = storagePath.Replace('/', Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(_rootPath, normalized));
        var rootFull = Path.GetFullPath(_rootPath);
        if (!fullPath.StartsWith(rootFull, StringComparison.Ordinal))
            throw new ArgumentException("Path traversal is not allowed.");

        return fullPath;
    }

    public async Task SaveFileAsync(string storagePath, byte[] bytes)
    {
        var fullPath = ResolveFilePath(storagePath);
        var dir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        await File.WriteAllBytesAsync(fullPath, bytes);
    }

    public async Task<byte[]> ReadFileAsync(string storagePath)
    {
        var fullPath = ResolveFilePath(storagePath);
        if (!File.Exists(fullPath))
            throw new FileNotFoundException($"Storage file not found: {storagePath}");
        return await File.ReadAllBytesAsync(fullPath);
    }

    public bool FileExists(string storagePath)
    {
        if (!IsValidStoragePath(storagePath)) return false;
        var fullPath = ResolveFilePath(storagePath);
        return File.Exists(fullPath);
    }
}

