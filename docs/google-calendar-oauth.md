# Google Calendar OAuth (CCC backend)

Canonical routes (global prefix **`/api/v1`**):

| Step | Route | Notes |
|------|--------|--------|
| Start | **`GET /api/v1/auth/google`** | **`Authorization: Bearer <accessJwt>` required.** Optional query `userId=` must equal JWT `sub` if sent. Response: `{ success, message, data: { url } }`. |
| Callback | **`GET /api/v1/auth/google/callback`** | Registered in GCP as **`GOOGLE_REDIRECT_URI`** (must match protocol, host, path, trailing slash). |

### Environment variables

| Variable | Required | Description |
|---------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 Web client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | Exact callback URL, e.g. `https://api.example.com/api/v1/auth/google/callback` |
| `GOOGLE_OAUTH_SUCCESS_REDIRECT` | Strongly recommended | SPA URL after success; query `googleCalendar=linked` is appended. Fallback: `FRONTEND_SUCCESS_REDIRECT`. |
| `FRONTEND_SUCCESS_REDIRECT` | Optional | Used if `GOOGLE_OAUTH_SUCCESS_REDIRECT` is unset |
| `JWT_SECRET` | Yes | Signs short-lived **`state`** (10m) embedded in authorize URL |

On error, redirects use `?googleCalendar=error&reason=...`.

### Google Cloud Console checklist

1. OAuth client **Web application** → **Authorized redirect URIs** = **`GOOGLE_REDIRECT_URI`** (character-for-character).
2. OAuth consent screen: **Testing** requires every Google account under Test users (or Publish app).
3. Enable **Google Calendar API** on the GCP project.

### Tokens

Authorize URL uses **`access_type=offline`**, **`prompt=consent`**, and scopes **`calendar.events`** + **`calendar.readonly`**.  
Calendar API calls refresh access tokens automatically in `GoogleCalendarService.getCalendarContext` when near expiry.

### Migration note

`state` is no longer raw `userId`. Old bookmarked authorize URLs stop working — users must use **`GET /auth/google`** again so the backend issues a signed `state`.

**`GET /auth/google` now requires a Bearer CCC login JWT** so the linker cannot spoof another pastor’s Mongo id via `userId=` alone (optional query `userId` must still match JWT `sub` when present).

Existing users granted the broader **`calendar`** scope may see a new consent prompt when approving **`calendar.events`** + **`calendar.readonly`.
