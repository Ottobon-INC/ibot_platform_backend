# Ottobon IBOT Platform - Database Design

**Document:** `DATABASE_DESIGN.md`  
**Version:** 1.0  
**Status:** Database Architecture Baseline  
**Database:** PostgreSQL  
**Audience:** Engineers, database architects, LLMs, coding agents  
**Logical table prefix:** `IBOT_`  
**Total logical tables:** **126**

> This document is the database contract for the current Ottobon IBOT platform scope. Do not add, merge, rename, or repurpose tables casually. If a future feature genuinely requires a new table, record the reason in an Architecture Decision Record (ADR) and update this document.

---

## 1. Non-negotiable database principles

1. **PostgreSQL is the transactional source of truth.** Redis is cache/queue infrastructure only.
2. **One canonical Person identity.** Candidate, learner, student, employee and intern are contextual labels, not separate identity tables.
3. **Project and Project Run are separate.** `IBOT_project` is the long-lived initiative; `IBOT_project_run` is one execution.
4. **Never overwrite an old Run to create a new Run.** Example: the same Project can have `Hiring Python Full Stack 2026` with target 50 and `Hiring Python Full Stack 2027` with target 5. Both remain queryable forever according to retention policy.
5. **There is no authoritative `current_phase` column.** Each enabled phase is represented by `IBOT_run_phase`; multiple phases can be active at the same time.
6. **Entry is pre-IBOT.** Application/enrollment/import/invitation lives in `IBOT_entry_request` and must work even when Identify is disabled.
7. **Phase movement is explicit.** A participant never moves automatically between I/B/O/T; use `IBOT_handover` + `IBOT_handover_participant`.
8. **Core searchable/filterable business facts are relational.** JSONB is not a shortcut for relationships, status, money, dates, identity, ownership, roles, or fields frequently used in WHERE/JOIN/ORDER BY.
9. **JSONB is allowed for genuinely variable configuration, snapshots, provider payloads, rubrics, dynamic form answers and low-query metadata.** Promote any repeatedly queried JSON key to a typed column/read model.
10. **Published/approved versions are immutable.** Curriculum, Run setup, blueprint and commercial changes create new version rows.
11. **Mutable operational rows use optimistic concurrency (`row_version`).** Sensitive transitions also produce append-only `IBOT_audit_event` rows.
12. **Tenant isolation is server-side and database-query enforced.** High-volume tenant-owned tables carry `organization_id` directly even when derivable through parent relations.
13. **No unbounded list query.** Use keyset/cursor pagination for large tables.
14. **Files live in object storage.** PostgreSQL stores metadata and secure references only.
15. **Heavy work is asynchronous.** Imports, exports, large reports, notification fan-out, reconciliation, settlement and synchronization use jobs/workers.
16. **Read models are rebuildable.** `IBOT_learner_catalog_entry` and other `IBOT_*_metrics_*` tables are performance projections, never the authoritative business record.
17. **Do not create duplicate editable truth across IBOT and Course Platform / Experts Hub / TalentOps.** External authoritative objects are referenced through `IBOT_external_entity_link` and source fields.
18. **10,000 concurrent users is a design target, not a schema-only guarantee.** PgBouncer/connection pooling, query plans, Redis, workers, infrastructure, observability and load tests remain mandatory.

---

## 2. Naming and physical PostgreSQL convention

The canonical documentation name is uppercase-prefixed, for example `IBOT_project_run`.

PostgreSQL folds unquoted identifiers to lowercase, therefore migrations SHOULD create unquoted identifiers such as:

```sql
CREATE TABLE IBOT_project_run (...);
```

PostgreSQL will physically expose that as `ibot_project_run`. **Do not quote identifiers merely to preserve uppercase.** Coding agents should treat `IBOT_project_run` and physical `ibot_project_run` as the same canonical table.

Rules:

- Singular table names.
- Primary key column is normally `id` (`uuid`).
- UUIDv7 is preferred for new distributed identifiers because it has time locality without exposing sequential business IDs.
- High-volume append-only audit/event tables may use `bigint identity` as the physical clustering/partitioning key plus a UUID event identifier.
- Timestamps are `timestamptz` and stored in UTC.
- Currency codes are ISO-4217 `char(3)`.
- Monetary values are `numeric(20,4)`; never `float`/`double`.
- Boolean flags use `is_`, `has_`, `can_` prefixes.
- Foreign keys end with `_id`.
- Status columns use controlled application enums/check constraints, not free text.

---

## 3. Standard metadata patterns

### Mutable business row

Use where the entity can legitimately change:

```text
created_at
created_by_person_id
updated_at
updated_by_person_id
row_version
```

`row_version` increments on every accepted write and is used for optimistic concurrency (`UPDATE ... WHERE id = ? AND row_version = ?`).

### Immutable/version/event row

Use:

```text
created_at
created_by_person_id (when human-created)
```

Do not add `updated_at` to immutable final rows unless the lifecycle truly requires mutable draft state before finalization.

### Deletion

Do not add `deleted_at` to every table mechanically. Prefer business state (`ARCHIVED`, `CLOSED`, `REVOKED`, `ANONYMIZED`) where history matters. Physical deletion is reserved for retention/privacy workflows and ephemeral technical data.

---

## 4. Table count by domain

| Domain | Tables |
|---|---:|
| Identity and Access Management | 20 |
| Core Product Domain | 27 |
| Identify | 3 |
| Build / Curriculum | 18 |
| Operate | 11 |
| Transfer | 5 |
| Commercial / Finance | 15 |
| Platform / Infrastructure | 20 |
| Read Models | 7 |
| **TOTAL** | **126** |

> Earlier drafts counted 124 tables. During column-level review, two required authentication tables were added: `IBOT_auth_factor` (MFA/passkeys) and `IBOT_auth_token` (email verification/password reset). Keeping the old number would leave already-agreed authentication flows under-modeled, so this document intentionally corrects the total to **126**.

---

## 5. Entity hierarchy that the schema must preserve

```text
IBOT_workspace
   |
   +-- IBOT_organization
          |
          +-- IBOT_project                 long-lived initiative
                 |
                 +-- IBOT_project_run      one execution/year/cycle
                        |
                        +-- IBOT_run_phase  enabled Identify/Build/Operate/Transfer
                        |
                        +-- IBOT_run_participation
                               |
                               +-- IBOT_phase_participation

IBOT_project
   +-- IBOT_curriculum
          +-- IBOT_curriculum_version
                 +-- IBOT_curriculum_module
                        +-- IBOT_curriculum_item

IBOT_project_run -> BUILD phase -> IBOT_cohort
```

Example:

```text
IBOT_project.canonical_name = Hiring Python Full Stack

IBOT_project_run #1
  display_name = Hiring Python Full Stack 2026
  target_participant_count = 50
  status = COMPLETED

IBOT_project_run #2
  display_name = Hiring Python Full Stack 2027
  target_participant_count = 5
  status = ACTIVE
```

The 2027 Run must never overwrite the 2026 Run.

---

## 6. Complete table dictionary


# 1. Identity and Access Management

## 1. `IBOT_person`

**Purpose:** Canonical human identity shared across all workspaces and project runs.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES | PK; UUIDv7 preferred |
| `display_name` | `varchar(200)` | YES |  |
| `status` | `varchar(30)` | YES | ACTIVE, SUSPENDED, MERGED, ANONYMIZED |
| `merged_into_person_id` | `uuid` | NO | FK -> IBOT_person.id |
| `last_activity_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES | Optimistic concurrency |

## 2. `IBOT_person_profile`

**Purpose:** One structured profile per person.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES | FK -> IBOT_person.id; UNIQUE |
| `first_name` | `varchar(120)` | YES |  |
| `middle_name` | `varchar(120)` | NO |  |
| `last_name` | `varchar(120)` | NO |  |
| `preferred_name` | `varchar(120)` | NO |  |
| `headline` | `varchar(240)` | NO |  |
| `summary` | `text` | NO |  |
| `date_of_birth` | `date` | NO | Collect only when required |
| `city` | `varchar(120)` | NO |  |
| `state_region` | `varchar(120)` | NO |  |
| `country_code` | `char(2)` | NO |  |
| `avatar_file_id` | `uuid` | NO | FK -> IBOT_file.id; add FK after file table migration |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 3. `IBOT_person_contact`

**Purpose:** Email, phone, and other structured contact points.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES | FK -> IBOT_person.id |
| `contact_type` | `varchar(30)` | YES | EMAIL, PHONE, WHATSAPP, OTHER |
| `contact_value` | `varchar(320)` | YES |  |
| `normalized_value` | `varchar(320)` | YES |  |
| `is_primary` | `boolean` | YES | Default false |
| `is_verified` | `boolean` | YES | Default false |
| `verified_at` | `timestamptz` | NO |  |
| `visibility` | `varchar(30)` | YES | PRIVATE, WORKSPACE, AUTHORIZED |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 4. `IBOT_person_education`

**Purpose:** Structured education history used for filtering and evidence.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `institution_name` | `varchar(240)` | YES |  |
| `qualification_name` | `varchar(200)` | NO |  |
| `field_of_study` | `varchar(200)` | NO |  |
| `start_date` | `date` | NO |  |
| `end_date` | `date` | NO |  |
| `graduation_year` | `smallint` | NO |  |
| `grade_text` | `varchar(80)` | NO |  |
| `is_current` | `boolean` | YES | Default false |
| `metadata_json` | `jsonb` | NO | Only optional non-core attributes |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 5. `IBOT_person_experience`

**Purpose:** Structured work/internship experience history.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `organization_name` | `varchar(240)` | YES |  |
| `role_title` | `varchar(200)` | YES |  |
| `employment_type` | `varchar(50)` | NO |  |
| `location_text` | `varchar(200)` | NO |  |
| `start_date` | `date` | NO |  |
| `end_date` | `date` | NO |  |
| `is_current` | `boolean` | YES | Default false |
| `description` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 6. `IBOT_person_skill`

**Purpose:** Queryable person-to-skill relationship; do not hide core skills in JSON.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `skill_id` | `uuid` | YES | FK -> IBOT_skill_catalog.id |
| `proficiency_level` | `varchar(40)` | NO |  |
| `years_experience` | `numeric(5,2)` | NO |  |
| `last_used_year` | `smallint` | NO |  |
| `verification_status` | `varchar(30)` | YES | UNVERIFIED, VERIFIED, DISPUTED |
| `source_type` | `varchar(40)` | NO |  |
| `source_reference` | `varchar(240)` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 7. `IBOT_auth_identity`

**Purpose:** Authentication identity linked to a person; supports local and external providers.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `provider_type` | `varchar(30)` | YES | LOCAL, OIDC, SAML, OTHER |
| `provider_name` | `varchar(80)` | YES |  |
| `provider_subject` | `varchar(320)` | NO |  |
| `login_identifier_normalized` | `varchar(320)` | NO |  |
| `password_hash` | `text` | NO | LOCAL only; never plaintext |
| `status` | `varchar(30)` | YES |  |
| `email_verified_at` | `timestamptz` | NO |  |
| `failed_login_count` | `integer` | YES | Default 0 |
| `locked_until` | `timestamptz` | NO |  |
| `last_login_at` | `timestamptz` | NO |  |
| `disabled_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 8. `IBOT_auth_factor`

**Purpose:** MFA/passkey factor registered against an authentication identity.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `auth_identity_id` | `uuid` | YES | FK -> IBOT_auth_identity.id |
| `person_id` | `uuid` | YES | Denormalized FK -> IBOT_person.id |
| `factor_type` | `varchar(30)` | YES | TOTP, WEBAUTHN, OTHER |
| `label` | `varchar(120)` | NO |  |
| `status` | `varchar(30)` | YES | PENDING, ACTIVE, REVOKED |
| `credential_id` | `varchar(512)` | NO | WebAuthn/passkey identifier |
| `public_factor_data_json` | `jsonb` | NO | Non-secret factor/provider data |
| `encrypted_secret` | `bytea` | NO | TOTP secret encrypted using envelope encryption/KMS |
| `verified_at` | `timestamptz` | NO |  |
| `last_used_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 9. `IBOT_auth_token`

**Purpose:** Hashed one-time tokens for email verification/password reset; never stores raw token.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `auth_identity_id` | `uuid` | NO |  |
| `person_id` | `uuid` | YES |  |
| `token_type` | `varchar(40)` | YES | EMAIL_VERIFY, PASSWORD_RESET, MAGIC_LINK |
| `token_hash` | `varchar(256)` | YES | UNIQUE |
| `destination_normalized` | `varchar(320)` | NO |  |
| `expires_at` | `timestamptz` | YES |  |
| `consumed_at` | `timestamptz` | NO |  |
| `invalidated_at` | `timestamptz` | NO |  |
| `attempt_count` | `integer` | YES | Default 0 |
| `metadata_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 10. `IBOT_auth_session`

**Purpose:** Revocable server-side session/refresh-token record.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `auth_identity_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `device_registration_id` | `uuid` | NO |  |
| `session_token_hash` | `varchar(256)` | NO |  |
| `refresh_token_hash` | `varchar(256)` | NO |  |
| `ip_address` | `inet` | NO |  |
| `user_agent` | `text` | NO |  |
| `issued_at` | `timestamptz` | YES |  |
| `expires_at` | `timestamptz` | YES |  |
| `last_seen_at` | `timestamptz` | NO |  |
| `revoked_at` | `timestamptz` | NO |  |
| `revoke_reason` | `varchar(240)` | NO |  |

## 11. `IBOT_device_registration`

**Purpose:** Web/PWA/Android/iOS installation and push registration.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `client_type` | `varchar(20)` | YES | WEB, PWA, ANDROID, IOS |
| `installation_id` | `varchar(200)` | YES |  |
| `device_name` | `varchar(160)` | NO |  |
| `platform_version` | `varchar(80)` | NO |  |
| `app_version` | `varchar(80)` | NO |  |
| `push_provider` | `varchar(40)` | NO |  |
| `push_token` | `text` | NO |  |
| `push_enabled` | `boolean` | YES | Default true |
| `last_seen_at` | `timestamptz` | NO |  |
| `revoked_at` | `timestamptz` | NO |  |
| `metadata_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 12. `IBOT_workspace`

