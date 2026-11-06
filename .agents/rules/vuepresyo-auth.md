# VuePresyo Auth

Login only. There is no registration screen and no client call to create a user.

- Accounts are created automatically by `backend/VuePresyo.Api/Data/DbSeeder.cs` on API startup.
- Seeded members: Aidee (`abdinglasa@gmail.com`) and Jeff (`jeffrey.t.go@gmail.com`). Both belong to group `GO`.
- After login (`/api/auth/login`), the header chip reads user profile (`name`, `groupId`) and must show `Group GO · {name}`.
- API endpoints require a valid JWT Bearer token issued by `JwtTokenService` and verify group membership (`groupId == "GO"`).
- Receipt, item, product, store, and price-history **writes** go through `VuePresyoService` (`/api/functions/saveReceipt`).
- Do not store buyer name, address, or TIN from a receipt.

