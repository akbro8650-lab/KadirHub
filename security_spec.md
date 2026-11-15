# KadirHub APK Distribution Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Owner-Only Mutations**: Only the verified owner account (`kadir25.bd@gmail.com` with `request.auth.token.email_verified == true`) may create, update, or delete `/apk_releases`, `/apk_files`, and `/apk_files/{releaseId}/chunks`.
2. **Unauthenticated Public Downloads**: Public visitors do not need to sign in to view or download published APK releases (`isPublished == true`). Unpublished/draft releases remain unreadable to non-owners.
3. **Strict Schema Enforcement**: Every write enforces `hasAll` + `hasOnly`, exact string lengths, valid IDs (`^[a-zA-Z0-9_\-]+$`), lowercase 64-char SHA-256 hex format, and strict immutable `createdAt` / `uploaderUid`.
4. **Relational Integrity**: `/apk_releases/{releaseId}` creation requires `exists(/databases/$(database)/documents/apk_files/$(releaseId))`, and chunk reads inherit `isPublished == true` from the parent `/apk_files/{releaseId}` document via `get()`.
5. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on update.

## 2. Adversarial Attack Matrix
1. **Non-Owner Write**: Any authenticated or unauthenticated user other than `kadir25.bd@gmail.com` writes to `/apk_releases` or `/apk_files` -> `PERMISSION_DENIED`.
2. **Unverified Owner Email Spoof**: Token has `email: "kadir25.bd@gmail.com"` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection**: Owner payload includes undeclared field `adminOverride: true` -> `PERMISSION_DENIED` (`hasOnly` check).
4. **Unpublished Release Scraping**: Visitor calls `get` or `list` on `/apk_releases` where `isPublished == false` -> `PERMISSION_DENIED`.
5. **Orphaned Release Record**: Creating `/apk_releases/{id}` without a matching `/apk_files/{id}` payload -> `PERMISSION_DENIED`.
6. **Chunk Size / Ciphertext DoS**: Chunk `ciphertextBase64` exceeding `750,000` chars or `byteSize > 450,000` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: Document ID containing slashes or >128 chars -> `PERMISSION_DENIED`.
8. **Backdated Timestamp Forgery**: `createdAt` set to a client-supplied past timestamp instead of `request.time` -> `PERMISSION_DENIED`.