**Purpose:** Login/security workspace for Ottobon, an organization, or an individual.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `workspace_type` | `varchar(30)` | YES | OTTOBON, ORGANIZATION, INDIVIDUAL |
| `display_name` | `varchar(200)` | YES |  |
| `owner_person_id` | `uuid` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 13. `IBOT_workspace_membership`

**Purpose:** Person membership in one workspace.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `workspace_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `joined_at` | `timestamptz` | NO |  |
| `suspended_at` | `timestamptz` | NO |  |
| `ended_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 14. `IBOT_workspace_invitation`

**Purpose:** Auditable invitation into a workspace.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `workspace_id` | `uuid` | YES |  |
| `invitee_identifier` | `varchar(320)` | YES |  |
| `invitee_identifier_normalized` | `varchar(320)` | YES |  |
| `invited_person_id` | `uuid` | NO |  |
| `token_hash` | `varchar(256)` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `expires_at` | `timestamptz` | YES |  |
| `accepted_at` | `timestamptz` | NO |  |
| `revoked_at` | `timestamptz` | NO |  |
| `invitation_context_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 15. `IBOT_role`

**Purpose:** System or tenant-defined role; scope determines where it can be assigned.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `workspace_id` | `uuid` | NO | NULL for global/system role |
| `role_code` | `varchar(100)` | YES |  |
| `role_name` | `varchar(160)` | YES |  |
| `scope_type` | `varchar(30)` | YES | PLATFORM, WORKSPACE, PROJECT, RUN, PHASE |
| `description` | `text` | NO |  |
| `is_system_role` | `boolean` | YES | Default false |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 16. `IBOT_permission`

**Purpose:** Atomic resource/action permission.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `permission_code` | `varchar(140)` | YES | UNIQUE |
| `resource_type` | `varchar(100)` | YES |  |
| `action` | `varchar(80)` | YES |  |
| `description` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 17. `IBOT_role_permission`

**Purpose:** Many-to-many role to permission mapping.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `role_id` | `uuid` | YES |  |
| `permission_id` | `uuid` | YES |  |
| `effect` | `varchar(10)` | YES | ALLOW or DENY |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 18. `IBOT_workspace_membership_role`

**Purpose:** Role assignment at workspace scope.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `workspace_membership_id` | `uuid` | YES |  |
| `role_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `assigned_at` | `timestamptz` | YES |  |

## 19. `IBOT_person_merge_case`

**Purpose:** Controlled canonical-person merge review.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `source_person_id` | `uuid` | YES |  |
| `target_person_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `reason` | `text` | YES |  |
| `evidence_json` | `jsonb` | NO |  |
| `requested_by_person_id` | `uuid` | YES |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `merged_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 20. `IBOT_person_policy_acceptance`

**Purpose:** Immutable evidence that a person accepted a specific policy version.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `policy_document_id` | `uuid` | YES | FK -> IBOT_policy_document.id |
| `workspace_id` | `uuid` | NO |  |
| `acceptance_type` | `varchar(50)` | YES |  |
| `accepted_at` | `timestamptz` | YES |  |
| `ip_address` | `inet` | NO |  |
| `user_agent` | `text` | NO |  |
| `evidence_json` | `jsonb` | NO |  |


# 2. Core Product Domain

## 21. `IBOT_organization`

**Purpose:** Enterprise or Academy tenant attached to one organization workspace.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `workspace_id` | `uuid` | YES | FK -> IBOT_workspace.id; UNIQUE |
| `organization_type` | `varchar(30)` | YES | ENTERPRISE, ACADEMY |
| `organization_code` | `varchar(80)` | YES | Stable internal code |
| `legal_name` | `varchar(240)` | NO |  |
| `display_name` | `varchar(240)` | YES |  |
| `slug` | `varchar(160)` | YES | Public-friendly unique slug |
| `status` | `varchar(30)` | YES | PENDING_REVIEW, ACTIVE, SUSPENDED, CLOSED |
| `country_code` | `char(2)` | NO |  |
| `timezone` | `varchar(80)` | YES |  |
| `default_currency` | `char(3)` | NO |  |
| `data_region` | `varchar(80)` | NO |  |
| `approved_at` | `timestamptz` | NO |  |
| `approved_by_person_id` | `uuid` | NO |  |
| `suspended_at` | `timestamptz` | NO |  |
| `suspended_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 22. `IBOT_organization_setting`

**Purpose:** One configuration row per organization.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES | UNIQUE |
| `email_enabled` | `boolean` | YES |  |
| `whatsapp_enabled` | `boolean` | YES |  |
| `web_push_enabled` | `boolean` | YES |  |
| `mobile_push_enabled` | `boolean` | YES |  |
| `default_locale` | `varchar(20)` | YES |  |
| `branding_json` | `jsonb` | NO | Logo/colors only; not business truth |
| `feature_flags_json` | `jsonb` | NO |  |
| `custom_settings_json` | `jsonb` | NO | Only low-query tenant settings |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 23. `IBOT_project`

**Purpose:** Long-lived reusable business initiative; NOT one execution.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES | Direct tenant key |
| `project_code` | `varchar(100)` | YES |  |
| `canonical_name` | `varchar(240)` | YES | Stable identity, e.g. Hiring Python Full Stack |
| `description` | `text` | NO |  |
| `objective` | `text` | NO |  |
| `status` | `varchar(30)` | YES | DRAFT, ACTIVE, ON_HOLD, CLOSED, ARCHIVED |
| `visibility` | `varchar(30)` | YES | PRIVATE, ORGANIZATION, DISCOVERABLE |
| `started_at` | `timestamptz` | NO |  |
| `closed_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 24. `IBOT_project_blueprint`

**Purpose:** Reusable configuration template for future Project Runs.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_id` | `uuid` | YES |  |
| `name` | `varchar(200)` | YES |  |
| `description` | `text` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `is_default` | `boolean` | YES | Default false |
| `active_version_id` | `uuid` | NO | FK -> IBOT_project_blueprint_version.id; add after version table |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 25. `IBOT_project_blueprint_version`

**Purpose:** Immutable published snapshot of a Project Blueprint.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_blueprint_id` | `uuid` | YES |  |
| `version_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES | DRAFT, REVIEW, PUBLISHED, ARCHIVED |
| `configuration_json` | `jsonb` | YES | Versioned reusable run defaults |
| `change_summary` | `text` | NO |  |
| `supersedes_version_id` | `uuid` | NO |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `published_by_person_id` | `uuid` | NO |  |
| `published_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 26. `IBOT_project_assignment`

**Purpose:** Scoped project-level team responsibility.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `workspace_membership_id` | `uuid` | NO |  |
| `role_id` | `uuid` | YES |  |
| `party_side` | `varchar(20)` | YES | ORGANIZATION or OTTOBON |
| `status` | `varchar(30)` | YES |  |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 27. `IBOT_project_run`

**Purpose:** One execution of a Project; preserves history independently from future runs.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES | Direct tenant key |
| `project_id` | `uuid` | YES |  |
| `run_code` | `varchar(100)` | YES | Stable run identifier |
| `display_name` | `varchar(260)` | YES | Example: Hiring Python Full Stack 2027 |
| `description` | `text` | NO |  |
| `sequence_no` | `integer` | YES | Run order within Project |
| `status` | `varchar(30)` | YES | DRAFT, CONFIGURING, READY_FOR_REVIEW, APPROVED, READY, SCHEDULED, ACTIVE, ON_HOLD, COMPLETED, CLOSED, CANCELLED |
| `visibility` | `varchar(30)` | YES | PRIVATE, INVITE_ONLY, DISCOVERABLE |
| `target_participant_count` | `integer` | NO | Example: 50 in 2026, 5 in 2027 |
| `application_open_at` | `timestamptz` | NO |  |
| `application_close_at` | `timestamptz` | NO |  |
| `planned_start_at` | `timestamptz` | NO |  |
| `planned_end_at` | `timestamptz` | NO |  |
| `actual_start_at` | `timestamptz` | NO |  |
| `actual_end_at` | `timestamptz` | NO |  |
| `active_setup_version_id` | `uuid` | NO | FK -> IBOT_project_run_setup_version.id |
| `copied_from_run_id` | `uuid` | NO | Self FK; lineage only |
| `blueprint_version_id` | `uuid` | NO |  |
| `published_at` | `timestamptz` | NO |  |
| `closed_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 28. `IBOT_project_run_setup_version`

**Purpose:** Versioned Run-level configuration; active/approved versions are immutable.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `version_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES | DRAFT, REVIEW, APPROVED, ACTIVE, SUPERSEDED |
| `entry_policy_json` | `jsonb` | YES | Who/how may enter and starting phase |
| `participant_field_schema_json` | `jsonb` | NO | Configurable entry fields |
| `handover_policy_json` | `jsonb` | NO |  |
| `notification_policy_json` | `jsonb` | NO |  |
| `configuration_json` | `jsonb` | NO | Low-query run settings not already normalized |
| `change_summary` | `text` | NO |  |
| `effective_from` | `timestamptz` | NO |  |
| `supersedes_version_id` | `uuid` | NO |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `approved_by_person_id` | `uuid` | NO |  |
| `approved_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 29. `IBOT_skill_catalog`

**Purpose:** Canonical searchable skill dictionary.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `skill_code` | `varchar(100)` | YES | UNIQUE |
| `skill_name` | `varchar(160)` | YES |  |
| `normalized_name` | `varchar(160)` | YES | Indexed |
| `category` | `varchar(120)` | NO |  |
| `description` | `text` | NO |  |
| `synonyms_json` | `jsonb` | NO | Small alternate-name list |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 30. `IBOT_project_role_template`

**Purpose:** Reusable role/position definition at Project level.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_id` | `uuid` | YES |  |
| `role_code` | `varchar(100)` | YES |  |
| `display_name` | `varchar(200)` | YES |  |
| `description` | `text` | NO |  |
| `default_target_count` | `integer` | NO |  |
| `eligibility_json` | `jsonb` | NO | Flexible template defaults |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 31. `IBOT_run_role_requirement`

**Purpose:** Run-specific role/headcount requirement; never overwrite prior Run requirement.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `project_role_template_id` | `uuid` | NO |  |
| `role_code` | `varchar(100)` | YES |  |
| `display_name` | `varchar(200)` | YES |  |
| `description` | `text` | NO |  |
| `required_count` | `integer` | NO |  |
| `eligibility_json` | `jsonb` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 32. `IBOT_run_role_skill_requirement`

**Purpose:** Queryable skill expectations for a Run role.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `run_role_requirement_id` | `uuid` | YES |  |
| `skill_id` | `uuid` | YES |  |
| `requirement_level` | `varchar(40)` | NO |  |
| `minimum_proficiency` | `varchar(40)` | NO |  |
| `weight` | `numeric(9,6)` | NO |  |
| `is_mandatory` | `boolean` | YES | Default false |
| `notes` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 33. `IBOT_run_assignment`

**Purpose:** Run-level team responsibility.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `workspace_membership_id` | `uuid` | NO |  |
| `role_id` | `uuid` | YES |  |
| `party_side` | `varchar(20)` | YES | ORGANIZATION or OTTOBON |
| `status` | `varchar(30)` | YES |  |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 34. `IBOT_run_phase`

**Purpose:** One enabled I/B/O/T phase in one Run; multiple phases may be active together.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `phase_type` | `varchar(20)` | YES | IDENTIFY, BUILD, OPERATE, TRANSFER |
| `sequence_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES | NOT_STARTED, READY, ACTIVE, ON_HOLD, COMPLETED, CANCELLED |
| `ownership_type` | `varchar(20)` | YES | ORGANIZATION, OTTOBON, SHARED |
| `capacity` | `integer` | NO |  |
| `planned_start_at` | `timestamptz` | NO |  |
| `planned_end_at` | `timestamptz` | NO |  |
| `actual_start_at` | `timestamptz` | NO |  |
| `actual_end_at` | `timestamptz` | NO |  |
| `active_config_version_id` | `uuid` | NO |  |
| `started_by_person_id` | `uuid` | NO |  |
| `completed_by_person_id` | `uuid` | NO |  |
| `hold_reason` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 35. `IBOT_run_phase_config_version`

**Purpose:** Versioned configuration/input/completion contract for a Run Phase.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `run_phase_id` | `uuid` | YES |  |
| `version_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `config_json` | `jsonb` | YES | Phase-specific variable setup |
| `input_contract_json` | `jsonb` | NO |  |
| `completion_rule_json` | `jsonb` | NO |  |
| `handover_eligibility_json` | `jsonb` | NO |  |
| `change_summary` | `text` | NO |  |
| `effective_from` | `timestamptz` | NO |  |
| `supersedes_version_id` | `uuid` | NO |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `published_by_person_id` | `uuid` | NO |  |
| `published_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 36. `IBOT_phase_assignment`

**Purpose:** Human assignment to a Run Phase; party responsibility remains separate.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `run_phase_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `workspace_membership_id` | `uuid` | NO |  |
| `role_id` | `uuid` | YES |  |
| `party_side` | `varchar(20)` | YES | ORGANIZATION or OTTOBON |
| `status` | `varchar(30)` | YES |  |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 37. `IBOT_phase_outcome_definition`

**Purpose:** Configurable outcome dictionary for a particular Run Phase.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `run_phase_id` | `uuid` | YES |  |
| `outcome_code` | `varchar(100)` | YES |  |
| `display_name` | `varchar(180)` | YES |  |
| `outcome_category` | `varchar(60)` | NO |  |
| `handover_eligible_default` | `boolean` | YES | Default false |
| `terminal_for_phase` | `boolean` | YES | Default true |
| `sort_order` | `integer` | YES |  |
| `config_json` | `jsonb` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 38. `IBOT_run_entry_invitation`

