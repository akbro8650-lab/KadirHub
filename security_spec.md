# KadirHub Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Identity Integrity**: No user may create or mutate a `users/{uid}`, `entries/{id}`, `reviews/{uid}`, or `vaultItems/{id}` document with an `authorUid`/`ownerUid`/`uid` different from `request.auth.uid`.
2. **PII Isolation**: User email addresses are stored exclusively in `/users/{userId}/private/info` and are readable only by the owning user (`request.auth.uid == userId`) or a verified admin.
3. **Zero Self-Promotion**: Users cannot create or modify `/admins/{uid}` documents unless they are the bootstrapped owner (`kadir25.bd@gmail.com` with `email_verified == true`).
4. **Moderation State Integrity**: Standard users creating `/entries/{entryId}` MUST set `status == 'pending'`, `ratingAvg == 0`, `ratingCount == 0`, `downloadCount == 0`, `featured == false`, and `moderationNote == ''`. Only admins may approve, reject, or feature directory entries.
5. **Terminal Approved State Lock**: Once an entry is `approved`, its author cannot modify its encrypted download payload or metadata without admin intervention (prevents bait-and-switch malware injection after approval).
6. **Review Uniqueness & Atomicity**: Each user can maintain at most one review per entry (`/entries/{entryId}/reviews/{request.auth.uid}`), only on `approved` entries, and aggregate rating updates on `/entries/{entryId}` require atomic batch existence verification (`existsAfter` / `exists`).
7. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time` on creation, `createdAt` is immutable on update, and `updatedAt` must equal `request.time` on update.
8. **Path & Size Hardening**: Every document ID matches `^[a-zA-Z0-9_\-]+$` (max 128 chars), and all strings enforce explicit `.size()` bounds.

## 2. The "Dirty Dozen" Attack Payloads
1. **Identity Spoofing on Entry Create**: `authorUid: "victim_uid"` while signed in as `attacker_uid` -> `PERMISSION_DENIED`.
2. **Self-Approval Bypass**: Standard user creates entry with `status: "approved"` -> `PERMISSION_DENIED`.
3. **Admin Self-Promotion**: Standard user writes `/admins/{attacker_uid}` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Creating an entry with extra key `isVerifiedOfficial: true` -> `PERMISSION_DENIED` (`hasOnly` rejection).
5. **Bait-and-Switch Approved Payload**: Original author updates `cipherText` on an already-`approved` entry -> `PERMISSION_DENIED`.
6. **Unverified Email Spoofing**: Token has `email: "kadir25.bd@gmail.com"` with `email_verified: false` -> `PERMISSION_DENIED`.
7. **PII Scraping**: Non-owner user calls `get` on `/users/{otherUid}/private/info` -> `PERMISSION_DENIED`.
8. **Pending Queue Scraping**: Non-admin user lists `/entries` without `status == 'approved'` or `authorUid == uid` -> `PERMISSION_DENIED`.
9. **ID Poisoning**: Creating `/entries/../../../../etc/passwd` or 500-char ID -> `PERMISSION_DENIED`.
10. **Ciphertext DoS / Oversized Payload**: `cipherText` exceeding 750,000 chars -> `PERMISSION_DENIED`.
11. **Backdated Timestamp Forgery**: `createdAt` set to client timestamp in the past instead of `request.time` -> `PERMISSION_DENIED`.
12. **Vault Cross-Tenant Read**: User B attempts `get` or `list` on User A's `/vaultItems/{itemId}` -> `PERMISSION_DENIED`.
