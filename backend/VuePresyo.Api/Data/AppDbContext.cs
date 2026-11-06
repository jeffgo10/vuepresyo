using Microsoft.EntityFrameworkCore;
using VuePresyo.Api.Models;

namespace VuePresyo.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppGroup> Groups => Set<AppGroup>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<StoreEntity> Stores => Set<StoreEntity>();
    public DbSet<ProductEntity> Products => Set<ProductEntity>();
    public DbSet<ReceiptEntity> Receipts => Set<ReceiptEntity>();
    public DbSet<ReceiptItemEntity> ReceiptItems => Set<ReceiptItemEntity>();
    public DbSet<PriceHistoryEntity> PriceHistory => Set<PriceHistoryEntity>();
    public DbSet<PriceChangeEntity> PriceChanges => Set<PriceChangeEntity>();
    public DbSet<ProductLinkDeclineEntity> ProductLinkDeclines => Set<ProductLinkDeclineEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AppUser>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<ReceiptEntity>()
            .HasIndex(r => r.DuplicateKey)
            .IsUnique();

        modelBuilder.Entity<ReceiptEntity>()
            .HasMany(r => r.Items)
            .WithOne()
            .HasForeignKey(i => i.ReceiptId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<PriceHistoryEntity>()
            .HasIndex(p => p.ItemKey);

        modelBuilder.Entity<PriceChangeEntity>()
            .HasIndex(p => p.ItemKey);

        modelBuilder.Entity<ProductLinkDeclineEntity>()
            .HasKey(d => new { d.ItemKey, d.DeclinedKey });
    }
}

