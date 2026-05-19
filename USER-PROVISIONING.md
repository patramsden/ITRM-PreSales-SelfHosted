# ITRM PreSales — User Provisioning via API

This document describes how to create, update and manage users programmatically using the REST API. This is useful for:

- Bulk importing users from Active Directory / HR systems
- Automated onboarding / offboarding scripts
- CI/CD pipelines that need a service account

---

## Authentication

All write operations require admin-level authentication. There are two ways to authenticate:

### Option A — Service API Key (recommended for scripts)

A long-lived service key that does not expire and does not require a human login session.

1. Sign in to the app as an administrator
2. Go to **Settings → API Access**
3. Click **Generate key** — copy the key immediately (it is only shown once)
4. Store the key securely (password manager, Azure Key Vault, etc.)

Use it in every request:

```http
Authorization: Bearer <your-service-api-key>
```

> **Security:** The key grants full admin access. Rotate it if it is ever exposed.  
> To revoke it: Settings → API Access → Revoke, or `DELETE /api/settings/service-key`.

---

### Option B — Session Token (interactive / short-lived)

Obtain an 8-hour session token by logging in:

```bash
curl -X POST https://your-app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourcompany.com","password":"your-password"}'
```

Response:

```json
{
  "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "user": { "id": "...", "name": "Admin", "appRole": "admin" }
}
```

Use the returned `token` as your Bearer token. Tokens expire after **8 hours**.

> **Note:** If the account has TOTP enabled, the login response will contain  
> `{ "requireTotp": true, "challengeToken": "..." }` instead. Complete the TOTP  
> step at `POST /api/auth/totp/login` before making other requests.

---

## Base URL

| Environment | URL |
|-------------|-----|
| Production  | `https://<your-app>.azurestaticapps.net/api` |
| Local dev   | `http://localhost:7071/api` |

---

## Endpoints

### Create a user

```
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | ✅ | Unique identifier — generate with `uuidgen` or equivalent |
| `name` | string | ✅ | Full display name |
| `email` | string | ✅ | Email address (must be unique) |
| `appRole` | `"user"` \| `"admin"` | ✅ | Application role |
| `authProvider` | `"local"` \| `"saml"` | ✅ | Authentication method |
| `password` | string | ⚠️ | Required for `authProvider: "local"`. Must satisfy the password policy. |
| `department` | string | — | Optional department name |
| `jobTitle` | string | — | Optional job title |

**Example — create a local user:**

```bash
curl -X POST https://your-app/api/users \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Jane Smith",
    "email": "jane.smith@yourcompany.com",
    "appRole": "user",
    "authProvider": "local",
    "password": "SecureP@ssw0rd!",
    "department": "PreSales",
    "jobTitle": "Solutions Architect"
  }'
```

**Example — create an SSO (SAML) user:**

```bash
curl -X POST https://your-app/api/users \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "name": "Tom Jones",
    "email": "tom.jones@yourcompany.com",
    "appRole": "user",
    "authProvider": "saml",
    "department": "Sales"
  }'
```

SSO users authenticate via your Identity Provider — no password is set in the app.

**Response (201 Created):**

```json
{
  "id": "a1b2c3d4-...",
  "name": "Jane Smith",
  "email": "jane.smith@yourcompany.com",
  "appRole": "user",
  "authProvider": "local",
  "department": "PreSales",
  "jobTitle": "Solutions Architect"
}
```

---

### List all users

```
GET /api/users
Authorization: Bearer <token>
```

Returns an array of all users. The `totpEnabled` boolean indicates whether the user has enrolled two-factor authentication.

---

### Get a single user

```
GET /api/users/{id}
Authorization: Bearer <token>
```

---

### Update a user

```
PUT /api/users/{id}
Authorization: Bearer <token>
Content-Type: application/json
```

Accepts the same fields as create. To change a local user's password, include `"newPassword": "..."`.

---

### Delete a user

```
DELETE /api/users/{id}
Authorization: Bearer <token>
```

Returns `204 No Content`. Proposals authored by the user are retained.

---

### Generate a password reset link (admin)

```
POST /api/users/{id}/password-reset
Authorization: Bearer <token>
```

Returns a one-time reset URL valid for 24 hours:

```json
{ "resetUrl": "https://your-app/reset-password?token=..." }
```

---

### Clear a user's TOTP (admin)

```
DELETE /api/users/{id}/totp
Authorization: Bearer <token>
```

Removes the user's TOTP secret. Their next login will require password only.

---

### Set a user's password directly (admin)

```
POST /api/users/{id}/set-password
Authorization: Bearer <token>
Content-Type: application/json