**Purpose:** Invitation for a person to enter a specific Project Run.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `person_id` | `uuid` | NO |  |
| `invitee_identifier` | `varchar(320)` | YES |  |
| `invitee_identifier_normalized` | `varchar(320)` | YES |  |
| `token_hash` | `varchar(256)` | YES |  |
| `source_type` | `varchar(40)` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `expires_at` | `timestamptz` | YES |  |
| `accepted_at` | `timestamptz` | NO |  |
| `invited_by_person_id` | `uuid` | YES |  |
| `metadata_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 39. `IBOT_entry_request`

**Purpose:** Pre-IBOT entry/application/enrollment request; must work even if Identify is disabled.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `entry_type` | `varchar(40)` | YES | APPLICATION, SELF_ENROLL, ADMIN_ENROLL, INVITATION, IMPORT, API, EXISTING_POOL, PREVIOUS_RUN |
| `source_type` | `varchar(60)` | NO |  |
| `source_reference` | `varchar(240)` | NO |  |
| `requested_start_phase` | `varchar(20)` | NO | IDENTIFY, BUILD, OPERATE, TRANSFER |
| `status` | `varchar(30)` | YES | DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, WITHDRAWN, CANCELLED |
| `submitted_at` | `timestamptz` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `current_version_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 40. `IBOT_entry_request_version`

**Purpose:** Versioned form answers for an entry request.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `entry_request_id` | `uuid` | YES |  |
| `version_no` | `integer` | YES |  |
| `form_schema_version` | `integer` | NO |  |
| `answers_json` | `jsonb` | YES | Dynamic answers only; searchable values are projected separately |
| `submission_status` | `varchar(30)` | YES | DRAFT or SUBMITTED |
| `submitted_by_person_id` | `uuid` | NO |  |
| `submitted_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 41. `IBOT_entry_request_index_value`

**Purpose:** Indexed projection of explicitly searchable dynamic application fields.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `entry_request_id` | `uuid` | YES |  |
| `field_key` | `varchar(160)` | YES |  |
| `value_type` | `varchar(20)` | YES | TEXT, NUMBER, DATE, BOOLEAN |
| `text_value` | `text` | NO |  |
| `normalized_text_value` | `text` | NO |  |
| `numeric_value` | `numeric(30,10)` | NO |  |
| `date_value` | `date` | NO |  |
| `boolean_value` | `boolean` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 42. `IBOT_run_participation`

**Purpose:** One Person participating in one Project Run.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `entry_request_id` | `uuid` | NO |  |
| `participant_code` | `varchar(100)` | NO |  |
| `status` | `varchar(30)` | YES | PENDING, ACTIVE, ON_HOLD, COMPLETED, WITHDRAWN, EXITED, CANCELLED |
| `entry_source` | `varchar(40)` | YES |  |
| `primary_run_role_requirement_id` | `uuid` | NO |  |
| `joined_at` | `timestamptz` | NO |  |
| `exited_at` | `timestamptz` | NO |  |
| `exit_reason` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 43. `IBOT_run_participation_role`

**Purpose:** Allows one participant to be associated with one or more Run role requirements.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `run_role_requirement_id` | `uuid` | YES |  |
| `is_primary` | `boolean` | YES | Default false |
| `status` | `varchar(30)` | YES |  |
| `assigned_at` | `timestamptz` | YES |  |
| `assigned_by_person_id` | `uuid` | NO |  |

## 44. `IBOT_phase_participation`

**Purpose:** One participant record for one Run Phase.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `run_phase_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES | PENDING, READY, ACTIVE, COMPLETED, ON_HOLD, WITHDRAWN, REJECTED, CANCELLED |
| `intake_source_type` | `varchar(40)` | YES | DIRECT_ENTRY, HANDOVER, ADMIN, IMPORT, API |
| `intake_handover_id` | `uuid` | NO |  |
| `started_at` | `timestamptz` | NO |  |
| `completed_at` | `timestamptz` | NO |  |
| `outcome_definition_id` | `uuid` | NO |  |
| `outcome_recorded_at` | `timestamptz` | NO |  |
| `outcome_recorded_by_person_id` | `uuid` | NO |  |
| `completion_reason` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 45. `IBOT_evidence_item`

**Purpose:** Normalized evidence reference across IBOT phases and external execution systems.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | NO |  |
| `evidence_type` | `varchar(80)` | YES |  |
| `title` | `varchar(240)` | YES |  |
| `summary` | `text` | NO |  |
| `source_type` | `varchar(60)` | YES | INTERNAL, COURSE_PLATFORM, EXPERTS_HUB, TALENTOPS, EXTERNAL |
| `source_entity_type` | `varchar(100)` | NO |  |
| `source_entity_id` | `varchar(240)` | NO |  |
| `external_url` | `text` | NO |  |
| `file_id` | `uuid` | NO |  |
| `structured_data_json` | `jsonb` | NO | Evidence payload not used for core relations |
| `visibility_scope` | `varchar(30)` | YES |  |
| `recorded_at` | `timestamptz` | YES |  |
| `recorded_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 46. `IBOT_handover`

**Purpose:** Explicit manual movement request between two enabled Run Phases.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `from_run_phase_id` | `uuid` | YES |  |
| `to_run_phase_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES | DRAFT, SENT, PENDING_ACCEPTANCE, ACCEPTED, COMPLETED, RETURNED, REJECTED, CANCELLED |
| `title` | `varchar(240)` | NO |  |
| `reason` | `text` | NO |  |
| `initiated_by_person_id` | `uuid` | YES |  |
| `sent_at` | `timestamptz` | NO |  |
| `accepted_by_person_id` | `uuid` | NO |  |
| `accepted_at` | `timestamptz` | NO |  |
| `returned_at` | `timestamptz` | NO |  |
| `rejected_at` | `timestamptz` | NO |  |
| `cancelled_at` | `timestamptz` | NO |  |
| `resolution_by_person_id` | `uuid` | NO |  |
| `resolution_reason` | `text` | NO |  |
| `notes` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 47. `IBOT_handover_participant`

**Purpose:** Participant selection and receiving-phase validation within one Handover.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `handover_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `source_phase_participation_id` | `uuid` | YES |  |
| `target_phase_participation_id` | `uuid` | NO |  |
| `source_outcome_definition_id` | `uuid` | NO |  |
| `validation_status` | `varchar(30)` | YES | PENDING, VALID, INVALID |
| `validation_errors_json` | `jsonb` | NO |  |
| `status` | `varchar(30)` | YES | SELECTED, ACCEPTED, RETURNED, REJECTED, CANCELLED |
| `selected_by_person_id` | `uuid` | YES |  |
| `selected_at` | `timestamptz` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |


# 3. Identify

## 48. `IBOT_identify_stage_definition`

**Purpose:** Configurable stage in an Identify pipeline.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `run_phase_id` | `uuid` | YES | Must reference an IDENTIFY phase |
| `stage_key` | `varchar(100)` | YES |  |
| `stage_type` | `varchar(50)` | YES | ELIGIBILITY, MANUAL_REVIEW, ONLINE_ASSESSMENT, OFFLINE_ASSESSMENT, EXTERNAL_ASSESSMENT, INTERVIEW, RANDOM_SELECTION, SHORTLIST |
| `stage_name` | `varchar(180)` | YES |  |
| `sequence_no` | `integer` | YES |  |
| `is_required` | `boolean` | YES |  |
| `scoring_weight` | `numeric(9,6)` | NO | Percentage value 0..100 when used |
| `config_json` | `jsonb` | NO | Stage-specific configuration |
| `pass_rule_json` | `jsonb` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 49. `IBOT_identify_stage_attempt`

**Purpose:** Participant execution/result for one Identify stage.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `stage_definition_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | YES |  |
| `attempt_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES | NOT_STARTED, SCHEDULED, IN_PROGRESS, SUBMITTED, EVALUATED, PASSED, FAILED, NEEDS_REVIEW, CANCELLED |
| `scheduled_start_at` | `timestamptz` | NO |  |
| `scheduled_end_at` | `timestamptz` | NO |  |
| `location_type` | `varchar(30)` | NO |  |
| `location_value` | `text` | NO |  |
| `started_at` | `timestamptz` | NO |  |
| `submitted_at` | `timestamptz` | NO |  |
| `completed_at` | `timestamptz` | NO |  |
| `raw_score` | `numeric(18,6)` | NO |  |
| `normalized_score` | `numeric(9,6)` | NO |  |
| `result_code` | `varchar(80)` | NO |  |
| `result_data_json` | `jsonb` | NO |  |
| `source_type` | `varchar(40)` | NO | INTERNAL or EXTERNAL |
| `external_reference` | `varchar(240)` | NO |  |
| `evaluated_by_person_id` | `uuid` | NO |  |
| `evaluated_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 50. `IBOT_identify_stage_reviewer`

**Purpose:** Reviewer/panel assignment for an Identify stage.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `stage_definition_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `workspace_membership_id` | `uuid` | NO |  |
| `reviewer_role` | `varchar(60)` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `assigned_at` | `timestamptz` | YES |  |


# 4. Build / Curriculum

## 51. `IBOT_curriculum`

**Purpose:** Reusable Project curriculum identity.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_id` | `uuid` | YES |  |
| `curriculum_code` | `varchar(100)` | YES |  |
| `curriculum_name` | `varchar(240)` | YES |  |
| `description` | `text` | NO |  |
| `status` | `varchar(30)` | YES | DRAFT, ACTIVE, ARCHIVED |
| `active_version_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 52. `IBOT_curriculum_version`

**Purpose:** Versioned curriculum; published versions are immutable.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `curriculum_id` | `uuid` | YES |  |
| `version_no` | `integer` | YES |  |
| `version_label` | `varchar(100)` | NO |  |
| `status` | `varchar(30)` | YES | DRAFT, REVIEW, CHANGES_REQUESTED, APPROVED, PUBLISHED, ARCHIVED |
| `description` | `text` | NO |  |
| `learning_objectives_json` | `jsonb` | NO |  |
| `total_estimated_minutes` | `integer` | NO |  |
| `change_summary` | `text` | NO |  |
| `supersedes_version_id` | `uuid` | NO |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `published_by_person_id` | `uuid` | NO |  |
| `published_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 53. `IBOT_curriculum_module`

**Purpose:** Ordered module inside one Curriculum Version.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `curriculum_version_id` | `uuid` | YES |  |
| `module_code` | `varchar(100)` | YES |  |
| `module_title` | `varchar(240)` | YES |  |
| `description` | `text` | NO |  |
| `sequence_no` | `integer` | YES |  |
| `is_mandatory` | `boolean` | YES |  |
| `unlock_policy_json` | `jsonb` | NO |  |
| `completion_policy_json` | `jsonb` | NO |  |
| `estimated_minutes` | `integer` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 54. `IBOT_curriculum_item`

**Purpose:** Lesson/activity/assessment/project/session reference inside a module.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `curriculum_module_id` | `uuid` | YES |  |
| `item_code` | `varchar(100)` | YES |  |
| `item_type` | `varchar(40)` | YES | LESSON, VIDEO, DOCUMENT, ASSIGNMENT, ASSESSMENT, PROJECT, PRACTICAL, LIVE_SESSION, EXPERT_SESSION, EXTERNAL_ACTIVITY |
| `item_title` | `varchar(240)` | YES |  |
| `description` | `text` | NO |  |
| `sequence_no` | `integer` | YES |  |
| `is_mandatory` | `boolean` | YES |  |
| `content_reference_type` | `varchar(60)` | NO | INTERNAL, FILE, URL, COURSE_PLATFORM, OTHER |
| `content_reference_id` | `varchar(240)` | NO |  |
| `config_json` | `jsonb` | NO | Type-specific execution configuration |
| `completion_policy_json` | `jsonb` | NO |  |
| `estimated_minutes` | `integer` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 55. `IBOT_curriculum_migration`

