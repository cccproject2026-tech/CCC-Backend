# Director-facing API — cURL cheatsheet

Base URL defaults to **`http://localhost:3000/api/v1`** (see `main.ts` global prefix).  
Replace **`$BASE`**, **`$TOKEN`**, and Mongo **`ObjectId`** values for your environment.

```bash
export BASE=http://localhost:3000/api/v1
export TOKEN='<paste-accessToken-from-login>'
```

---

### 1) Login (get JWT)

```bash
curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"director@example.com","password":"your-password"}' | jq .
```

Copy **`data.accessToken`** into **`$TOKEN`**:

```bash
export TOKEN='eyJhbGciOi...'
```

---

### 2) Pastor journeys (director roster)

```bash
curl -s "$BASE/mentoring-sessions/director/journeys" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

### 3) Progress — director overview

```bash
curl -s "$BASE/progress/overview/director?period=yearly&year=2026&includeUsers=false" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Optional: **`includeUsers=true`** for per-user detail.

---

### 4) Progress — all roles summary

```bash
curl -s "$BASE/progress/overview/all?roles=pastor,mentor,field-mentor" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

### 5) Roadmap library (list)

```bash
curl -s "$BASE/roadmaps?status=all&search=" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

### 6) Merged mentor availability + Google busy (Director → Mentor slot picker)

Omit **`participantUserId`** if only the mentor’s calendar should constrain slots:

```bash
curl -s "$BASE/availability/$MENTOR_USER_ID?from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

With a **second** calendar merged (participant / pastor OAuth), for example:

```bash
curl -s "$BASE/availability/$MENTOR_USER_ID?participantUserId=$PASTOR_USER_ID&from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

*(Path is **`/availability/:userId`** — `AvailabilityGatewayController`, not under `/appointments`.)*

---

### 7) Book an appointment (after picking a slot)

```bash
curl -s -X POST "$BASE/appointments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'"$PASTOR_USER_ID"'",
    "mentorId": "'"$MENTOR_USER_ID"'",
    "meetingDate": "2026-06-15T14:30:00.000Z",
    "platform": "zoom",
    "googleCalendarNonMentorUserId": "'"$OPTIONAL_SECOND_CAL_USER_ID"'",
    "initiatorRole": "director"
  }' | jq .
```

Use **`googleCalendarNonMentorUserId`** only when the non-mentor party’s Google account should receive the second calendar event. Adjust **`meetingDate`** / **`initiatorRole`** per your flows.

---

### 8) List upcoming appointments (optional filters)

```bash
curl -s "$BASE/appointments/upcoming?userId=$USER_OID&mentorId=$USER_OID&futureOnly=true" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

### 9) Global search (optional `testRole` when guards are open)

```bash
curl -s "$BASE/search/global?q=test&testRole=director" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

### 10) Link Google Calendar — authorize URL (logged-in user)

```bash
curl -s "$BASE/auth/google" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Open **`data.url`** (or **`url`**) in a browser. After consent, Google hits **`/api/v1/auth/google/callback`**, then the API redirects to **`GOOGLE_OAUTH_SUCCESS_REDIRECT`** with **`?googleCalendar=linked`**.

---

### 11) Create a **new director** (Super Admin)

Provisioning uses **`POST /super-admin/directors`**. It creates an accepted “interest” row with title **Director**, creates the user with role **director**, then sets the password from the body.

**Password is required** (`min` 6 chars in DTO).  
Guards are commented out in code; add **`Authorization`** if you enable super-admin protection.

```bash
export BASE=http://localhost:3000/api/v1

curl -s -X POST "$BASE/super-admin/directors" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Sam",
    "lastName": "Director",
    "email": "sam.director@example.com",
    "password": "SecurePass1!"
  }' | jq .

# Optional profile picture URL (if your client supports it)
curl -s -X POST "$BASE/super-admin/directors" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jamie",
    "lastName": "Lee",
    "email": "jamie.lee@example.com",
    "password": "SecurePass1!",
    "profilePicture": "https://cdn.example.com/avatars/jl.png"
  }' | jq .
```

**List directors** (pagination + search):

```bash
curl -s "$BASE/super-admin/directors?page=1&limit=20&search=sam" | jq .
```

**Get one director:**

```bash
curl -s "$BASE/super-admin/directors/DIRECTOR_MONGO_ID" | jq .
```

**Update director:**

```bash
curl -s -X PATCH "$BASE/super-admin/directors/DIRECTOR_MONGO_ID" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Samuel","lastName":"Director"}' | jq .
```

**Delete director:**

```bash
curl -s -X DELETE "$BASE/super-admin/directors/DIRECTOR_MONGO_ID" | jq .
```

---

## Notes

- Many controllers have **role guards commented out** in this repo; production may require **`Authorization: Bearer $TOKEN`** on every call.
- **Super-admin** director CRUD is under **`POST|GET|PATCH|DELETE /super-admin/directors`** — admin surface, not the normal director app user.

For Google OAuth env vars, see **`docs/google-calendar-oauth.md`**.
