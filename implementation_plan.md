# API Authentication Architecture Refactor

Currently, the LiveTestWidget requires the raw API key to test specific Intent Profiles because the `/v1/check` endpoint solely relies on the `X-API-Key` header for authentication and configuration loading. Because raw keys are hashed and never stored, we can't populate a dropdown with them, leading to the clunky UX of forcing users to paste keys.

To make the architecture coherent, we will adapt the backend to support **Dual Authentication** for the `/v1/check` endpoint:
1. **External Flow**: Standard `X-API-Key` header (hashes and validates, used by external apps).
2. **Dashboard Flow**: `Authorization: Bearer <JWT>` + `X-Dashboard-Key-ID: <key_id>`. This allows the frontend to simply pass the database `key_id` from the dropdown, and the backend will securely verify that the key belongs to the logged-in user before processing the payload.

## User Review Required

> [!IMPORTANT]
> This change will permanently fix the telemetry syncing issue and allow us to revert the LiveTestWidget back to a clean dropdown selector using the API key names. No manual copy-pasting of raw keys will be needed for dashboard testing.

## Open Questions

None. The requirements are clear and align perfectly with security best practices for API/Dashboard separation.

## Proposed Changes

### Backend

#### [MODIFY] [middleware.py](backend/src/api/middleware.py)
- Create a new dependency `resolve_api_key(request, x_api_key, x_dashboard_key_id, authorization)`
- If `x_api_key` is present, use the existing hash-based validation.
- If `x_dashboard_key_id` is present, validate the JWT token from the `Authorization` header, look up the key by `ObjectId(x_dashboard_key_id)`, and ensure its `user_id` matches the authenticated user.
- Apply rate limiting appropriately to the resolved `key_doc`.

#### [MODIFY] [check.py](backend/src/api/routes/check.py)
- Update `/v1/check` and `/v1/check/batch` to use `Depends(resolve_api_key)` instead of `validate_api_key`.

### Frontend

#### [MODIFY] [api.js](frontend/src/utils/api.js)
- Update `api.check` to accept `keyId` instead of `apiKey`.
- If `keyId` is provided, send it in the `X-Dashboard-Key-ID` header instead of `X-API-Key`.

#### [MODIFY] [LiveTestWidget.jsx](frontend/src/components/LiveTestWidget.jsx)
- Revert the API KEY OVERRIDE text input back to a `<select>` dropdown.
- Populate the dropdown with the names of the user's API keys (fetched from `listKeys()`).
- When testing, pass the selected `key_id` to `api.check`.

## Verification Plan

### Automated Tests
- Run `pytest` if applicable, or manually trigger the LiveTestWidget to verify that the payload is scored correctly and appears in the LiveMonitor telemetry stream, perfectly mapped to the user.

### Manual Verification
- Verify the dropdown in the UI allows selecting keys by name.
- Ensure the selected key's specific `app_context` (Intent Profile) correctly influences the Context Policy ML layer.