**Purpose:** Controlled exceptional migration of an active Cohort to another Curriculum Version.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | YES |  |
| `from_curriculum_version_id` | `uuid` | YES |  |
| `to_curriculum_version_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES | REQUESTED, REVIEW, APPROVED, EXECUTING, COMPLETED, REJECTED, CANCELLED |
| `progress_mapping_json` | `jsonb` | YES | Explicit old-to-new progress mapping |
| `impact_summary` | `text` | NO |  |
| `requested_by_person_id` | `uuid` | YES |  |
| `requested_at` | `timestamptz` | YES |  |
| `approved_by_person_id` | `uuid` | NO |  |
| `approved_at` | `timestamptz` | NO |  |
| `executed_by_person_id` | `uuid` | NO |  |
| `executed_at` | `timestamptz` | NO |  |

## 56. `IBOT_cohort`

**Purpose:** Build delivery group within one Project Run.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `build_run_phase_id` | `uuid` | YES | Must reference BUILD phase |
| `cohort_code` | `varchar(100)` | YES |  |
| `cohort_name` | `varchar(240)` | YES |  |
| `description` | `text` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `capacity` | `integer` | NO |  |
| `curriculum_version_id` | `uuid` | YES |  |
| `delivery_mode` | `varchar(30)` | YES | SELF_PACED, COHORT_BASED, HYBRID |
| `start_at` | `timestamptz` | NO |  |
| `end_at` | `timestamptz` | NO |  |
| `enrollment_open_at` | `timestamptz` | NO |  |
| `enrollment_close_at` | `timestamptz` | NO |  |
| `timezone` | `varchar(80)` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 57. `IBOT_cohort_membership`

**Purpose:** Participant membership in a Build Cohort.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `joined_at` | `timestamptz` | YES |  |
| `left_at` | `timestamptz` | NO |  |
| `exit_reason` | `text` | NO |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 58. `IBOT_cohort_assignment`

**Purpose:** Trainer/Expert/Reviewer responsibility for a Cohort.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `workspace_membership_id` | `uuid` | NO |  |
| `role_type` | `varchar(50)` | YES | COHORT_LEAD, TRAINER, EXPERT, REVIEWER, SUPPORT |
| `status` | `varchar(30)` | YES |  |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 59. `IBOT_activity_group`

**Purpose:** Team for a Build team activity/project.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | YES |  |
| `curriculum_item_id` | `uuid` | YES |  |
| `group_code` | `varchar(100)` | YES |  |
| `group_name` | `varchar(200)` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `max_members` | `integer` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 60. `IBOT_activity_group_member`

**Purpose:** Participant membership in a Build activity team.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `activity_group_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `member_role` | `varchar(60)` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `joined_at` | `timestamptz` | YES |  |
| `left_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 61. `IBOT_learning_progress`

**Purpose:** Current authoritative/projection progress state for one participant and Curriculum Item.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | NO |  |
| `curriculum_version_id` | `uuid` | YES |  |
| `curriculum_item_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES | LOCKED, AVAILABLE, IN_PROGRESS, SUBMITTED, COMPLETED, FAILED, WAIVED |
| `progress_percent` | `numeric(7,4)` | NO |  |
| `attempt_count` | `integer` | YES | Default 0 |
| `first_started_at` | `timestamptz` | NO |  |
| `last_accessed_at` | `timestamptz` | NO |  |
| `completed_at` | `timestamptz` | NO |  |
| `score` | `numeric(18,6)` | NO |  |
| `completion_source` | `varchar(40)` | NO |  |
| `source_system` | `varchar(60)` | NO | Set when external system is authoritative |
| `source_updated_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 62. `IBOT_progression_decision`

**Purpose:** Auditable manual gate/unlock/override decision.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | YES |  |
| `curriculum_module_id` | `uuid` | NO |  |
| `curriculum_item_id` | `uuid` | NO |  |
| `decision_type` | `varchar(50)` | YES | UNLOCK, GATE, OVERRIDE, WAIVER |
| `decision` | `varchar(30)` | YES | APPROVED, REJECTED, OVERRIDDEN, WAIVED |
| `reason` | `text` | YES |  |
| `decided_by_person_id` | `uuid` | YES |  |
| `decided_at` | `timestamptz` | YES |  |
| `expires_at` | `timestamptz` | NO |  |
| `evidence_json` | `jsonb` | NO |  |

## 63. `IBOT_activity_submission`

**Purpose:** Versioned participant or team submission for a Build activity.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | NO |  |
| `curriculum_item_id` | `uuid` | YES |  |
| `activity_group_id` | `uuid` | NO |  |
| `submission_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `content_json` | `jsonb` | NO | Text/URL structured submission; files use IBOT_file_link |
| `submitted_at` | `timestamptz` | NO |  |
| `score` | `numeric(18,6)` | NO |  |
| `evaluated_at` | `timestamptz` | NO |  |
| `evaluated_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 64. `IBOT_submission_review`

**Purpose:** Reviewer decision/feedback for one Build submission.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `activity_submission_id` | `uuid` | YES |  |
| `reviewer_person_id` | `uuid` | YES |  |
| `review_type` | `varchar(50)` | NO |  |
| `decision` | `varchar(30)` | NO |  |
| `score` | `numeric(18,6)` | NO |  |
| `feedback` | `text` | NO |  |
| `rubric_scores_json` | `jsonb` | NO |  |
| `reviewed_at` | `timestamptz` | YES |  |
| `created_at` | `timestamptz` | YES |  |

## 65. `IBOT_intervention`

**Purpose:** Targeted Build intervention/follow-up for a participant.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | NO |  |
| `intervention_type` | `varchar(60)` | YES |  |
| `reason` | `text` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `owner_person_id` | `uuid` | NO |  |
| `due_at` | `timestamptz` | NO |  |
| `started_at` | `timestamptz` | NO |  |
| `resolved_at` | `timestamptz` | NO |  |
| `resolution_notes` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 66. `IBOT_session`

**Purpose:** Scheduled Build live/expert/review session.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `build_run_phase_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | NO |  |
| `session_type` | `varchar(50)` | YES | LIVE_CLASS, EXPERT_SESSION, REVIEW, MENTORING, OTHER |
| `title` | `varchar(240)` | YES |  |
| `description` | `text` | NO |  |
| `start_at` | `timestamptz` | YES |  |
| `end_at` | `timestamptz` | YES |  |
| `timezone` | `varchar(80)` | YES |  |
| `location_type` | `varchar(30)` | YES | ONLINE, PHYSICAL, HYBRID |
| `location_value` | `text` | NO |  |
| `capacity` | `integer` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `metadata_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 67. `IBOT_session_assignment`

**Purpose:** Host/Trainer/Expert/Reviewer assignment for a Build session.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `session_id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `role_type` | `varchar(40)` | YES | HOST, TRAINER, EXPERT, REVIEWER |
| `status` | `varchar(30)` | YES |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `assigned_at` | `timestamptz` | YES |  |

## 68. `IBOT_session_attendance`

**Purpose:** Participant attendance for a Build session.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `session_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `attendance_status` | `varchar(30)` | YES | PRESENT, ABSENT, LEAVE, NOT_REQUIRED |
| `joined_at` | `timestamptz` | NO |  |
| `left_at` | `timestamptz` | NO |  |
| `duration_minutes` | `integer` | NO |  |
| `marked_by_person_id` | `uuid` | NO |  |
| `evidence_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |


# 5. Operate

## 69. `IBOT_operate_engagement`

**Purpose:** One individual or team real-work engagement in Operate.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `operate_run_phase_id` | `uuid` | YES | Must reference OPERATE phase |
| `engagement_code` | `varchar(100)` | YES |  |
| `engagement_name` | `varchar(240)` | YES |  |
| `engagement_type` | `varchar(60)` | YES | INTERNSHIP, LIVE_PROJECT, CLIENT_ASSIGNMENT, WORK_SIMULATION, APPRENTICESHIP, TRIAL_ENGAGEMENT |
| `participation_mode` | `varchar(20)` | YES | INDIVIDUAL or TEAM |
| `status` | `varchar(30)` | YES |  |
| `role_title` | `varchar(200)` | NO |  |
| `description` | `text` | NO |  |
| `start_at` | `timestamptz` | NO |  |
| `end_at` | `timestamptz` | NO |  |
| `client_reference` | `varchar(240)` | NO |  |
| `configuration_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 70. `IBOT_operate_engagement_participant`

**Purpose:** Participant membership in an Operate engagement; supports team engagements.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `engagement_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | YES |  |
| `engagement_role` | `varchar(120)` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `joined_at` | `timestamptz` | YES |  |
| `exited_at` | `timestamptz` | NO |  |
| `exit_reason` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 71. `IBOT_supervisor_assignment`

**Purpose:** Supervisor assignment scoped to a whole engagement or one participant.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `engagement_id` | `uuid` | YES |  |
| `engagement_participant_id` | `uuid` | NO |  |
| `supervisor_person_id` | `uuid` | YES |  |
| `supervisor_membership_id` | `uuid` | NO |  |
| `scope_type` | `varchar(20)` | YES | ENGAGEMENT or PARTICIPANT |
| `status` | `varchar(30)` | YES |  |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 72. `IBOT_work_item`

**Purpose:** Task/milestone/deliverable inside an Operate engagement.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `engagement_id` | `uuid` | YES |  |
| `parent_work_item_id` | `uuid` | NO | Self FK for hierarchy |
| `work_type` | `varchar(30)` | YES | TASK, MILESTONE, DELIVERABLE |
| `title` | `varchar(240)` | YES |  |
| `description` | `text` | NO |  |
| `priority` | `varchar(20)` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `start_at` | `timestamptz` | NO |  |
| `due_at` | `timestamptz` | NO |  |
| `completed_at` | `timestamptz` | NO |  |
| `source_system` | `varchar(60)` | NO | Set when external/TalentOps owns execution |
| `external_reference` | `varchar(240)` | NO |  |
| `config_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 73. `IBOT_work_item_assignee`

**Purpose:** Many-to-many task assignment for team Operate work.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `work_item_id` | `uuid` | YES |  |
| `engagement_participant_id` | `uuid` | YES |  |
| `assignment_role` | `varchar(30)` | YES | OWNER or COLLABORATOR |
| `status` | `varchar(30)` | YES |  |
| `assigned_at` | `timestamptz` | YES |  |
| `assigned_by_person_id` | `uuid` | NO |  |
| `completed_at` | `timestamptz` | NO |  |

## 74. `IBOT_work_submission`

**Purpose:** Versioned Operate task/deliverable submission.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `work_item_id` | `uuid` | YES |  |
| `engagement_participant_id` | `uuid` | YES |  |
| `submission_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `content_json` | `jsonb` | NO | Text/URLs; files through IBOT_file_link |
| `submitted_at` | `timestamptz` | NO |  |
| `accepted_at` | `timestamptz` | NO |  |
| `accepted_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 75. `IBOT_work_submission_review`

**Purpose:** Review/feedback for an Operate work submission.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `work_submission_id` | `uuid` | YES |  |
| `reviewer_person_id` | `uuid` | YES |  |
| `decision` | `varchar(30)` | NO |  |
| `score` | `numeric(18,6)` | NO |  |
| `feedback` | `text` | NO |  |
| `rubric_json` | `jsonb` | NO |  |
| `reviewed_at` | `timestamptz` | YES |  |
| `created_at` | `timestamptz` | YES |  |

## 76. `IBOT_performance_review_cycle`

**Purpose:** Periodic/milestone/final review window for an engagement.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `engagement_id` | `uuid` | YES |  |
| `cycle_name` | `varchar(200)` | YES |  |
| `cycle_type` | `varchar(40)` | YES | PERIODIC, MILESTONE, FINAL, AD_HOC |
| `period_start` | `date` | NO |  |
| `period_end` | `date` | NO |  |
| `due_at` | `timestamptz` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `config_json` | `jsonb` | NO | Configured dimensions/rules |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 77. `IBOT_performance_review`

**Purpose:** One reviewer evaluation for one engagement participant and review cycle.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `review_cycle_id` | `uuid` | YES |  |
| `engagement_participant_id` | `uuid` | YES |  |
| `reviewer_person_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `overall_score` | `numeric(18,6)` | NO |  |
| `decision` | `varchar(60)` | NO |  |
| `summary` | `text` | NO |  |
| `submitted_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 78. `IBOT_performance_score`

**Purpose:** Normalized dimension-level score within an Operate review.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `performance_review_id` | `uuid` | YES |  |
| `dimension_code` | `varchar(100)` | YES |  |
| `dimension_name` | `varchar(180)` | YES |  |
| `score` | `numeric(18,6)` | YES |  |
| `max_score` | `numeric(18,6)` | NO |  |
| `weight` | `numeric(9,6)` | NO |  |
| `comments` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 79. `IBOT_operate_change_request`

**Purpose:** Controlled extension/reassignment/hold/termination changes in Operate.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `engagement_id` | `uuid` | YES |  |
| `engagement_participant_id` | `uuid` | NO |  |
| `request_type` | `varchar(40)` | YES | EXTEND, REASSIGN, SUPERVISOR_CHANGE, HOLD, EARLY_COMPLETE, TERMINATE, WITHDRAW |
| `status` | `varchar(30)` | YES | REQUESTED, REVIEW, APPROVED, REJECTED, APPLIED, CANCELLED |
| `requested_values_json` | `jsonb` | NO |  |
| `reason` | `text` | YES |  |
| `requested_by_person_id` | `uuid` | YES |  |
| `requested_at` | `timestamptz` | YES |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `decision_notes` | `text` | NO |  |
| `effective_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |


# 6. Transfer

## 80. `IBOT_transfer_case`

**Purpose:** Transfer decision case for one Run participant.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `transfer_run_phase_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `phase_participation_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES | OPEN, UNDER_REVIEW, DECISION_PENDING, DECIDED, ON_HOLD, CLOSED |
| `evidence_snapshot_json` | `jsonb` | NO | Decision-time evidence snapshot/reference summary |
| `opened_at` | `timestamptz` | YES |  |
| `opened_by_person_id` | `uuid` | YES |  |
| `closed_at` | `timestamptz` | NO |  |
| `closed_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 81. `IBOT_transfer_review`

**Purpose:** Reviewer/panel assessment in a Transfer case.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `transfer_case_id` | `uuid` | YES |  |
| `reviewer_person_id` | `uuid` | YES |  |
| `review_type` | `varchar(50)` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `recommendation` | `varchar(60)` | NO |  |
| `score` | `numeric(18,6)` | NO |  |
| `comments` | `text` | NO |  |
| `rubric_json` | `jsonb` | NO |  |
| `submitted_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 82. `IBOT_transfer_decision`

**Purpose:** Immutable final/correction decision record; corrections create a new row.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `transfer_case_id` | `uuid` | YES |  |
| `decision_type` | `varchar(50)` | YES | HIRE, EXTEND_OPERATE, OFFER_NOW_JOIN_LATER, NOT_SELECTED, WITHDRAWN, ON_HOLD |
| `status` | `varchar(30)` | YES | DRAFT, PENDING_APPROVAL, APPROVED, EFFECTIVE, SUPERSEDED, CANCELLED |
| `decision_reason` | `text` | NO |  |
| `decided_by_person_id` | `uuid` | NO |  |
| `decided_at` | `timestamptz` | NO |  |
| `effective_at` | `timestamptz` | NO |  |
| `supersedes_decision_id` | `uuid` | NO |  |
| `correction_reason` | `text` | NO |  |
| `evidence_snapshot_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES | Used before finalization |

## 83. `IBOT_transfer_decision_approval`

**Purpose:** Ordered approval steps for a Transfer decision.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `transfer_decision_id` | `uuid` | YES |  |
| `step_no` | `integer` | YES |  |
| `approver_person_id` | `uuid` | NO |  |
| `approver_role_id` | `uuid` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `comments` | `text` | NO |  |
| `decided_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 84. `IBOT_transfer_offer_detail`

**Purpose:** Offer/joining details when a Transfer outcome requires them.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `transfer_decision_id` | `uuid` | YES | UNIQUE where applicable |
| `role_title` | `varchar(200)` | YES |  |
| `employment_type` | `varchar(60)` | NO |  |
| `offered_ctc` | `numeric(20,4)` | NO |  |
| `currency` | `char(3)` | NO |  |
| `offer_date` | `date` | NO |  |
| `planned_joining_date` | `date` | NO |  |
| `actual_joining_date` | `date` | NO |  |
| `offer_reference` | `varchar(240)` | NO |  |
| `offer_file_id` | `uuid` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |


# 7. Commercial / Finance

## 85. `IBOT_commercial_model`

