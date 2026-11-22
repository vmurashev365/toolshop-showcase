# FIND-01 · Missing auth contract on `PUT` / `PATCH /products/{productId}`

**Environment:** `https://api.practicesoftwaretesting.com/docs` (OpenAPI spec) and upstream Sprint 5 source (`testsmith-io/practice-software-testing`), audited 2026-11-20.  
**Evidence:** [OpenAPI excerpt (JSON)](../evidence/find-01-openapi-products.json) · [Automated check (`TC-SEC-003`)](../../tests/pw/api/security-rbac.spec.ts#L51-L66)  
**Severity:** Critical ([scale](../01-test-strategy.md#6-severity-scale)), based on the API contract and source review. The suite never sends a `PUT`.  
**Business impact:** Anyone could change catalog prices or product data without signing in, for example set a price to `$0.01` before checking out.

## Reproduce (read-only)

```sh
API=http://localhost:8091   # isolated stack; public sandbox: https://api.practicesoftwaretesting.com
curl -s "$API/docs" | jq '.paths["/products/{productId}"] | {put: .put.security, delete: .delete.security}'
# Observed: {"put": null, "delete": [{"apiAuth": []}]}
```

## What was actually checked (non-destructive)

The automated watch sends a read-only `GET /docs` request. The showcase records two sources of historical evidence.

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

`TC-SEC-003` (`@known-spec-discrepancy`) fetches `GET /docs` non-destructively and runs an inverted assertion via `expectKnownDiscrepancy('FIND-01', ...)`: it stays green when the PUT operation has no `security` field and turns red for a truthy declaration, signalling that the contract check can be promoted. The automated watch only reads the PUT operation in OpenAPI. The separate source review above documents the historical controller and request behavior.
