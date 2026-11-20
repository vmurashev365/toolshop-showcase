# FIND-01 · Missing auth contract on `PUT` / `PATCH /products/{productId}`

**Environment:** `https://api.practicesoftwaretesting.com/docs` (OpenAPI spec) and upstream Sprint 5 source (`testsmith-io/practice-software-testing`), audited 2026-11-20.  
**Evidence:** [OpenAPI excerpt (JSON)](../evidence/find-01-openapi-products.json) · [Automated check (`TC-SEC-003`)](../../tests/pw/api/security-rbac.spec.ts#L51-L66)

## What was actually checked (non-destructive)

No mutating `PUT` or `PATCH` request was sent to the shared public sandbox (`api.practicesoftwaretesting.com`). Doing so could alter catalog prices for other testers using the demo environment.

Instead, the gap was verified through two read-only sources:

1. **Live OpenAPI contract (`GET /docs`):**
   - `DELETE /products/{productId}` declares `"security": [{ "apiAuth": [] }]`, documents a `401` response, and states `"Admin role is required to delete a specific product"`.
   - `PUT /products/{productId}` (`updateProduct`) and `PATCH /products/{productId}` (`patchProduct`) declare no `security` scheme and list no `401` response.
2. **Upstream Laravel controller & request code:**
   - [`ProductController.php`](https://github.com/testsmith-io/practice-software-testing/blob/main/sprint5/API/app/Http/Controllers/ProductController.php) attaches `$this->middleware('role:admin', ['only' => ['destroy']])` — covering `DELETE`, but not `store`, `update`, or `patch`.
   - [`UpdateProduct.php`](https://github.com/testsmith-io/practice-software-testing/blob/main/sprint5/API/app/Http/Requests/Product/UpdateProduct.php) returns `true` unconditionally from `authorize()`.

## Upstream context

Practice Software Testing is an open-source training application whose README notes that testers can manipulate data in their own environment. A check of `testsmith-io/practice-software-testing` GitHub issues found no open or closed issue tracking authentication on `PUT /products/{productId}`.

In a real storefront, leaving catalog updates unauthenticated while locking `DELETE` behind `role:admin` would be a critical margin and integrity risk (anyone could edit product prices before checkout).

## Automated control

`TC-SEC-003` (`@known-spec-discrepancy`) fetches `GET /docs` non-destructively and runs an inverted assertion via `expectKnownDiscrepancy('FIND-01', ...)`: it stays green while `PUT /products/{productId}` lacks a `security` scheme and turns red if upstream adds authentication, signalling that the check can be promoted to the blocking regression suite.