**Purpose:** Reusable commercial model identity at Project level.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_id` | `uuid` | YES |  |
| `model_name` | `varchar(200)` | YES |  |
| `model_type` | `varchar(40)` | YES | CLIENT_FUNDED, PARTICIPANT_FUNDED, REVENUE_SHARE, SUCCESS_FEE, HYBRID, SPONSORED |
| `status` | `varchar(30)` | YES |  |
| `active_version_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 86. `IBOT_commercial_version`

**Purpose:** Immutable approved commercial terms, optionally scoped to a Run.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `commercial_model_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | NO | NULL means reusable Project-level version |
| `version_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES | DRAFT, REVIEW, APPROVED, ACTIVE, SUPERSEDED, EXPIRED |
| `currency` | `char(3)` | YES |  |
| `payer_type` | `varchar(40)` | YES | PARTICIPANT, ORGANIZATION, MULTIPLE, SPONSOR, NONE_UPFRONT |
| `billing_schedule_json` | `jsonb` | NO |  |
| `settlement_policy_json` | `jsonb` | NO |  |
| `tax_policy_json` | `jsonb` | NO |  |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `change_summary` | `text` | NO |  |
| `supersedes_version_id` | `uuid` | NO |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `approved_by_person_id` | `uuid` | NO |  |
| `approved_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 87. `IBOT_commercial_component`

**Purpose:** Normalized fee/share/success-fee component within one Commercial Version.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `commercial_version_id` | `uuid` | YES |  |
| `component_code` | `varchar(100)` | YES |  |
| `component_type` | `varchar(40)` | YES | FIXED_FEE, PER_PARTICIPANT, REVENUE_SHARE, SUCCESS_FEE, DISCOUNT, OTHER |
| `component_name` | `varchar(180)` | YES |  |
| `amount` | `numeric(20,4)` | NO |  |
| `percentage` | `numeric(9,6)` | NO | Percent value 0..100 |
| `unit_basis` | `varchar(60)` | NO |  |
| `trigger_event` | `varchar(100)` | NO |  |
| `payer_party_type` | `varchar(40)` | NO |  |
| `payee_party_type` | `varchar(40)` | NO |  |
| `configuration_json` | `jsonb` | NO |  |
| `sequence_no` | `integer` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 88. `IBOT_billing_profile`

**Purpose:** Reusable financial counterparty/billing identity for a workspace, person, or external sponsor/partner.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO | Tenant context when owned by an Organization |
| `party_type` | `varchar(30)` | YES | WORKSPACE, PERSON, EXTERNAL_SPONSOR, EXTERNAL_PARTNER, OTTOBON |
| `workspace_id` | `uuid` | NO |  |
| `person_id` | `uuid` | NO |  |
| `external_party_reference` | `varchar(200)` | NO |  |
| `profile_name` | `varchar(180)` | YES |  |
| `legal_name` | `varchar(240)` | YES |  |
| `tax_identifier` | `varchar(120)` | NO |  |
| `billing_email` | `varchar(320)` | NO |  |
| `address_line1` | `varchar(240)` | NO |  |
| `address_line2` | `varchar(240)` | NO |  |
| `city` | `varchar(120)` | NO |  |
| `state_region` | `varchar(120)` | NO |  |
| `postal_code` | `varchar(40)` | NO |  |
| `country_code` | `char(2)` | NO |  |
| `default_currency` | `char(3)` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 89. `IBOT_entitlement`

**Purpose:** Access right granted independently from payment state.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `run_phase_id` | `uuid` | NO |  |
| `curriculum_version_id` | `uuid` | NO |  |
| `cohort_id` | `uuid` | NO |  |
| `entitlement_type` | `varchar(60)` | YES | RUN_ACCESS, PHASE_ACCESS, BUILD_ACCESS, CONTENT_ACCESS, OTHER |
| `source_type` | `varchar(40)` | YES | PAYMENT, SPONSOR, ADMIN, COMMERCIAL, SCHOLARSHIP, OTHER |
| `source_entity_id` | `uuid` | NO |  |
| `status` | `varchar(30)` | YES | PENDING, ACTIVE, SUSPENDED, EXPIRED, REVOKED |
| `granted_at` | `timestamptz` | NO |  |
| `valid_from` | `timestamptz` | NO |  |
| `valid_until` | `timestamptz` | NO |  |
| `revoked_at` | `timestamptz` | NO |  |
| `revoked_by_person_id` | `uuid` | NO |  |
| `revoke_reason` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 90. `IBOT_success_fee_case`

**Purpose:** Success-fee calculation/review case triggered by a qualifying Transfer outcome.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `run_participation_id` | `uuid` | YES |  |
| `transfer_decision_id` | `uuid` | YES |  |
| `commercial_version_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES | NOT_TRIGGERED, TRIGGERED, UNDER_REVIEW, INVOICED, PAID, DISPUTED, CLOSED |
| `basis_amount` | `numeric(20,4)` | NO |  |
| `fee_percentage` | `numeric(9,6)` | NO | Percent value 0..100 |
| `calculated_amount` | `numeric(20,4)` | NO |  |
| `currency` | `char(3)` | YES |  |
| `triggered_at` | `timestamptz` | NO |  |
| `reviewed_by_person_id` | `uuid` | NO |  |
| `reviewed_at` | `timestamptz` | NO |  |
| `invoice_id` | `uuid` | NO |  |
| `dispute_reason` | `text` | NO |  |
| `closed_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 91. `IBOT_invoice`

**Purpose:** Invoice header with immutable bill-to snapshot.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `commercial_version_id` | `uuid` | YES |  |
| `invoice_number` | `varchar(100)` | YES |  |
| `status` | `varchar(30)` | YES | DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, VOID |
| `currency` | `char(3)` | YES |  |
| `issue_date` | `date` | NO |  |
| `due_date` | `date` | NO |  |
| `bill_to_billing_profile_id` | `uuid` | YES |  |
| `billing_profile_snapshot_json` | `jsonb` | YES | Immutable legal/billing snapshot at issue time |
| `subtotal` | `numeric(20,4)` | YES |  |
| `discount_total` | `numeric(20,4)` | YES |  |
| `tax_total` | `numeric(20,4)` | YES |  |
| `grand_total` | `numeric(20,4)` | YES |  |
| `amount_paid` | `numeric(20,4)` | YES |  |
| `amount_due` | `numeric(20,4)` | YES |  |
| `issued_by_person_id` | `uuid` | NO |  |
| `issued_at` | `timestamptz` | NO |  |
| `voided_at` | `timestamptz` | NO |  |
| `voided_by_person_id` | `uuid` | NO |  |
| `void_reason` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 92. `IBOT_invoice_line`

**Purpose:** Invoice line item; immutable after invoice issue except controlled correction/credit flow.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `invoice_id` | `uuid` | YES |  |
| `commercial_component_id` | `uuid` | NO |  |
| `line_no` | `integer` | YES |  |
| `description` | `text` | YES |  |
| `quantity` | `numeric(18,6)` | YES |  |
| `unit_amount` | `numeric(20,4)` | YES |  |
| `line_subtotal` | `numeric(20,4)` | YES |  |
| `discount_amount` | `numeric(20,4)` | YES |  |
| `tax_amount` | `numeric(20,4)` | YES |  |
| `line_total` | `numeric(20,4)` | YES |  |
| `metadata_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 93. `IBOT_payment`

**Purpose:** One payment transaction/attempt recorded by the platform.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `payer_billing_profile_id` | `uuid` | NO |  |
| `payment_provider` | `varchar(80)` | YES |  |
| `provider_payment_id` | `varchar(240)` | NO |  |
| `payment_method` | `varchar(60)` | NO |  |
| `status` | `varchar(30)` | YES | CREATED, PENDING, PAID, FAILED, CANCELLED, REFUNDED, PARTIALLY_REFUNDED |
| `currency` | `char(3)` | YES |  |
| `amount` | `numeric(20,4)` | YES |  |
| `fee_amount` | `numeric(20,4)` | YES |  |
| `net_amount` | `numeric(20,4)` | NO |  |
| `initiated_at` | `timestamptz` | YES |  |
| `paid_at` | `timestamptz` | NO |  |
| `failed_at` | `timestamptz` | NO |  |
| `refunded_amount` | `numeric(20,4)` | YES |  |
| `idempotency_key` | `varchar(200)` | NO |  |
| `reference_no` | `varchar(240)` | NO | Bank/offline/provider reference |
| `raw_provider_summary_json` | `jsonb` | NO | Sanitized non-secret provider summary |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 94. `IBOT_payment_allocation`

**Purpose:** Allocation of one payment across one or more invoices.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `payment_id` | `uuid` | YES |  |
| `invoice_id` | `uuid` | YES |  |
| `amount_allocated` | `numeric(20,4)` | YES |  |
| `allocated_at` | `timestamptz` | YES |  |
| `allocated_by_person_id` | `uuid` | NO |  |
| `reversed_at` | `timestamptz` | NO |  |
| `reversed_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 95. `IBOT_refund`

**Purpose:** Refund transaction against a Payment.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `payment_id` | `uuid` | YES |  |
| `provider_refund_id` | `varchar(240)` | NO |  |
| `status` | `varchar(30)` | YES | REQUESTED, PENDING, COMPLETED, FAILED, CANCELLED |
| `currency` | `char(3)` | YES |  |
| `amount` | `numeric(20,4)` | YES |  |
| `reason` | `text` | NO |  |
| `requested_by_person_id` | `uuid` | NO |  |
| `requested_at` | `timestamptz` | YES |  |
| `completed_at` | `timestamptz` | NO |  |
| `failed_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 96. `IBOT_revenue_allocation`

**Purpose:** Calculated share/amount owed to a financial recipient from a Payment.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `payment_id` | `uuid` | YES |  |
| `invoice_line_id` | `uuid` | NO |  |
| `commercial_component_id` | `uuid` | NO |  |
| `recipient_billing_profile_id` | `uuid` | YES |  |
| `allocation_type` | `varchar(40)` | YES | REVENUE_SHARE, FEE, COMMISSION, OTHER |
| `amount` | `numeric(20,4)` | YES |  |
| `currency` | `char(3)` | YES |  |
| `status` | `varchar(30)` | YES | PENDING, READY, SETTLED, REVERSED |
| `calculated_at` | `timestamptz` | YES |  |
| `settlement_id` | `uuid` | NO |  |
| `metadata_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 97. `IBOT_settlement`

**Purpose:** Actual payout/settlement to one financial recipient.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `settlement_number` | `varchar(100)` | YES |  |
| `recipient_billing_profile_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES | PENDING, READY, PROCESSING, SETTLED, FAILED |
| `currency` | `char(3)` | YES |  |
| `gross_amount` | `numeric(20,4)` | YES |  |
| `adjustments_amount` | `numeric(20,4)` | YES |  |
| `net_amount` | `numeric(20,4)` | YES |  |
| `period_start` | `date` | NO |  |
| `period_end` | `date` | NO |  |
| `ready_at` | `timestamptz` | NO |  |
| `processing_at` | `timestamptz` | NO |  |
| `settled_at` | `timestamptz` | NO |  |
| `failed_at` | `timestamptz` | NO |  |
| `provider_reference` | `varchar(240)` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 98. `IBOT_settlement_line`

**Purpose:** Revenue allocations included in one settlement.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `settlement_id` | `uuid` | YES |  |
| `revenue_allocation_id` | `uuid` | YES |  |
| `amount` | `numeric(20,4)` | YES |  |
| `created_at` | `timestamptz` | YES |  |

## 99. `IBOT_reconciliation_case`

**Purpose:** Mismatch/reconciliation case for payments, settlements, or provider records.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `provider_name` | `varchar(100)` | YES |  |
| `case_type` | `varchar(50)` | YES |  |
| `internal_entity_type` | `varchar(80)` | NO |  |
| `internal_entity_id` | `uuid` | NO |  |
| `external_reference` | `varchar(240)` | NO |  |
| `status` | `varchar(30)` | YES | OPEN, INVESTIGATING, RESOLVED, IGNORED |
| `discrepancy_type` | `varchar(60)` | NO |  |
| `expected_amount` | `numeric(20,4)` | NO |  |
| `actual_amount` | `numeric(20,4)` | NO |  |
| `currency` | `char(3)` | NO |  |
| `details_json` | `jsonb` | NO |  |
| `detected_at` | `timestamptz` | YES |  |
| `resolved_at` | `timestamptz` | NO |  |
| `resolved_by_person_id` | `uuid` | NO |  |
| `resolution_notes` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |


# 8. Platform / Infrastructure

## 100. `IBOT_file`

**Purpose:** Metadata for an object stored in S3-compatible storage.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO | NULL for platform/global file |
| `workspace_id` | `uuid` | NO |  |
| `owner_person_id` | `uuid` | NO |  |
| `storage_provider` | `varchar(60)` | YES |  |
| `bucket_name` | `varchar(160)` | YES |  |
| `object_key` | `text` | YES |  |
| `original_filename` | `varchar(500)` | YES |  |
| `mime_type` | `varchar(160)` | YES |  |
| `size_bytes` | `bigint` | YES |  |
| `checksum_sha256` | `varchar(64)` | NO |  |
| `classification` | `varchar(40)` | YES | PUBLIC, INTERNAL, CONFIDENTIAL, SENSITIVE |
| `status` | `varchar(30)` | YES | UPLOADING, ACTIVE, QUARANTINED, DELETED |
| `scan_status` | `varchar(30)` | NO | PENDING, CLEAN, INFECTED, FAILED |
| `scan_at` | `timestamptz` | NO |  |
| `uploaded_at` | `timestamptz` | NO |  |
| `deleted_at` | `timestamptz` | NO |  |
| `metadata_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 101. `IBOT_file_link`

**Purpose:** Generic authorized relationship between a File and a domain entity.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `file_id` | `uuid` | YES |  |
| `entity_type` | `varchar(100)` | YES |  |
| `entity_id` | `uuid` | YES |  |
| `link_type` | `varchar(60)` | NO |  |
| `visibility_scope` | `varchar(30)` | YES |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |

## 102. `IBOT_external_entity_link`

**Purpose:** Stable mapping between internal entities and external Course Platform/Experts Hub/TalentOps/provider entities.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `source_system` | `varchar(100)` | YES |  |
| `external_entity_type` | `varchar(100)` | YES |  |
| `external_entity_id` | `varchar(240)` | YES |  |
| `internal_entity_type` | `varchar(100)` | YES |  |
| `internal_entity_id` | `uuid` | YES |  |
| `sync_status` | `varchar(30)` | NO |  |
| `last_synced_at` | `timestamptz` | NO |  |
| `metadata_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 103. `IBOT_integration_connection`

