# iOS Run Rename Persistence Fix

## Problem
When a user renames a run in the iOS app, the change appears to save but reverts when the app is closed and reopened. The rename is only being updated in local state, not persisted to the server.

## Root Cause
The iOS app's rename UI is updating the local run object in memory but **not calling the server API** to persist the change. When the app refetches the run on reopen, it gets the original name from the server database.

## Solution
Implement a server call in the rename flow:

### Endpoint
**`PATCH /api/runs/{runId}/rename`**

### Request
```json
{
  "name": "New Run Name"
}
```
- `name` can be a non-empty string or `null` (to clear the name and use the default)

### Response
Returns the updated `Run` object with the new name field populated.

### Implementation Checklist
- [ ] Find the UI where users rename runs (likely a text field / edit dialog)
- [ ] Find the ViewModel/Controller that handles the rename action
- [ ] Add an API call to `PATCH /api/runs/{runId}/rename` with the new name
- [ ] Update the local run object with the response from the server
- [ ] Add error handling and logging (prefix with ✅/❌ for clarity)
- [ ] Test: Rename a run → Close and reopen app → Verify the new name persists

## Reference
The Android implementation (just completed):
- API call: `apiService.renameRun(runId, RenameRunRequest(name = newName))`
- ViewModel function calls the API and updates `_runSession` with the response
- Dialog `onSave` callback invokes the ViewModel function
- Logs success/failure with console output

## Server Details
- Route: `app.patch("/api/runs/:id/rename", authMiddleware, ...)`
- Auth: Uses standard auth middleware — user must own the run
- No changes needed on the server side — endpoint is ready