{ "password": "NewSecureP@ssword1" }
```

The password must satisfy the configured password policy. Returns `204 No Content`.

---

## Bulk provisioning

The API does not have a dedicated bulk endpoint. Use a loop in your scripting language of choice.

### PowerShell example

```powershell
$apiBase = "https://your-app.azurestaticapps.net/api"
$token   = "YOUR_SERVICE_API_KEY"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

# Load users from CSV: name,email,department,jobTitle
$users = Import-Csv "users.csv"

foreach ($u in $users) {
    $body = @{
        id           = [guid]::NewGuid().ToString()
        name         = $u.name
        email        = $u.email
        appRole      = "user"
        authProvider = "local"
        password     = "Welcome2024!"   # Force reset on first login via admin
        department   = $u.department
        jobTitle     = $u.jobTitle
    } | ConvertTo-Json

    $resp = Invoke-RestMethod -Uri "$apiBase/users" -Method Post `
                              -Headers $headers -Body $body
    Write-Host "Created: $($resp.name) <$($resp.email)>"
}
```

### Bash / curl example

```bash
#!/usr/bin/env bash
API="https://your-app.azurestaticapps.net/api"
TOKEN="YOUR_SERVICE_API_KEY"

while IFS=, read -r name email department; do
  ID=$(uuidgen)
  curl -s -X POST "$API/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": \"$ID\",
      \"name\": \"$name\",
      \"email\": \"$email\",
      \"appRole\": \"user\",
      \"authProvider\": \"local\",
      \"password\": \"Welcome2024!\",
      \"department\": \"$department\"
    }" | jq '{name: .name, email: .email}'
done < users.csv
```

### Python example

```python
import csv, uuid, requests

API   = "https://your-app.azurestaticapps.net/api"
TOKEN = "YOUR_SERVICE_API_KEY"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

with open("users.csv") as f:
    for row in csv.DictReader(f):
        payload = {
            "id":           str(uuid.uuid4()),
            "name":         row["name"],
            "email":        row["email"],
            "appRole":      row.get("role", "user"),
            "authProvider": "local",
            "password":     "Welcome2024!",
            "department":   row.get("department", ""),
            "jobTitle":     row.get("jobTitle", ""),
        }
        r = requests.post(f"{API}/users", json=payload, headers=HEADERS)
        r.raise_for_status()
        print(f"Created: {r.json()['name']} <{r.json()['email']}>")
```

---

## Password policy

Passwords must satisfy the policy configured in **Settings → Security**. The defaults are:

| Rule | Default |
|------|---------|
| Minimum length | 8 characters |
| Uppercase letter | Not required |
| Lowercase letter | Not required |
| Number | Not required |
| Special character | Not required |

If the password does not meet the policy, the API returns:

```json
{
  "error": "Password does not meet policy",
  "details": ["At least 8 characters", "At least one number (0–9)"]
}
```

---

## Service key management

| Action | Endpoint |
|--------|----------|
| Generate / regenerate key | `POST /api/settings/service-key` |
| Revoke key | `DELETE /api/settings/service-key` |
| Check if configured | `GET /api/settings/service-key/status` |

All three require admin authentication. The key is only returned in the `POST` response body — it cannot be retrieved afterwards.

---

## Initial setup (seed)

When deploying for the first time with an empty database, the seed endpoint creates the schema and a default admin account:

```bash
curl -X POST https://your-app/api/seed \
  -H "x-seed-secret: YOUR_SEED_SECRET"
```

`SEED_SECRET` is an environment variable / App Setting you set before deployment. The default admin credentials are printed in the seed response.

After seeding, log in as the default admin, change the password, and then generate a service API key for your provisioning scripts.

---

## Error responses

| HTTP | Meaning |
|------|---------|
| `400 Bad Request` | Missing required field or password policy violation — `details` array included |
| `401 Unauthorized` | Missing or invalid Bearer token |
| `403 Forbidden` | Token is valid but the account is not an administrator |
| `404 Not Found` | User ID does not exist |
| `409 Conflict` | Email address already in use |