**Purpose:** Non-secret integration connection/configuration metadata.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO | NULL for platform-wide integration |
| `connection_type` | `varchar(60)` | YES | SMTP, WHATSAPP, PAYMENT, COURSE_PLATFORM, EXPERTS_HUB, TALENTOPS, ASSESSMENT, STORAGE, OTHER |
| `provider_name` | `varchar(100)` | YES |  |
| `display_name` | `varchar(180)` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `is_enabled` | `boolean` | YES |  |
| `configuration_json` | `jsonb` | NO | Never store secrets here |
| `secret_reference` | `varchar(240)` | NO | Reference to secret manager |
| `last_health_check_at` | `timestamptz` | NO |  |
| `last_health_status` | `varchar(30)` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `created_by_person_id` | `uuid` | NO |  |
| `updated_at` | `timestamptz` | YES |  |
| `updated_by_person_id` | `uuid` | NO |  |
| `row_version` | `bigint` | YES |  |

## 104. `IBOT_outbox_event`

**Purpose:** Transactional outbox record for durable domain-event publishing.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `aggregate_type` | `varchar(100)` | YES |  |
| `aggregate_id` | `uuid` | YES |  |
| `event_type` | `varchar(160)` | YES |  |
| `event_version` | `integer` | YES |  |
| `payload_json` | `jsonb` | YES |  |
| `occurred_at` | `timestamptz` | YES |  |
| `status` | `varchar(30)` | YES | PENDING, PROCESSING, PUBLISHED, FAILED |
| `available_at` | `timestamptz` | YES |  |
| `attempt_count` | `integer` | YES | Default 0 |
| `locked_at` | `timestamptz` | NO |  |
| `locked_by` | `varchar(160)` | NO |  |
| `published_at` | `timestamptz` | NO |  |
| `last_error` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 105. `IBOT_inbox_event`

**Purpose:** Idempotent external-event receipt/inbox.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `source_system` | `varchar(100)` | YES |  |
| `external_event_id` | `varchar(240)` | YES |  |
| `event_type` | `varchar(160)` | YES |  |
| `payload_hash` | `varchar(64)` | NO |  |
| `payload_json` | `jsonb` | NO |  |
| `received_at` | `timestamptz` | YES |  |
| `processing_status` | `varchar(30)` | YES | RECEIVED, PROCESSING, PROCESSED, FAILED, IGNORED |
| `processed_at` | `timestamptz` | NO |  |
| `attempt_count` | `integer` | YES | Default 0 |
| `last_error` | `text` | NO |  |

## 106. `IBOT_idempotency_key`

**Purpose:** Duplicate-safe record for client/API mutation requests.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `actor_person_id` | `uuid` | NO |  |
| `idempotency_key` | `varchar(200)` | YES |  |
| `operation_name` | `varchar(160)` | YES |  |
| `request_hash` | `varchar(64)` | NO |  |
| `status` | `varchar(30)` | YES | PROCESSING, COMPLETED, FAILED |
| `response_status_code` | `integer` | NO |  |
| `response_body_json` | `jsonb` | NO |  |
| `resource_type` | `varchar(100)` | NO |  |
| `resource_id` | `uuid` | NO |  |
| `expires_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `completed_at` | `timestamptz` | NO |  |

## 107. `IBOT_audit_event`

**Purpose:** Append-only audit log for sensitive changes and state transitions.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `bigint generated always as identity` | YES | PK; partitionable high-volume key |
| `event_uuid` | `uuid` | YES | Globally unique event id |
| `organization_id` | `uuid` | NO |  |
| `actor_person_id` | `uuid` | NO |  |
| `actor_type` | `varchar(30)` | YES | PERSON, SERVICE, SYSTEM |
| `actor_service` | `varchar(100)` | NO |  |
| `action` | `varchar(160)` | YES |  |
| `target_type` | `varchar(100)` | YES |  |
| `target_id` | `uuid` | NO |  |
| `project_id` | `uuid` | NO |  |
| `project_run_id` | `uuid` | NO |  |
| `before_json` | `jsonb` | NO |  |
| `after_json` | `jsonb` | NO |  |
| `reason` | `text` | NO |  |
| `request_id` | `varchar(100)` | NO |  |
| `correlation_id` | `varchar(100)` | NO |  |
| `ip_address` | `inet` | NO |  |
| `user_agent` | `text` | NO |  |
| `occurred_at` | `timestamptz` | YES |  |

## 108. `IBOT_approval_request`

**Purpose:** Reusable approval workflow container for organization/run/curriculum/commercial/reopen/change approvals.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `approval_type` | `varchar(80)` | YES |  |
| `target_type` | `varchar(100)` | YES |  |
| `target_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES | DRAFT, PENDING, APPROVED, REJECTED, CANCELLED, EXPIRED |
| `requested_by_person_id` | `uuid` | YES |  |
| `requested_at` | `timestamptz` | YES |  |
| `current_step_no` | `integer` | YES | Default 1 |
| `required_steps` | `integer` | YES |  |
| `expires_at` | `timestamptz` | NO |  |
| `context_json` | `jsonb` | NO |  |
| `completed_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 109. `IBOT_approval_step`

**Purpose:** Ordered approval decision in an Approval Request.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `approval_request_id` | `uuid` | YES |  |
| `step_no` | `integer` | YES |  |
| `approver_person_id` | `uuid` | NO |  |
| `approver_role_id` | `uuid` | NO |  |
| `party_side` | `varchar(20)` | NO | ORGANIZATION, OTTOBON |
| `status` | `varchar(30)` | YES |  |
| `decision` | `varchar(30)` | NO | APPROVE, REJECT, REQUEST_CHANGES |
| `comments` | `text` | NO |  |
| `decided_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 110. `IBOT_discussion_comment`

**Purpose:** Threaded review/comment record attached to any versioned domain entity.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `target_type` | `varchar(100)` | YES |  |
| `target_id` | `uuid` | YES |  |
| `parent_comment_id` | `uuid` | NO | Self FK |
| `author_person_id` | `uuid` | YES |  |
| `comment_body` | `text` | YES |  |
| `visibility_scope` | `varchar(30)` | YES | INTERNAL, SHARED, PARTICIPANT |
| `status` | `varchar(30)` | YES | ACTIVE, EDITED, DELETED |
| `created_at` | `timestamptz` | YES |  |
| `edited_at` | `timestamptz` | NO |  |
| `deleted_at` | `timestamptz` | NO |  |

## 111. `IBOT_policy_document`

**Purpose:** Versioned policy/terms/privacy/consent document.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO | NULL for platform-wide policy |
| `policy_type` | `varchar(60)` | YES |  |
| `title` | `varchar(240)` | YES |  |
| `version_label` | `varchar(80)` | YES |  |
| `content_markdown` | `text` | NO |  |
| `content_url` | `text` | NO |  |
| `content_hash` | `varchar(64)` | YES |  |
| `status` | `varchar(30)` | YES | DRAFT, PUBLISHED, RETIRED |
| `effective_from` | `timestamptz` | NO |  |
| `effective_until` | `timestamptz` | NO |  |
| `published_by_person_id` | `uuid` | NO |  |
| `published_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 112. `IBOT_notification_template`

**Purpose:** Versioned event/channel notification template.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO | NULL for platform default |
| `template_key` | `varchar(160)` | YES |  |
| `channel` | `varchar(30)` | YES | IN_APP, EMAIL, WHATSAPP, WEB_PUSH, MOBILE_PUSH |
| `locale` | `varchar(20)` | YES |  |
| `template_name` | `varchar(200)` | YES |  |
| `subject_template` | `text` | NO |  |
| `body_template` | `text` | YES |  |
| `provider_template_id` | `varchar(200)` | NO |  |
| `status` | `varchar(30)` | YES |  |
| `version_no` | `integer` | YES |  |
| `published_at` | `timestamptz` | NO |  |
| `published_by_person_id` | `uuid` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 113. `IBOT_notification`

**Purpose:** Logical in-app/event notification before channel delivery.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `person_id` | `uuid` | YES |  |
| `workspace_id` | `uuid` | NO |  |
| `event_type` | `varchar(160)` | YES |  |
| `title` | `varchar(240)` | YES |  |
| `body_preview` | `text` | NO |  |
| `data_json` | `jsonb` | NO | Deep-link/non-secret presentation payload |
| `priority` | `varchar(20)` | YES |  |
| `status` | `varchar(30)` | YES | CREATED, READ, ARCHIVED, EXPIRED |
| `created_at` | `timestamptz` | YES |  |
| `read_at` | `timestamptz` | NO |  |
| `expires_at` | `timestamptz` | NO |  |

## 114. `IBOT_notification_delivery`

**Purpose:** Per-channel/provider delivery attempt and status.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `notification_id` | `uuid` | YES |  |
| `channel` | `varchar(30)` | YES |  |
| `destination_masked` | `varchar(320)` | NO |  |
| `provider_name` | `varchar(100)` | NO |  |
| `provider_message_id` | `varchar(240)` | NO |  |
| `status` | `varchar(30)` | YES | QUEUED, SENT, DELIVERED, FAILED, CANCELLED |
| `attempt_no` | `integer` | YES |  |
| `queued_at` | `timestamptz` | NO |  |
| `sent_at` | `timestamptz` | NO |  |
| `delivered_at` | `timestamptz` | NO |  |
| `failed_at` | `timestamptz` | NO |  |
| `failure_code` | `varchar(100)` | NO |  |
| `failure_message` | `text` | NO |  |
| `next_retry_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 115. `IBOT_notification_preference`

**Purpose:** Person/channel/event-group notification preference.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `workspace_id` | `uuid` | NO |  |
| `channel` | `varchar(30)` | YES |  |
| `event_group` | `varchar(100)` | YES |  |
| `is_enabled` | `boolean` | YES |  |
| `quiet_hours_json` | `jsonb` | NO |  |
| `locale` | `varchar(20)` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 116. `IBOT_async_job`

**Purpose:** Persistent tracking row for queued long-running work.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `job_type` | `varchar(100)` | YES |  |
| `queue_name` | `varchar(100)` | YES |  |
| `status` | `varchar(30)` | YES | CREATED, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED |
| `requested_by_person_id` | `uuid` | NO |  |
| `resource_type` | `varchar(100)` | NO |  |
| `resource_id` | `uuid` | NO |  |
| `progress_current` | `bigint` | NO |  |
| `progress_total` | `bigint` | NO |  |
| `payload_json` | `jsonb` | NO |  |
| `result_json` | `jsonb` | NO |  |
| `priority` | `integer` | YES |  |
| `attempts` | `integer` | YES | Default 0 |
| `max_attempts` | `integer` | YES |  |
| `queued_at` | `timestamptz` | NO |  |
| `started_at` | `timestamptz` | NO |  |
| `completed_at` | `timestamptz` | NO |  |
| `failed_at` | `timestamptz` | NO |  |
| `last_error` | `text` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |

## 117. `IBOT_import_job`

