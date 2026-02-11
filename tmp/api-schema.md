# Team Collaboration API Schema

## Overview

REST API for team collaboration features including team management, member invitations, and role-based access control.

**Base URL:** `/api/v1`

**Authentication:** Bearer token required for all endpoints

---

## Data Models

### Team
```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "description": "string | null",
  "avatar_url": "string | null",
  "owner_id": "uuid",
  "settings": {
    "allow_member_invites": "boolean",
    "default_role": "member | viewer"
  },
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601"
}
```

### TeamMember
```json
{
  "id": "uuid",
  "team_id": "uuid",
  "user_id": "uuid",
  "role": "owner | admin | member | viewer",
  "joined_at": "ISO 8601",
  "invited_by": "uuid | null"
}
```

### Invitation
```json
{
  "id": "uuid",
  "team_id": "uuid",
  "email": "string",
  "role": "admin | member | viewer",
  "token": "string",
  "status": "pending | accepted | expired | revoked",
  "invited_by": "uuid",
  "expires_at": "ISO 8601",
  "created_at": "ISO 8601"
}
```

### Role Permissions
| Role | Manage Team | Manage Members | Invite | View | Delete Team |
|------|-------------|----------------|--------|------|-------------|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ | ✗ |
| member | ✗ | ✗ | ✓* | ✓ | ✗ |
| viewer | ✗ | ✗ | ✗ | ✓ | ✗ |

*If `allow_member_invites` is enabled

---

## Endpoints

### Teams

#### Create Team
```
POST /teams
```

**Request Body:**
```json
{
  "name": "Engineering Team",
  "slug": "engineering",
  "description": "Core engineering squad",
  "settings": {
    "allow_member_invites": true,
    "default_role": "member"
  }
}
```

**Response:** `201 Created`
```json
{
  "data": { /* Team object */ },
  "message": "Team created successfully"
}
```

#### List User's Teams
```
GET /teams
```

**Query Parameters:**
- `page` (int, default: 1)
- `limit` (int, default: 20, max: 100)
- `role` (string, optional) - Filter by user's role

**Response:** `200 OK`
```json
{
  "data": [ /* Team objects */ ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42
  }
}
```

#### Get Team
```
GET /teams/:team_id
```

**Response:** `200 OK`
```json
{
  "data": { /* Team object with member_count */ }
}
```

#### Update Team
```
PATCH /teams/:team_id
```

**Required Role:** `admin` or `owner`

**Request Body:** (all fields optional)
```json
{
  "name": "New Team Name",
  "description": "Updated description",
  "settings": {
    "allow_member_invites": false
  }
}
```

**Response:** `200 OK`

#### Delete Team
```
DELETE /teams/:team_id
```

**Required Role:** `owner`

**Response:** `204 No Content`

---

### Team Members

#### List Members
```
GET /teams/:team_id/members
```

**Query Parameters:**
- `page` (int)
- `limit` (int)
- `role` (string, optional) - Filter by role

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "user": {
        "id": "uuid",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "avatar_url": "https://..."
      },
      "role": "admin",
      "joined_at": "2026-02-01T10:00:00Z"
    }
  ],
  "meta": { /* pagination */ }
}
```

#### Get Member
```
GET /teams/:team_id/members/:user_id
```

**Response:** `200 OK`

#### Update Member Role
```
PATCH /teams/:team_id/members/:user_id
```

**Required Role:** `admin` or `owner`

**Request Body:**
```json
{
  "role": "admin"
}
```

**Constraints:**
- Cannot change owner's role (must transfer ownership)
- Admin cannot promote to owner
- Admin cannot demote other admins

**Response:** `200 OK`

#### Remove Member
```
DELETE /teams/:team_id/members/:user_id
```

**Required Role:** `admin` or `owner` (or self-removal)

**Constraints:**
- Owner cannot be removed (must transfer ownership first)
- Admin cannot remove other admins

**Response:** `204 No Content`

#### Transfer Ownership
```
POST /teams/:team_id/transfer-ownership
```

**Required Role:** `owner`

**Request Body:**
```json
{
  "new_owner_id": "uuid"
}
```

**Response:** `200 OK`

---

### Invitations

#### Create Invitation
```
POST /teams/:team_id/invitations
```

**Required Role:** `admin`, `owner`, or `member` (if allowed)

**Request Body:**
```json
{
  "email": "newmember@example.com",
  "role": "member",
  "message": "Join our team!"
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": "uuid",
    "email": "newmember@example.com",
    "role": "member",
    "invite_link": "https://app.example.com/invite/abc123",
    "expires_at": "2026-02-18T11:24:00Z"
  }
}
```

#### Bulk Invite
```
POST /teams/:team_id/invitations/bulk
```

**Request Body:**
```json
{
  "invitations": [
    { "email": "user1@example.com", "role": "member" },
    { "email": "user2@example.com", "role": "admin" }
  ]
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "sent": 2,
    "failed": 0,
    "invitations": [ /* Invitation objects */ ]
  }
}
```

#### List Invitations
```
GET /teams/:team_id/invitations
```

**Query Parameters:**
- `status` (string, optional): `pending | accepted | expired | revoked`

**Response:** `200 OK`

#### Resend Invitation
```
POST /teams/:team_id/invitations/:invitation_id/resend
```

**Response:** `200 OK`

#### Revoke Invitation
```
DELETE /teams/:team_id/invitations/:invitation_id
```

**Response:** `204 No Content`

#### Accept Invitation (Public)
```
POST /invitations/:token/accept
```

**Authentication:** Optional (creates account if not logged in)

**Response:** `200 OK`
```json
{
  "data": {
    "team": { /* Team object */ },
    "membership": { /* TeamMember object */ }
  }
}
```

#### Get Invitation Details (Public)
```
GET /invitations/:token
```

**Response:** `200 OK`
```json
{
  "data": {
    "team_name": "Engineering Team",
    "team_avatar_url": "https://...",
    "invited_by": "Jane Doe",
    "role": "member",
    "expires_at": "2026-02-18T11:24:00Z"
  }
}
```

---

## Error Responses

All errors follow this format:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action",
    "details": { /* optional additional info */ }
  }
}
```

### Common Error Codes
| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | VALIDATION_ERROR | Invalid request body |
| 401 | UNAUTHORIZED | Missing or invalid auth token |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Resource already exists (e.g., duplicate invite) |
| 410 | GONE | Invitation expired |
| 422 | UNPROCESSABLE | Business logic error |
| 429 | RATE_LIMITED | Too many requests |

---

## Rate Limits

| Endpoint Pattern | Limit |
|-----------------|-------|
| `POST /teams/:id/invitations` | 50/hour |
| `POST /teams/:id/invitations/bulk` | 10/hour |
| All other endpoints | 1000/hour |

---

## Webhooks (Optional)

Events emitted for integrations:
- `team.created`
- `team.updated`
- `team.deleted`
- `member.joined`
- `member.left`
- `member.role_changed`
- `invitation.sent`
- `invitation.accepted`
- `invitation.revoked`