**Purpose:** Domain tracking for participant/application/marks/etc. imports.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `async_job_id` | `uuid` | YES |  |
| `import_type` | `varchar(80)` | YES |  |
| `target_project_run_id` | `uuid` | NO |  |
| `source_file_id` | `uuid` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `total_rows` | `integer` | YES |  |
| `valid_rows` | `integer` | YES |  |
| `invalid_rows` | `integer` | YES |  |
| `processed_rows` | `integer` | YES |  |
| `duplicate_rows` | `integer` | YES |  |
| `created_records` | `integer` | YES |  |
| `updated_records` | `integer` | YES |  |
| `mapping_json` | `jsonb` | NO |  |
| `started_at` | `timestamptz` | NO |  |
| `completed_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 118. `IBOT_import_error`

**Purpose:** Row/field validation error generated by an Import Job.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `import_job_id` | `uuid` | YES |  |
| `row_number` | `integer` | YES |  |
| `field_name` | `varchar(160)` | NO |  |
| `error_code` | `varchar(100)` | YES |  |
| `error_message` | `text` | YES |  |
| `raw_value` | `text` | NO |  |
| `raw_row_json` | `jsonb` | NO |  |
| `created_at` | `timestamptz` | YES |  |

## 119. `IBOT_support_request`

**Purpose:** Support/operations ticket linked to tenant and optional domain entity.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `workspace_id` | `uuid` | NO |  |
| `requested_by_person_id` | `uuid` | YES |  |
| `category` | `varchar(80)` | YES |  |
| `subject` | `varchar(240)` | YES |  |
| `description` | `text` | YES |  |
| `priority` | `varchar(20)` | YES |  |
| `status` | `varchar(30)` | YES |  |
| `assigned_to_person_id` | `uuid` | NO |  |
| `related_entity_type` | `varchar(100)` | NO |  |
| `related_entity_id` | `uuid` | NO |  |
| `resolved_at` | `timestamptz` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `updated_at` | `timestamptz` | YES |  |
| `row_version` | `bigint` | YES |  |


# 9. Read Models

## 120. `IBOT_learner_catalog_entry`

**Purpose:** Search-optimized learner discovery row, one per discoverable Project Run.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES | UNIQUE |
| `project_canonical_name` | `varchar(240)` | YES |  |
| `run_display_name` | `varchar(260)` | YES |  |
| `organization_display_name` | `varchar(240)` | YES |  |
| `run_status` | `varchar(30)` | YES |  |
| `visibility` | `varchar(30)` | YES |  |
| `application_open_at` | `timestamptz` | NO |  |
| `application_close_at` | `timestamptz` | NO |  |
| `planned_start_at` | `timestamptz` | NO |  |
| `planned_end_at` | `timestamptz` | NO |  |
| `target_participant_count` | `integer` | NO |  |
| `available_capacity` | `integer` | NO | Derived |
| `phase_names_text` | `text` | NO |  |
| `role_names_text` | `text` | NO |  |
| `skill_names_text` | `text` | NO |  |
| `curriculum_names_text` | `text` | NO |  |
| `cohort_names_text` | `text` | NO |  |
| `search_text` | `text` | YES |  |
| `search_vector` | `tsvector` | YES | GIN indexed |
| `rank_boost` | `numeric(12,6)` | YES | Higher for current/active/recent Runs |
| `is_current` | `boolean` | YES |  |
| `rebuilt_at` | `timestamptz` | YES |  |

## 121. `IBOT_global_search_entry`

**Purpose:** Authorized cross-domain search projection for staff experiences.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `workspace_id` | `uuid` | NO |  |
| `organization_id` | `uuid` | NO |  |
| `entity_type` | `varchar(100)` | YES |  |
| `entity_id` | `uuid` | YES |  |
| `title` | `varchar(320)` | YES |  |
| `subtitle` | `text` | NO |  |
| `status` | `varchar(60)` | NO |  |
| `route_path` | `text` | YES |  |
| `search_text` | `text` | YES |  |
| `search_vector` | `tsvector` | YES |  |
| `rank_boost` | `numeric(12,6)` | YES |  |
| `visibility_json` | `jsonb` | NO | Search prefilter metadata; final authorization still server-side |
| `rebuilt_at` | `timestamptz` | YES |  |

## 122. `IBOT_user_action_item`

**Purpose:** Fast read model for a user pending-action dashboard.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `person_id` | `uuid` | YES |  |
| `workspace_id` | `uuid` | YES |  |
| `organization_id` | `uuid` | NO |  |
| `action_type` | `varchar(100)` | YES |  |
| `target_type` | `varchar(100)` | YES |  |
| `target_id` | `uuid` | YES |  |
| `title` | `varchar(300)` | YES |  |
| `due_at` | `timestamptz` | NO |  |
| `priority` | `varchar(20)` | NO |  |
| `status` | `varchar(30)` | YES | OPEN, RESOLVED, DISMISSED |
| `source_event_type` | `varchar(160)` | NO |  |
| `created_at` | `timestamptz` | YES |  |
| `resolved_at` | `timestamptz` | NO |  |
| `updated_at` | `timestamptz` | YES |  |

## 123. `IBOT_run_metrics_current`

**Purpose:** Current Run dashboard aggregate; rebuildable from source tables.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `project_run_id` | `uuid` | YES | PK |
| `organization_id` | `uuid` | YES |  |
| `project_id` | `uuid` | YES |  |
| `total_participants` | `bigint` | YES |  |
| `active_participants` | `bigint` | YES |  |
| `identify_participants` | `bigint` | YES |  |
| `build_participants` | `bigint` | YES |  |
| `operate_participants` | `bigint` | YES |  |
| `transfer_participants` | `bigint` | YES |  |
| `completed_participants` | `bigint` | YES |  |
| `withdrawn_participants` | `bigint` | YES |  |
| `rebuilt_at` | `timestamptz` | YES |  |

## 124. `IBOT_phase_metrics_current`

**Purpose:** Current Run Phase dashboard aggregate.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `run_phase_id` | `uuid` | YES | PK |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `phase_type` | `varchar(20)` | YES |  |
| `total_participants` | `bigint` | YES |  |
| `active_count` | `bigint` | YES |  |
| `completed_count` | `bigint` | YES |  |
| `eligible_count` | `bigint` | YES |  |
| `pending_review_count` | `bigint` | YES |  |
| `handover_pending_count` | `bigint` | YES |  |
| `rebuilt_at` | `timestamptz` | YES |  |

## 125. `IBOT_build_progress_summary`

**Purpose:** Per-participant Build progress read model for dashboards/lists.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `phase_participation_id` | `uuid` | YES | PK |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `cohort_id` | `uuid` | NO |  |
| `curriculum_version_id` | `uuid` | YES |  |
| `total_items` | `integer` | YES |  |
| `completed_items` | `integer` | YES |  |
| `mandatory_items` | `integer` | YES |  |
| `mandatory_completed` | `integer` | YES |  |
| `progress_percent` | `numeric(7,4)` | YES |  |
| `average_score` | `numeric(18,6)` | NO |  |
| `last_activity_at` | `timestamptz` | NO |  |
| `completion_status` | `varchar(30)` | YES |  |
| `rebuilt_at` | `timestamptz` | YES |  |

## 126. `IBOT_run_funnel_metric`

**Purpose:** Historical/current conversion metric between configured stages/phases.

| Column | PostgreSQL Type | Required | Notes |
|---|---|:---:|---|
| `id` | `uuid` | YES |  |
| `organization_id` | `uuid` | YES |  |
| `project_run_id` | `uuid` | YES |  |
| `from_stage_type` | `varchar(40)` | YES |  |
| `from_stage_key` | `varchar(100)` | YES |  |
| `to_stage_type` | `varchar(40)` | YES |  |
| `to_stage_key` | `varchar(100)` | YES |  |
| `population_count` | `bigint` | YES |  |
| `converted_count` | `bigint` | YES |  |
| `conversion_rate` | `numeric(12,8)` | YES | Fraction 0..1 |
| `period_start` | `timestamptz` | NO |  |
| `period_end` | `timestamptz` | NO |  |
| `computed_at` | `timestamptz` | YES |  |


---

# 16. Required uniqueness and integrity rules

The table dictionary defines columns; the following constraints are equally important and MUST be implemented in migrations.

## Identity / IAM

- `IBOT_person_profile(person_id)` UNIQUE.
- `IBOT_person_skill(person_id, skill_id)` UNIQUE.
- `IBOT_auth_identity(provider_name, provider_subject)` UNIQUE when `provider_subject` is present.
- Local login identifiers must be uniquely enforced according to the selected identity policy.
- `IBOT_auth_token(token_hash)` UNIQUE.
- `IBOT_device_registration(person_id, installation_id)` UNIQUE.
- `IBOT_workspace_membership(workspace_id, person_id)` UNIQUE.
- `IBOT_role_permission(role_id, permission_id)` UNIQUE.
- `IBOT_workspace_membership_role(workspace_membership_id, role_id)` UNIQUE for the same effective assignment.
- Global/system roles with `workspace_id IS NULL` require a partial unique index or PostgreSQL `NULLS NOT DISTINCT` strategy so duplicate system role codes cannot exist.

## Organization / Project / Run

- `IBOT_organization(workspace_id)` UNIQUE.
- `IBOT_organization(organization_code)` UNIQUE.
- `IBOT_organization(slug)` UNIQUE.
- `IBOT_organization_setting(organization_id)` UNIQUE.
- `IBOT_project(organization_id, project_code)` UNIQUE.
- `IBOT_project_run(project_id, run_code)` UNIQUE.
- `IBOT_project_run(project_id, sequence_no)` UNIQUE.
- `IBOT_project_blueprint_version(project_blueprint_id, version_no)` UNIQUE.
- `IBOT_project_run_setup_version(project_run_id, version_no)` UNIQUE.
- `IBOT_run_phase(project_run_id, phase_type)` UNIQUE.
- `IBOT_run_phase(project_run_id, sequence_no)` UNIQUE.
- `IBOT_run_phase_config_version(run_phase_id, version_no)` UNIQUE.
- `IBOT_phase_outcome_definition(run_phase_id, outcome_code)` UNIQUE.
- `IBOT_entry_request_version(entry_request_id, version_no)` UNIQUE.
- `IBOT_run_participation(project_run_id, person_id)` UNIQUE unless a later ADR explicitly introduces multiple independent participations by the same person in the same Run.
- `IBOT_run_participation_role(run_participation_id, run_role_requirement_id)` UNIQUE.
- `IBOT_phase_participation(run_phase_id, run_participation_id)` UNIQUE.
- `IBOT_handover_participant(handover_id, run_participation_id)` UNIQUE.

## Identify

- `IBOT_identify_stage_definition(run_phase_id, stage_key)` UNIQUE.
- `IBOT_identify_stage_definition(run_phase_id, sequence_no)` UNIQUE.
- `IBOT_identify_stage_attempt(stage_definition_id, phase_participation_id, attempt_no)` UNIQUE.

## Build

- `IBOT_curriculum(project_id, curriculum_code)` UNIQUE.
- `IBOT_curriculum_version(curriculum_id, version_no)` UNIQUE.
- `IBOT_curriculum_module(curriculum_version_id, module_code)` UNIQUE.
- `IBOT_curriculum_module(curriculum_version_id, sequence_no)` UNIQUE.
- `IBOT_curriculum_item(curriculum_module_id, item_code)` UNIQUE.
- `IBOT_curriculum_item(curriculum_module_id, sequence_no)` UNIQUE.
- `IBOT_cohort(project_run_id, cohort_code)` UNIQUE.
- `IBOT_cohort_membership(cohort_id, run_participation_id)` UNIQUE for active membership.
- `IBOT_activity_group_member(activity_group_id, run_participation_id)` UNIQUE for active membership.
- `IBOT_learning_progress(phase_participation_id, curriculum_item_id)` UNIQUE.
- `IBOT_activity_submission(phase_participation_id, curriculum_item_id, submission_no)` UNIQUE for individual submissions; team submissions additionally validate `activity_group_id` according to activity mode.
- `IBOT_session_attendance(session_id, run_participation_id)` UNIQUE.

## Operate

- `IBOT_operate_engagement(project_run_id, engagement_code)` UNIQUE.
- `IBOT_operate_engagement_participant(engagement_id, run_participation_id)` UNIQUE for active participation.
- `IBOT_work_item_assignee(work_item_id, engagement_participant_id)` UNIQUE.
- `IBOT_work_submission(work_item_id, engagement_participant_id, submission_no)` UNIQUE.
- `IBOT_performance_score(performance_review_id, dimension_code)` UNIQUE.

## Transfer

- Normally one open Transfer case per `(transfer_run_phase_id, run_participation_id)`; enforce with a partial unique index over open states.
- Decision history is append-only after finalization. A correction creates a new `IBOT_transfer_decision` with `supersedes_decision_id`.
- `IBOT_transfer_offer_detail(transfer_decision_id)` UNIQUE where offer data exists.

## Commercial / Finance

- `IBOT_commercial_version` version uniqueness with nullable `project_run_id` must use `NULLS NOT DISTINCT` or separate partial unique indexes for Project-level versus Run-level versions.
- `IBOT_invoice(organization_id, invoice_number)` UNIQUE.
- Provider IDs should be uniquely constrained per provider when present: `(payment_provider, provider_payment_id)`.
- `IBOT_payment.idempotency_key` should be unique within its intended payer/provider/operation scope.
- `IBOT_settlement(settlement_number)` UNIQUE within the relevant financial scope.
- Payment allocations must never exceed the settled/paid amount after reversals; enforce inside one transaction with locking/version checks.

## Platform

- `IBOT_inbox_event(source_system, external_event_id)` UNIQUE.
- `IBOT_idempotency_key(organization_id, idempotency_key, operation_name)` UNIQUE, with a deliberate strategy for `organization_id IS NULL` platform operations.
- `IBOT_external_entity_link(source_system, external_entity_type, external_entity_id)` should be unique for one mapping ownership policy.
- `IBOT_notification_preference` needs a unique policy for `(person_id, workspace_id, channel, event_group)` using `NULLS NOT DISTINCT` or partial indexes when `workspace_id` is NULL.
- `IBOT_learner_catalog_entry(project_run_id)` UNIQUE.

---

# 17. Tenant-safe foreign-key rule

For tenant-owned high-volume data, `organization_id` is deliberately repeated even when derivable from a parent. It improves:

- tenant-scoped query planning;
- authorization-safe repositories;
- partition/index design;
- debugging;
- protection against accidental cross-tenant joins.

For important child relationships, prefer composite tenant validation where practical:

```text
(organization_id, parent_id)
```

must point to a parent owned by the same `organization_id`.

Do not accept a child `organization_id` merely because it was supplied by the frontend. Resolve/validate ownership server-side.

---

# 18. Required indexing strategy

Do NOT add every possible index. Every index increases write cost. Start with indexes that correspond to real access paths and verify them using `EXPLAIN (ANALYZE, BUFFERS)` against representative production-sized data.

## Global pattern

High-volume tenant tables generally require indexes beginning with `organization_id` followed by the dominant parent/filter/status/sort key.

Examples:

```text
IBOT_project_run
  (organization_id, status, planned_start_at DESC)
  (project_id, sequence_no DESC)

IBOT_run_participation
  (organization_id, project_run_id, status, id)
  (organization_id, person_id, created_at DESC)

IBOT_phase_participation
  (organization_id, run_phase_id, status, id)
  (organization_id, run_participation_id)

IBOT_handover
  (organization_id, project_run_id, status, created_at DESC)
  (organization_id, to_run_phase_id, status)

IBOT_entry_request
  (organization_id, project_run_id, status, submitted_at DESC)
  (organization_id, person_id, created_at DESC)

IBOT_learning_progress
  (organization_id, phase_participation_id, status)
  (organization_id, cohort_id, status)

IBOT_operate_engagement_participant
  (organization_id, engagement_id, status)

IBOT_work_item
  (organization_id, engagement_id, status, due_at)

IBOT_invoice
  (organization_id, status, due_date)

IBOT_payment
  (organization_id, status, created_at DESC)

IBOT_audit_event
  (organization_id, occurred_at DESC)
  (target_type, target_id, occurred_at DESC)

IBOT_notification
  (person_id, status, created_at DESC)

IBOT_async_job
  (organization_id, status, created_at DESC)
```

## Learner search

`IBOT_learner_catalog_entry` MUST have:

```text
GIN(search_vector)
(project_run_id) UNIQUE
(run_status, is_current, rank_boost DESC, planned_start_at DESC)
```

Enable `pg_trgm` and add a trigram GIN/GiST index on `search_text` if prefix/partial/typo-tolerant learner search is required (for example `pyth` -> `Python`). Full-text and trigram search can be combined; do not perform live multi-table wildcard joins for each keystroke.

The ranking layer should prefer:

1. active/open/current Runs;
2. exact skill/title matches;
3. upcoming/recent Runs;
4. completed historical Runs only when relevant.

This is how searching `Python` can surface `Hiring Python Full Stack 2027` ahead of the completed 2026 Run without changing historical data.

---

# 19. JSONB rules

## Good uses

Use JSONB for variable structures that are not relationally joined/filterable on every request:

- Run Entry Policy configuration;
- dynamic entry form answers;
- phase-specific configuration;
- rubric definitions/scores when shape is configurable;
- completion/gate rules;
- immutable billing/address/evidence snapshots;
- provider payload summaries;
- low-query branding/settings;
- external integration metadata.

## Bad uses

Do NOT hide these in JSONB:

- `organization_id`;
- `project_id` / `project_run_id`;
- Person/participant relations;
- status;
- role/permission assignments;
- phase ownership;
- cohort memberships;
- money/currency;
- invoice/payment state;
- skill relations used for search/filtering;
- frequently filtered dates;
- Handover participants;
- curriculum module/item ordering;
- core task/review relationships.

Rule:

> If the backend repeatedly needs `WHERE`, `JOIN`, `ORDER BY`, uniqueness, referential integrity or aggregation on a value, make it a typed relational column/table.

---

# 20. Versioning and history strategy

Different history problems use different mechanisms; do not create a generic `history` table for everything.

## Explicit immutable business versions

Use dedicated version tables for:

- `IBOT_project_blueprint_version`;
- `IBOT_project_run_setup_version`;
- `IBOT_run_phase_config_version`;
- `IBOT_curriculum_version`;
- `IBOT_commercial_version`.

Published/approved versions are never destructively rewritten.

## Operational mutation history

For mutable operational entities:

- use `created_by_person_id`, `updated_by_person_id`, timestamps and `row_version`;
- emit `IBOT_audit_event` for sensitive changes/state transitions.

## Final decisions

Final Transfer decisions are append-only. Corrections create a new decision and link through `supersedes_decision_id`.

## Financial history

Never rewrite historical invoices/payments because a billing profile or commercial term changes. Store snapshots/version references.

---

# 21. Concurrency and transaction boundaries

The schema is designed for concurrent users, but correctness depends on transactional service behavior.

The following operations MUST execute inside deliberate database transactions with optimistic/pessimistic controls as appropriate:

- activating/changing a Run setup version;
- starting/completing/reopening a phase;
- accepting/returning/rejecting a Handover;
- creating target `IBOT_phase_participation` rows from an accepted Handover;
- assigning seats where Run/Phase/Cohort capacity can be exceeded;
- final Transfer decisions and corrections;
- publishing Curriculum/Commercial versions;
- payment webhook processing and invoice allocation;
- settlement finalization;
- identity merges.

Use `row_version` to reject stale human writes. Use `SELECT ... FOR UPDATE`/transaction locks only around the narrow records that truly require serialization.

Never keep a database transaction open while waiting for email, WhatsApp, payment provider, file storage, or another external network call. Commit state + `IBOT_outbox_event`, then perform side effects asynchronously.

---

# 22. Pagination rules

Never use unbounded lists.

For large/high-write tables prefer keyset/cursor pagination over deep `OFFSET`:

```text
ORDER BY created_at DESC, id DESC
WHERE (created_at, id) < (:cursor_created_at, :cursor_id)
LIMIT :page_size
```

Suitable for:

- participants;
- entry requests;
- applications/results;
- handovers;
- audit events;
- notifications;
- payments;
- jobs.

`OFFSET` is acceptable for small admin/master lists only.

---

# 23. Connection and scale rules

10,000 concurrent authenticated users MUST NOT translate to 10,000 PostgreSQL connections.

Required production behavior:

- bounded connection pools per API/worker process;
- PgBouncer (or equivalent) when scaling instances;
- API and worker connection budgets planned separately;
- slow-query monitoring;
- queue backpressure so imports/reports cannot exhaust DB connections;
- no N+1 queries;
- no per-row external calls inside database loops;
- query plans tested with realistic multi-million-row datasets.

Scale path:

```text
Primary PostgreSQL
      |
      +-- transactional writes / strongly consistent reads
      |
      +-- optional read replica(s) later for stale-tolerant analytics/read models
```

Do not send authorization-critical or just-written state to an asynchronously lagging replica unless the use case tolerates it.

---

# 24. Partitioning policy

Do NOT partition every table on Day 1. PostgreSQL performs very well with large indexed tables.

Likely first partition candidates after measurements justify it:

- `IBOT_audit_event` by time;
- `IBOT_outbox_event` / `IBOT_inbox_event` by time when very large;
- old notification deliveries/events if retention volume becomes extreme;
- other append-heavy event/log tables only after evidence from query/maintenance metrics.

Core relational entities such as Project, Run, Participant and Curriculum should not be partitioned prematurely.

---

# 25. Bulk import design

A 50k-100k participant import must not be one giant synchronous transaction.

Flow:

```text
IBOT_import_job
   -> async worker
   -> bounded batches
   -> validate/normalize
   -> duplicate-person detection
   -> write valid rows transactionally per batch
   -> IBOT_import_error for failures
   -> update progress
```

Use staging/COPY-based techniques if profiling shows normal batched inserts are insufficient. Never lock interactive participant tables for the full file duration.

---

# 26. Person identity and duplicate handling

`IBOT_person` is the canonical human identity.

Do not silently merge people using email/phone similarity alone. Potential duplicates create/reuse `IBOT_person_merge_case` and preserve source evidence. After an approved merge:

- references are reconciled through controlled services;
- source Person is marked `MERGED` and points to `merged_into_person_id`;
- audit history remains;
- tenant visibility is still enforced at participation/application level.

One Person can participate in multiple Organizations/Runs, but an Organization must not automatically see unrelated participation from another Organization.

---

# 27. Search/read-model rule

Read models are derived and disposable.

Authoritative write:

```text
Project Run / Curriculum / Cohort / Skill / Role changes
       -> transaction + outbox event
       -> read-model worker
       -> refresh IBOT_learner_catalog_entry / other read model
```

If a read model is lost, rebuild it from source tables/events. Do not write business truth only into read models.

Learner discovery must query `IBOT_learner_catalog_entry`, not perform a multi-table live join per search keystroke.

---

# 28. Source-of-truth boundary with existing products

The product requirements allow Course Platform, Experts Hub and TalentOps to remain authoritative execution systems for selected capabilities.

Therefore:

- `IBOT_external_entity_link` maps external to internal context;
- `source_system`, `external_reference`, and evidence references identify ownership;
- the IBOT database may hold a projection/summary needed for business views;
- it must not create an independently editable second authoritative copy.

If future architecture decides IBOT becomes authoritative for a capability, record that change in an ADR before changing write ownership.

---

# 29. Migration ordering notes

Several relationships are intentionally circular convenience pointers, for example:

- `IBOT_project_run.active_setup_version_id` -> setup version;
- `IBOT_curriculum.active_version_id` -> curriculum version;
- `IBOT_project_blueprint.active_version_id` -> blueprint version;
- `IBOT_commercial_model.active_version_id` -> commercial version;
- `IBOT_person_profile.avatar_file_id` -> file.

Create base tables first, then add these foreign keys in later migrations. Do not disable FK integrity permanently to avoid migration ordering work.

---

# 30. Tables intentionally NOT created

The absence of these tables is deliberate:

- separate Candidate / Student / Employee / Intern identity tables - use `IBOT_person` + participation;
- separate Enterprise Project and Academy Project tables - use configuration and organization type;
- one table per Identify stage type - stage-specific rules belong in `IBOT_identify_stage_definition.config_json` while attempts remain relational;
- one table per Transfer outcome - use normalized decision type/outcome;
- separate team-project submission schema - `IBOT_activity_group` + `IBOT_activity_submission` handles individual/team mode;
- separate Export Job - use `IBOT_async_job` with job type EXPORT;
- separate approval tables for every domain - use generic `IBOT_approval_request` / `IBOT_approval_step`, while each domain remains source of truth;
- separate history table for every mutable entity - use explicit version tables where business versions matter and append-only audit elsewhere;
- separate database for Web/PWA/Capacitor - all clients use the same backend/domain database.

This prevents table explosion without collapsing relational truth into JSON.

---

# 31. Agent rules before changing this schema

A coding agent MUST NOT:

1. add a table because it is convenient without checking whether an existing domain table/configuration already models the concept;
2. hide a core searchable relation inside JSONB;
3. split Person into candidate/student/learner duplicates;
4. attach mutable execution fields directly to `IBOT_project` when they belong to `IBOT_project_run`;
5. overwrite old Project Runs;
6. add `current_phase` as authoritative workflow state;
7. automatically move participants between phases without Handover;
8. edit published Curriculum/Commercial/Run Setup versions in place;
9. trust `organization_id` from a client request without authorization/ownership validation;
10. perform unbounded queries;
11. add high-volume indexes without validating query patterns/write cost;
12. store secrets in JSONB/database configuration fields intended for non-secret metadata;
13. store durable uploaded files in PostgreSQL bytea or API local disk unless a specific ADR requires it;
14. delete audit/financial/final-decision history through normal APIs;
15. create duplicate editable truth for data owned by an external execution system.

If implementation needs to violate this document, create an ADR and obtain explicit architecture approval first.

---

# 32. Final table list

1. `IBOT_person`
2. `IBOT_person_profile`
3. `IBOT_person_contact`
4. `IBOT_person_education`
5. `IBOT_person_experience`
6. `IBOT_person_skill`
7. `IBOT_auth_identity`
8. `IBOT_auth_factor`
9. `IBOT_auth_token`
10. `IBOT_auth_session`
11. `IBOT_device_registration`
12. `IBOT_workspace`
13. `IBOT_workspace_membership`
14. `IBOT_workspace_invitation`
15. `IBOT_role`
16. `IBOT_permission`
17. `IBOT_role_permission`
18. `IBOT_workspace_membership_role`
19. `IBOT_person_merge_case`
20. `IBOT_person_policy_acceptance`
21. `IBOT_organization`
22. `IBOT_organization_setting`
23. `IBOT_project`
24. `IBOT_project_blueprint`
25. `IBOT_project_blueprint_version`
26. `IBOT_project_assignment`
27. `IBOT_project_run`
28. `IBOT_project_run_setup_version`
29. `IBOT_skill_catalog`
30. `IBOT_project_role_template`
31. `IBOT_run_role_requirement`
32. `IBOT_run_role_skill_requirement`
33. `IBOT_run_assignment`
34. `IBOT_run_phase`
35. `IBOT_run_phase_config_version`
36. `IBOT_phase_assignment`
37. `IBOT_phase_outcome_definition`
38. `IBOT_run_entry_invitation`
39. `IBOT_entry_request`
40. `IBOT_entry_request_version`
41. `IBOT_entry_request_index_value`
42. `IBOT_run_participation`
43. `IBOT_run_participation_role`
44. `IBOT_phase_participation`
45. `IBOT_evidence_item`
46. `IBOT_handover`
47. `IBOT_handover_participant`
48. `IBOT_identify_stage_definition`
49. `IBOT_identify_stage_attempt`
50. `IBOT_identify_stage_reviewer`
51. `IBOT_curriculum`
52. `IBOT_curriculum_version`
53. `IBOT_curriculum_module`
54. `IBOT_curriculum_item`
55. `IBOT_curriculum_migration`
56. `IBOT_cohort`
57. `IBOT_cohort_membership`
58. `IBOT_cohort_assignment`
59. `IBOT_activity_group`
60. `IBOT_activity_group_member`
61. `IBOT_learning_progress`
62. `IBOT_progression_decision`
63. `IBOT_activity_submission`
64. `IBOT_submission_review`
65. `IBOT_intervention`
66. `IBOT_session`
67. `IBOT_session_assignment`
68. `IBOT_session_attendance`
69. `IBOT_operate_engagement`
70. `IBOT_operate_engagement_participant`
71. `IBOT_supervisor_assignment`
72. `IBOT_work_item`
73. `IBOT_work_item_assignee`
74. `IBOT_work_submission`
75. `IBOT_work_submission_review`
76. `IBOT_performance_review_cycle`
77. `IBOT_performance_review`
78. `IBOT_performance_score`
79. `IBOT_operate_change_request`
80. `IBOT_transfer_case`
81. `IBOT_transfer_review`
82. `IBOT_transfer_decision`
83. `IBOT_transfer_decision_approval`
84. `IBOT_transfer_offer_detail`
85. `IBOT_commercial_model`
86. `IBOT_commercial_version`
87. `IBOT_commercial_component`
88. `IBOT_billing_profile`
89. `IBOT_entitlement`
90. `IBOT_success_fee_case`
91. `IBOT_invoice`
92. `IBOT_invoice_line`
93. `IBOT_payment`
94. `IBOT_payment_allocation`
95. `IBOT_refund`
96. `IBOT_revenue_allocation`
97. `IBOT_settlement`
98. `IBOT_settlement_line`
99. `IBOT_reconciliation_case`
100. `IBOT_file`
101. `IBOT_file_link`
102. `IBOT_external_entity_link`
103. `IBOT_integration_connection`
104. `IBOT_outbox_event`
105. `IBOT_inbox_event`
106. `IBOT_idempotency_key`
107. `IBOT_audit_event`
108. `IBOT_approval_request`
109. `IBOT_approval_step`
110. `IBOT_discussion_comment`
111. `IBOT_policy_document`
112. `IBOT_notification_template`
113. `IBOT_notification`
114. `IBOT_notification_delivery`
115. `IBOT_notification_preference`
116. `IBOT_async_job`
117. `IBOT_import_job`
118. `IBOT_import_error`
119. `IBOT_support_request`
120. `IBOT_learner_catalog_entry`
121. `IBOT_global_search_entry`
122. `IBOT_user_action_item`
123. `IBOT_run_metrics_current`
124. `IBOT_phase_metrics_current`
125. `IBOT_build_progress_summary`
126. `IBOT_run_funnel_metric`

---

# 33. Final count

**Total logical tables in this database baseline: 126.**

This count includes the 7 rebuildable read-model tables and the 2 required local-auth support tables (`IBOT_auth_factor`, `IBOT_auth_token`). It does not count PostgreSQL indexes, sequences, partitions, materialized views, extensions, migration metadata, temporary/staging tables, or tables owned by external systems.
