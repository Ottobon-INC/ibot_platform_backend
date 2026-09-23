````md
# Ottobon IBOT Platform
# High-Level Architecture Design

Version: 2.0  
Status: Architecture Baseline  
Audience: Product Engineering, Architecture, Developers, AI Coding Agents  
Primary Goal: Build a configurable, multi-tenant, production-grade IBOT platform delivered simultaneously as:

1. Web Application
2. Progressive Web App (PWA)
3. Native Mobile Application using Capacitor

The platform must initially support at least 1,000 concurrent authenticated users and scale horizontally without redesigning the core product architecture.

---

# 1. Purpose

This document is the architectural contract for the Ottobon IBOT Platform.

Any developer, LLM, coding agent, or reviewer working on the repository MUST read this document before making architectural changes.

This HLD defines:

- product/domain boundaries;
- Organization / Project / Project Run architecture;
- IBOT phase architecture;
- frontend architecture;
- PWA architecture;
- Capacitor mobile architecture;
- shared web/mobile code strategy;
- backend architecture;
- multi-tenancy;
- authentication;
- authorization;
- database ownership;
- caching;
- background processing;
- notifications;
- file handling;
- offline behavior;
- integrations;
- commercial/payment architecture;
- scaling;
- reliability;
- deployment;
- observability;
- non-negotiable engineering rules.

This HLD intentionally does NOT define:

- every database column;
- every API payload;
- every UI component;
- every permission combination;
- every validation rule;
- every phase state transition.

Those belong in the supporting architecture documents.

---

# 2. Product Delivery Model

Ottobon is delivered through three client experiences backed by the same platform.

```text
                        OTTOBON PLATFORM

                              API
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼

      Web App                PWA              Mobile App
 React + TypeScript   React + Service      React + Capacitor
                          Worker             Android / iOS
````

All three clients MUST use the same backend APIs and the same core business rules.

There must NOT be:

```text
web business logic
mobile business logic
PWA business logic
```

implemented separately.

Instead:

```text
SHARED PRODUCT LOGIC
        │
        ├── Web Shell
        ├── PWA Capabilities
        └── Capacitor Native Shell
```

---

# 3. Core Architecture Principle

The product must follow:

> One product, one domain model, one API platform, multiple client shells.

Web, PWA, and Capacitor Mobile are distribution channels.

They are NOT separate products.

---

# 4. Core Terminology

The following terminology MUST remain consistent throughout:

```text
Organization
Organization Member
Person
Project
Project Blueprint
Project Run
Journey
Phase
Phase Ownership
Phase Assignment
Participant
Run Participation
Phase Participation
Cohort
Curriculum
Curriculum Version
Handover
Commercial Model
Commercial Version
```

Do not introduce alternative architectural terms without an ADR.

---

# 5. Organization

An Organization is a tenant.

Organization types may include:

```text
ENTERPRISE
ACADEMY
```

An Organization may have:

```text
Members
Projects
Project Runs
Participants
Commercials
Payments
Reports
Settings
```

Tenant isolation is mandatory.

---

# 6. Individual Workspace

An Individual may have a personal workspace.

Individual experiences may include:

```text
Discover
Apply
Enroll
Learn
Participate
Pay
View Status
View Evidence
```

The Individual client uses the same identity and platform services.

---

# 7. Person

Person is the canonical human identity.

Do NOT permanently model separate identities such as:

```text
Candidate
Student
Learner
Employee
Intern
```

These are contextual participation labels.

Core:

```text
Person
   ↓
Run Participation
   ↓
Phase Participation
```

---

# 8. Project

Project is a long-lived reusable business initiative.

Example:

```text
Graduate Talent Project
AI Engineer Development Project
Employee Upskilling Project
```

Project itself does not represent one execution.

---

# 9. Project Run

Project Run is one execution of the Project.

Example:

```text
Graduate Talent Project

Run 1: Sep 2026
Run 2: Jan 2027
Run 3: Apr 2027
```

Every Run may have different:

```text
Journey
Participants
Dates
Ownership
Teams
Curriculum
Cohorts
Phase Rules
Commercials
Capacity
```

Historical Runs must remain immutable except through controlled corrections/versioning.

---

# 10. Journey

Journey is the enabled IBOT sequence for a Project Run.

Possible examples:

```text
Identify

Build

Operate

Transfer

Identify → Build

Build → Operate

Operate → Transfer

Identify → Build → Transfer

Build → Operate → Transfer

Identify → Build → Operate → Transfer
```

A Project does NOT have one permanent Journey.

Journey belongs to the Run.

---

# 11. IBOT Phases

The four phases are:

```text
IDENTIFY
BUILD
OPERATE
TRANSFER
```

Each phase is an independent engine.

Every phase follows:

```text
Input Contract
      ↓
Activities
      ↓
Rules
      ↓
Evidence
      ↓
Completion Policy
      ↓
Outcome
      ↓
Eligible Pool
```

No phase may technically require another phase to exist.

---

# 12. Phase Independence

All of these must work:

```text
Bulk Import
    ↓
Build
```

```text
Existing Interns
    ↓
Operate
```

```text
Existing Candidates
    ↓
Transfer
```

Never assume:

```text
Identify must exist before Build
Build must exist before Operate
Operate must exist before Transfer
```

---

# 13. Phase Ownership

Every enabled phase has party ownership:

```text
ORGANIZATION
OTTOBON
SHARED
```

Ownership answers:

> Which party operates this phase?

Ownership does NOT identify the individual human operator.

---

# 14. Phase Assignment

Humans are assigned separately.

Example:

```text
Build Ownership:
OTTOBON

Build Lead:
Sampath
```

Changing the Build Lead must not change Build data.

Assignments are versioned/auditable responsibilities.

---

# 15. Manual Phase Handover

Participants MUST NOT automatically move between phases.

Example:

```text
Identify
80 Qualified

      ↓

Authorized Identify Lead
selects 25

      ↓

Handover

      ↓

Build Owner reviews

      ↓

Accept

      ↓

Build Intake
```

Handover is a first-class domain object.

---

# 16. High-Level Client Architecture

The recommended client architecture is:

```text
                     Shared React Application
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼

   Browser Web             PWA Mode          Capacitor Mobile
       │                      │                     │
       │                 Service Worker             │
       │                 Installable App            │
       │                                            │
       │                                      Native Bridge
       │                                            │
       └─────────────────────┬──────────────────────┘
                             │
                       Shared API Client
                             │
                             ▼
                        Backend APIs
```

---

# 17. Frontend Technology

Use:

```text
React
TypeScript
Vite
Tailwind CSS
TanStack Query
React Hook Form
Zod
Capacitor
PWA Service Worker
```

The UI must be responsive from the beginning.

---

# 18. Frontend Repository Strategy

Maintain two main product repositories:

```text
ottobon-platform-frontend
ottobon-platform-backend
```

The frontend repository contains:

```text
Web
PWA
Capacitor Android
Capacitor iOS
```

Do NOT create separate duplicated frontend applications unless an ADR explicitly justifies it.

---

# 19. Frontend Repository Structure

Recommended:

```text
ottobon-platform-frontend/

├── src/
│   ├── app/
│   ├── routing/
│   ├── layouts/
│   │
│   ├── platform/
│   │   ├── browser/
│   │   ├── pwa/
│   │   └── capacitor/
│   │
│   ├── auth/
│   ├── permissions/
│   │
│   ├── organizations/
│   ├── projects/
│   ├── project-runs/
│   ├── participants/
│   │
│   ├── identify/
│   ├── build/
│   ├── operate/
│   ├── transfer/
│   │
│   ├── curriculum/
│   ├── cohorts/
│   ├── handovers/
│   │
│   ├── commercials/
│   ├── payments/
│   ├── reports/
│   ├── notifications/
│   ├── settings/
│   │
│   ├── api/
│   ├── storage/
│   ├── sync/
│   ├── hooks/
│   ├── components/
│   ├── utils/
│   └── types/
│
├── public/
│
├── android/
├── ios/
│
├── capacitor.config.*
├── vite.config.*
└── pwa configuration
```

---

# 20. Shared Frontend Rule

Business functionality must live in shared React feature modules.

Example:

```text
src/build/
src/identify/
src/operate/
src/transfer/
```

Do NOT implement:

```text
src/mobile-build/
src/web-build/
src/pwa-build/
```

unless the code is purely presentation/platform specific.

---

# 21. Platform Adapter Layer

Platform-specific capabilities must be behind adapters.

Example:

```text
NotificationAdapter

WebNotificationAdapter
PWANotificationAdapter
CapacitorNotificationAdapter
```

Similarly:

```text
StorageAdapter
CameraAdapter
FilePickerAdapter
NetworkAdapter
DeepLinkAdapter
ShareAdapter
```

Feature modules should depend on the abstraction.

Not directly on Capacitor plugins.

---

# 22. Example Platform Boundary

BAD:

```text
BuildModule
   ↓
Capacitor Camera Plugin
```

GOOD:

```text
BuildModule
   ↓
FileCaptureService
   ↓
Platform Adapter
      ├── Browser File Picker
      └── Capacitor Camera/File Picker
```

---

# 23. Web Application

The browser application is the full desktop/web experience.

Primary target:

```text
Organization Owner
Ottobon Admin
Project Lead
Finance
Commercial Team
Large-table operational users
```

Desktop supports:

```text
large dashboards
large tables
bulk operations
complex setup/configuration
reports
commercial management
admin operations
```

---

# 24. PWA Architecture

The web application must also support installation as a Progressive Web App.

PWA provides:

```text
Installable Application
Standalone Window
Service Worker
Asset Caching
Offline Shell
Web Push where supported
Background Update Detection
```

PWA must use the same frontend application.

---

# 25. PWA Service Worker

The Service Worker may cache:

```text
HTML shell
JS/CSS bundles
icons
fonts
static assets
selected safe GET responses
```

Do NOT blindly cache all authenticated API responses.

Sensitive data caching must be intentional.

---

# 26. PWA Offline Policy

PWA offline support should initially be:

```text
Application shell available
Previously loaded safe content may be visible
Offline indicator displayed
Critical writes disabled or queued only when explicitly supported
```

Do NOT pretend an action succeeded while offline unless the feature has an explicit sync architecture.

---

# 27. Critical Offline Actions

The following should NOT initially behave as successful offline mutations:

```text
Transfer Decision
Payment Confirmation
Commercial Approval
Phase Completion
Handover Acceptance
Permission Change
Curriculum Publication
Organization Approval
```

These require authoritative server confirmation.

---

# 28. Offline Read Strategy

Selected non-sensitive data may use:

```text
Network First
with safe cached fallback
```

Static content may use:

```text
Cache First
```

Critical dynamic business state uses:

```text
Network First / Server Required
```

---

# 29. PWA Update Strategy

When a new frontend version is available:

```text
Service Worker detects update
        ↓
Notify user
        ↓
"New version available"
        ↓
User reloads safely
```

Do not silently refresh during:

```text
Assessment
Payment
Form submission
Critical decision
```

---

# 30. Capacitor Mobile Architecture

Capacitor packages the shared React frontend as native:

```text
React
  ↓
Vite Build
  ↓
Capacitor
  ├── Android
  └── iOS
```

Capacitor is a native shell.

It does NOT create a second backend.

---

# 31. Capacitor Mobile Responsibilities

Capacitor enables controlled access to:

```text
Push Notifications
Camera
File Picker
Native Share
Secure Storage
Network Status
Deep Links
App Lifecycle
Biometrics later if required
Download / File Open
```

Business logic remains shared.

---

# 32. Native Platform Adapter

Native APIs must be isolated.

Example:

```text
Platform Services
│
├── Notifications
├── Secure Storage
├── Files
├── Camera
├── Network
├── Deep Links
└── App Lifecycle
```

These services expose common interfaces to feature modules.

---

# 33. Mobile UI Architecture

Mobile should not simply shrink desktop screens.

Use a systematic responsive translation.

Desktop:

```text
Sidebar
Large Tables
Multi-column layouts
Detailed configuration screens
```

Mobile:

```text
Bottom Navigation
Drill-down routes
Cards / simplified lists
Bottom Sheets
Single-column forms
Condensed actions
```

Data and business rules remain identical.

---

# 34. Mobile Navigation

Typical authenticated mobile navigation:

```text
Home
Projects / My Work
Actions
Notifications
You
```

Role-specific content may change.

Do not hard-code mobile navigation solely by role name.

Navigation comes from effective capabilities.

---

# 35. Mobile Administrative Scope

Complex administration may remain optimized for desktop.

Example:

```text
Platform infrastructure configuration
Huge report exports
Complex curriculum restructuring
Large participant bulk operations
Complex finance reconciliation
```

Mobile may provide:

```text
view
review
approve
quick action
monitoring
```

where practical.

The API does not restrict these operations based purely on device type.

---

# 36. Authentication Across Clients

There is one identity system.

But authentication transport may differ by client platform.

Logical architecture:

```text
                     Identity Service
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼

          Web             PWA          Capacitor
```

Authentication implementation must remain OIDC/OAuth2-ready.

---

# 37. Web/PWA Session Security

For browser-based clients, prefer secure browser session mechanisms.

Requirements:

```text
Secure cookies where architecture permits
HttpOnly
Secure
SameSite
CSRF protection where required
Session expiry
Session revocation
```

Exact authentication implementation is finalized in the Security Architecture.

---

# 38. Capacitor Authentication

Native application authentication must use a mobile-safe approach.

Do NOT store credentials or long-lived sensitive tokens in:

```text
localStorage
plain Preferences
unencrypted files
```

Sensitive mobile credentials/tokens must use secure native storage.

Future enterprise SSO should use standards such as:

```text
OIDC
OAuth2
PKCE
```

---

# 39. Workspace Resolution

After authentication:

```text
Identity
   ↓
Available Workspaces
   ↓
Organization / Ottobon / Individual
   ↓
Effective Permissions
   ↓
Dashboard
```

Same behavior across:

```text
Web
PWA
Capacitor
```

---

# 40. Deep Links

The platform must support canonical deep links.

Examples:

```text
/project/{id}
/project-run/{id}
/handover/{id}
/assessment/{id}
/invoice/{id}
```

On web:

```text
Open browser route
```

On mobile:

```text
Universal/App Link
      ↓
Capacitor
      ↓
Correct native route
```

Notifications should deep-link to the exact relevant item.

---

# 41. Push Notification Architecture

Notification domain:

```text
Domain Event
     ↓
Notification Rule
     ↓
Notification Job
     ↓
Channel Router
```

Supported channels:

```text
IN_APP
EMAIL
WHATSAPP
WEB_PUSH
MOBILE_PUSH
```

---

# 42. Mobile Push

Mobile push should use platform services through a notification provider/adaptor.

Logical flow:

```text
Backend
   ↓
Push Provider Adapter
   ↓
Android / iOS Push
   ↓
Capacitor App
```

Device tokens must be linked to:

```text
Person
Device
Client Platform
Workspace context where applicable
```

---

# 43. Device Registration

Maintain device registration separately from the Person.

Example:

```text
Device Registration

person_id
device_id
platform
push_token
app_version
last_seen_at
revoked_at
```

A user may have:

```text
Laptop
PWA installation
Android Phone
iPhone
```

simultaneously.

---

# 44. Notification Preferences

Notification preferences are channel-specific.

Example:

```text
In-App      ON
Email       ON
WhatsApp    OFF
Web Push    ON
Mobile Push ON
```

Organization-level policies may also apply.

---

# 45. App Version Compatibility

Mobile applications cannot always update immediately.

Therefore APIs must support a compatibility window.

Backend changes must not unnecessarily break older mobile clients.

Use:

```text
/api/v1
```

and version contracts intentionally.

---

# 46. Minimum Mobile Version

Backend/configuration may define:

```text
minimum_supported_mobile_version
recommended_mobile_version
```

If client is too old:

```text
Block unsupported app version
Show upgrade required
```

For non-breaking older versions:

```text
Show optional update
```

---

# 47. Capacitor Release Strategy

Web/PWA and native mobile releases are different.

Web:

```text
Deploy frontend
→ immediately available
```

Native:

```text
Build Android/iOS
→ test
→ sign
→ store distribution
→ user updates
```

Architecture must account for this difference.

---

# 48. Native Code Change Rule

Anything requiring new native capabilities/plugins requires a native app release.

Pure web-bundle changes may follow the approved Capacitor update strategy.

Do not design critical architecture around bypassing app-store rules.

---

# 49. Client Storage Architecture

Use a storage abstraction.

```text
ClientStorage
│
├── Browser/PWA Storage Adapter
└── Capacitor Storage Adapter
```

Possible data categories:

```text
Non-sensitive UI preferences
Safe cached data
Draft form state
Device registration information
Authentication material
```

Each category gets an explicit security policy.

---

# 50. Sensitive Client Storage

Never store unencrypted sensitive business data casually on devices.

Especially:

```text
Passwords
Payment secrets
Private keys
Full sensitive participant datasets
Long-lived tokens
```

Mobile secure storage must be used for sensitive authentication material.

---

# 51. Offline Mutation Architecture

Offline writes are NOT globally enabled.

Any feature wanting offline mutation must explicitly define:

```text
Local Command
Unique Client Command ID
Created At
Expected Resource Version
Sync State
Retry Behavior
Conflict Strategy
```

Without this contract, the action remains online-only.

---

# 52. Sync States

If an offline-capable feature is introduced:

```text
LOCAL_PENDING
SYNCING
SYNCED
FAILED
CONFLICT
```

The user must be able to tell whether the server has accepted the action.

---

# 53. Conflict Handling

Never silently resolve critical conflicts.

Example:

```text
Mobile offline edit
        ↓
Server record changed
        ↓
Reconnect
        ↓
Conflict detected
        ↓
User / domain-specific resolution
```

Critical decisions must remain server-authoritative.

---

# 54. Network State

Both PWA and Capacitor should expose:

```text
ONLINE
OFFLINE
UNSTABLE
```

where technically detectable.

UI should clearly display offline conditions.

---

# 55. File Upload Architecture

All clients use the same file API architecture.

```text
Client
   ↓
Request upload authorization
   ↓
Backend validates tenant / permission
   ↓
Signed upload / controlled upload
   ↓
Object Storage
   ↓
File metadata stored
```

Large files should not unnecessarily pass through API memory.

---

# 56. Mobile Camera Upload

Example:

```text
Participant
   ↓
Take Photo
   ↓
Capacitor Camera Adapter
   ↓
File Validation
   ↓
Upload
   ↓
Object Storage
```

The Build/Operate module only sees a File reference.

It does not depend on Capacitor.

---

# 57. Download/File Viewing

Web:

```text
Browser Viewer / Download
```

Mobile:

```text
Native file/open/share adapter
```

Authorization remains server-side.

---

# 58. Backend Architecture Style

Backend uses:

# Modular Monolith

Initial backend is one deployable application with strict domain modules.

Do NOT prematurely create separate services for:

```text
Identify
Build
Operate
Transfer
Curriculum
Commercials
```

unless proven necessary.

---

# 59. Backend Technology

```text
Node.js
TypeScript
NestJS
Fastify
PostgreSQL
Redis
BullMQ
S3-compatible Object Storage
```

---

# 60. Backend Modules

```text
identity
authentication

organizations
memberships
authorization

projects
project-runs
project-blueprints

participants
run-participations

journey
phases
phase-assignments
handovers

identify

build
curriculum
cohorts
assessments

operate

transfer

commercials
billing
payments
settlements

notifications
devices

files

integrations

reporting

audit

jobs

cache

platform-admin
```

---

# 61. Module Boundaries

Modules communicate through:

```text
Application Services
Domain Interfaces
Domain Events
```

Do NOT directly manipulate another module's persistence from unrelated modules.

---

# 62. Transactional Outbox

Important domain events must use a Transactional Outbox.

```text
Transaction
│
├── Business State Change
└── Outbox Event
```

Workers publish/process events after commit.

This prevents lost events.

---

# 63. Project Run Lifecycle

```text
DRAFT
  ↓
CONFIGURING
  ↓
READY_FOR_REVIEW
  ↓
APPROVED
  ↓
READY / SCHEDULED
  ↓
ACTIVE
  ↓
COMPLETED
  ↓
CLOSED
```

Alternative states:

```text
ON_HOLD
CANCELLED
```

---

# 64. Phase Status

Each phase has independent state:

```text
NOT_STARTED
READY
ACTIVE
ON_HOLD
COMPLETED
CANCELLED
```

Multiple phases may be active simultaneously.

Therefore NEVER make:

```text
run.current_phase
```

the only phase state.

---

# 65. Identify

Identify is a configurable selection engine.

Possible activities:

```text
Application
Eligibility
Manual Review
Online MCQ
Online Assessment
Offline Assessment
Manual Marks
External Assessment
Interview
Panel Interview
Random Selection
Shortlisting
```

The pipeline is configuration-driven.

---

# 66. Build

Build supports:

```text
SELF_PACED
COHORT_BASED
HYBRID
```

Possible activities:

```text
Learning Content
Modules
Lessons
Assessments
Assignments
Projects
Live Sessions
Expert Sessions
Attendance
Interventions
```

---

# 67. Build Progression

Supported models:

```text
OPEN
SEQUENTIAL
MANUAL_APPROVAL
ASSESSMENT_GATED
RULE_BASED
HYBRID
```

---

# 68. Curriculum Versioning

Curriculum is versioned.

```text
Curriculum
├── V1
├── V2
└── V3
```

Published curriculum versions are immutable.

Changes create new versions.

---

# 69. Curriculum Governance

Capabilities:

```text
CURRICULUM_EDITOR
CURRICULUM_REVIEWER
CURRICULUM_PUBLISHER
```

Lifecycle:

```text
DRAFT
 ↓
REVIEW
 ↓
APPROVED
 ↓
PUBLISHED
 ↓
ARCHIVED
```

---

# 70. Operate

Operate handles structured real-world work.

Possible engagements:

```text
Internship
Live Project
Client Assignment
Work Simulation
Apprenticeship
Trial Engagement
```

---

# 71. Transfer

Transfer manages evidence-based final decisions.

Possible outcomes:

```text
HIRE
EXTEND_OPERATE
OFFER_NOW_JOIN_LATER
NOT_SELECTED
WITHDRAWN
ON_HOLD
```

Transfer remains independently executable.

---

# 72. Commercial Architecture

Commercial models:

```text
CLIENT_FUNDED
PARTICIPANT_FUNDED
REVENUE_SHARE
SUCCESS_FEE
HYBRID
SPONSORED
```

Commercials remain separate from Journey execution.

---

# 73. Billing Architecture

```text
Commercial Model
       ↓
Billing Trigger
       ↓
Invoice
       ↓
Payment
       ↓
Revenue Allocation
       ↓
Settlement
       ↓
Reconciliation
```

---

# 74. PostgreSQL

PostgreSQL is authoritative for transactional business data.

Requirements:

```text
Tenant-aware schema
Indexed common access paths
Bounded queries
Connection pooling
Concurrency protection
Version-controlled migrations
```

---

# 75. Redis

Redis may be used for:

```text
Caching
BullMQ
Rate limit counters
Short-lived coordination
```

Redis is never authoritative for critical state.

---

# 76. Cache Aside

```text
Request
   ↓
Redis
   ↓ miss
PostgreSQL
   ↓
Cache
   ↓
Response
```

Database updates happen before cache invalidation.

---

# 77. Background Jobs

Use BullMQ/worker processing for:

```text
Bulk Import
Large Export
Notifications
Heavy Reports
Payment Reconciliation
Settlements
File Processing
Integration Sync
```

---

# 78. Object Storage

Files belong in independently scalable object storage.

Do NOT depend on:

```text
API local disk
frontend filesystem
mobile local storage
```

as the durable source of uploaded documents.

---

# 79. API Architecture

Versioned REST API:

```text
/api/v1
```

All clients use the same API contracts.

Examples:

```text
/api/v1/projects
/api/v1/project-runs
/api/v1/participants
/api/v1/handovers
/api/v1/curricula
/api/v1/payments
```

---

# 80. API Client Package

Frontend should use one centralized API client.

Feature modules should not scatter raw HTTP calls throughout components.

Architecture:

```text
React Feature
     ↓
Domain Query/Mutation Hook
     ↓
API Client
     ↓
Backend
```

---

# 81. Pagination

All high-volume lists must use bounded pagination.

Never request:

```text
all participants
all applications
all payments
all audit events
```

at once.

Server-side:

```text
filtering
sorting
pagination
```

is mandatory for large lists.

---

# 82. Reporting

Heavy analytics should move toward:

```text
Transactional Tables
       ↓
Read Models / Aggregation
       ↓
Cache
       ↓
Dashboard
```

Do not calculate multi-million-row dashboards on every request.

---

# 83. Multi-Tenancy

Tenant isolation applies to:

```text
API
Database Queries
Search
Files
Exports
Cache
Background Jobs
Notifications
Reports
Integrations
```

Never rely on frontend tenant filtering.

---

# 84. Authorization

Effective permission is derived from:

```text
Person
+
Workspace
+
Organization Membership
+
Project Assignment
+
Run Assignment
+
Phase Assignment
+
Action
```

Role name alone is insufficient.

---

# 85. Audit

Audit sensitive operations:

```text
Organization Approval
Membership Changes
Permission Changes
Project Lead Change
Phase Lead Change
Phase Ownership
Run Activation
Phase Start
Phase Completion
Handover
Override
Curriculum Publication
Commercial Approval
Payment Verification
Transfer Decision
```

---

# 86. Observability

Monitor:

```text
API request rate
API latency
error rate
CPU
RAM
DB connections
DB query latency
slow queries
Redis health
queue depth
worker utilization
failed jobs
push failures
email failures
WhatsApp failures
payment failures
integration health
app versions
```

---

# 87. Client Telemetry

Web/PWA/Mobile should report safe telemetry such as:

```text
client type
app version
platform
route
API error category
crash/error identifier
performance timing
```

Never log sensitive participant information unnecessarily.

---

# 88. Mobile Crash Monitoring

Native mobile releases require crash monitoring.

Capture:

```text
App Version
OS Version
Device Type
Crash Stack
Safe User/Session Identifier
Correlation ID where available
```

---

# 89. PWA Monitoring

Monitor:

```text
Service Worker Version
Update Failures
Offline Usage
Cache Errors
Push Subscription Failures
```

---

# 90. Runtime Deployment

```text
                         USERS
                           │
                      CDN / DNS
                           │
             ┌─────────────┴─────────────┐
             │                           │
             ▼                           ▼

       Web / PWA Assets              Backend API
          CDN/Host                 NestJS/Fastify
                                          │
                    ┌─────────────────────┼────────────────────┐
                    ▼                     ▼                    ▼
                PostgreSQL              Redis               Queue
                                                             │
                                                             ▼
                                                          Workers
                                                             │
                              ┌──────────────────────────────┼────────────┐
                              ▼                              ▼            ▼
                        Notifications                  Integrations    Reports
                              │
                         ┌────┴─────┐
                         ▼          ▼
                      Web Push   Mobile Push

Capacitor Mobile
       │
       └──────────────── HTTPS ───────────────► Backend API
```

---

# 91. Initial KVM4 Deployment

Initial cost-conscious deployment may be:

```text
KVM4
│
├── Reverse Proxy
├── Backend API
├── Worker
├── PostgreSQL
└── Redis

External:
├── Frontend/PWA Hosting or CDN
├── Object Storage
└── Push/External Providers
```

Frontend assets do not need to consume significant backend compute.

---

# 92. Horizontal Scaling

Future:

```text
                       Load Balancer
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
         API #1           API #2           API #3
                            │
                       PostgreSQL
                            │
                          Redis
                            │
                          Queue
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
         Worker #1       Worker #2       Worker #3
```

Mobile and PWA continue using the same API endpoint.

---

# 93. Stateless Backend

Backend correctness must never depend solely on process memory.

No API process should uniquely hold:

```text
session state
workflow state
tenant context
critical jobs
participant state
```

Any request must be processable by any healthy API instance.

---

# 94. Performance Goal

Initial product design target:

```text
>= 1,000 concurrent authenticated users
```

Architecture should scale further without changing the domain model.

Representative API targets:

```text
Normal API p95 <= 500 ms
Normal API p99 <= 1.5 s
First list page p95 <= 1 second
Initial dashboard p95 <= 2 seconds
```

Heavy workloads remain asynchronous.

---

# 95. Mobile Performance Requirements

Mobile-specific requirements:

```text
Lazy-loaded feature bundles
Avoid massive initial JS payload
Paginated lists
Image compression before upload where appropriate
Progressive data loading
Avoid unnecessary polling
Cache safe reference data
Handle unstable mobile networks
```

---

# 96. PWA Performance Requirements

PWA-specific:

```text
Cache static application shell
Version static assets
Lazy-load routes
Avoid over-caching dynamic API data
Display stale/offline state explicitly
```

---

# 97. Load Testing

Backend load testing must simulate all client types collectively.

Example:

```text
600 Web/PWA Sessions
400 Mobile Sessions

Total:
1,000 Concurrent Authenticated Users
```

Test realistic workflows:

```text
Login
Dashboard
Participant Listing
Run Overview
Assessments
Build Progress
Handovers
Notifications
Payments
```

---

# 98. Security

Mandatory:

```text
TLS
Secure Authentication
MFA for privileged users
Server-side authorization
Tenant isolation
Rate limiting
Input validation
Secure headers
Secret management
Session/token revocation
Secure file handling
Audit logging
```

---

# 99. Mobile Security

Additional native considerations:

```text
Secure credential storage
No secrets hard-coded in app bundle
Certificate/transport security
Sensitive screen handling where justified
Root/jailbreak detection only if risk justifies it
Device/session revocation
```

Never assume the mobile binary is trusted.

All authorization remains backend-enforced.

---

# 100. Public Client Rule

Anything shipped to:

```text
Browser JS
PWA Bundle
Android APK/AAB
iOS Application
```

must be considered inspectable by users.

Therefore NEVER embed:

```text
DB credentials
private API secrets
payment secrets
server signing keys
admin secrets
```

inside client applications.

---

# 101. Secrets

Secrets live server-side through environment/secret-management mechanisms.

---

# 102. Environments

Maintain:

```text
Development
Staging / UAT
Production
```

Mobile should also support environment-specific builds.

Example:

```text
Ottobon Dev
Ottobon Staging
Ottobon Production
```

with clearly separated backend endpoints/configuration.

---

# 103. CI/CD — Web/PWA

```text
Commit
  ↓
Lint
  ↓
Type Check
  ↓
Tests
  ↓
Build Web/PWA
  ↓
Deploy Staging
  ↓
E2E
  ↓
Production Deploy
```

---

# 104. CI/CD — Capacitor

```text
Commit / Release Tag
       ↓
Shared Frontend Tests
       ↓
Web Build
       ↓
Capacitor Sync
       ↓
Android Build
       ↓
iOS Build
       ↓
Native Tests
       ↓
Signing
       ↓
Internal Distribution
       ↓
Store Release
```

---

# 105. Shared Versioning

Track separately:

```text
Frontend Web Version
PWA Service Worker Version
Android Version
iOS Version
Backend API Version
```

All client errors/telemetry should report their version.

---

# 106. Backward Compatibility

Because users may not upgrade mobile immediately:

Backend must preserve compatible API behavior within the supported mobile version window.

Breaking API changes require:

```text
new API version
or
coordinated migration
```

---

# 107. Failure Philosophy

Assume:

```text
Mobile loses internet
PWA goes offline
Redis fails
Worker crashes
Push provider fails
Email fails
WhatsApp fails
Payment provider fails
External integration fails
```

Failure of one component must not corrupt unrelated business state.

---

# 108. Mobile Network Failure

Example:

```text
User submits critical action
        ↓
Network disappears
        ↓
Client cannot confirm server result
```

Client must NOT simply display success.

Use:

```text
Pending / Unknown
        ↓
Reconnect
        ↓
Query authoritative server state
```

---

# 109. Idempotency

Critical client mutations must support retry safety.

Especially important on mobile networks.

Use idempotency for:

```text
Payment initiation
Handover actions
Critical submissions
Assessment submission where appropriate
File completion
Integration callbacks
```

---

# 110. Non-Goals

Do NOT turn this platform into:

```text
HRMS
Payroll
Generic ERP
Accounting ERP
Generic Project Management Tool
Public Job Marketplace
```

without explicit product/architecture approval.

---

# 111. Agent / Developer Non-Negotiable Rules

Any coding agent MUST follow these.

## Rule 1

Do not create separate duplicated business implementations for Web, PWA, and Mobile.

---

## Rule 2

Shared React/domain client logic is the default.

Platform-specific behavior goes behind adapters.

---

## Rule 3

Never put business security exclusively in the client.

---

## Rule 4

Never trust the native mobile app more than the web browser.

Backend authorization remains authoritative.

---

## Rule 5

Never assume all Project Runs use all IBOT phases.

---

## Rule 6

Never assume Identify exists before Build.

---

## Rule 7

Never automatically move participants between phases.

Use Handovers.

---

## Rule 8

Never use one `current_phase` field as the only Run phase state.

---

## Rule 9

Never hard-code Organization/client-specific business behavior.

---

## Rule 10

Never destructively modify published Curriculum Versions.

---

## Rule 11

Never destructively modify approved Commercial Versions.

---

## Rule 12

Never use Redis as transactional truth.

---

## Rule 13

Never execute large imports/exports/reports synchronously.

---

## Rule 14

Never return unbounded lists to any client, including Mobile.

---

## Rule 15

Never store durable files on API local disk.

---

## Rule 16

Never store server secrets in frontend/mobile bundles.

---

## Rule 17

Never store sensitive authentication secrets in insecure mobile/browser storage.

---

## Rule 18

Never claim an offline mutation succeeded until the server confirms it, unless an explicit offline-sync domain contract exists.

---

## Rule 19

Never directly use Capacitor plugins throughout business feature components.

Use platform adapters.

---

## Rule 20

Never break supported mobile API clients without an API-version or migration strategy.

---

## Rule 21

Never silently overwrite business states after retry/network reconnection.

Use idempotency/concurrency control.

---

## Rule 22

Every architecture deviation requires an ADR.

---

# 112. Architecture Decision Records

Recommended ADRs:

```text
docs/adr/

0001-modular-monolith.md
0002-postgresql-source-of-truth.md
0003-redis-cache-and-queue.md
0004-project-run-model.md
0005-independent-ibot-phases.md
0006-manual-phase-handover.md
0007-curriculum-versioning.md
0008-commercial-versioning.md
0009-multi-tenant-authorization.md
0010-background-job-processing.md

0011-shared-react-client.md
0012-pwa-delivery.md
0013-capacitor-native-shell.md
0014-client-platform-adapter-layer.md
0015-mobile-authentication.md
0016-offline-policy.md
0017-push-notification-architecture.md
0018-mobile-api-compatibility.md
```

---

# 113. Supporting Documents

This HLD should be accompanied by:

```text
DOMAIN_MODEL.md

STATE_MACHINES.md

AUTHORIZATION_MATRIX.md

DATABASE_DESIGN.md

API_CONTRACTS.md

EVENT_CATALOG.md

CLIENT_PLATFORM_ARCHITECTURE.md

PWA_OFFLINE_STRATEGY.md

MOBILE_CAPACITOR_ARCHITECTURE.md

COMMERCIAL_PAYMENT_ARCHITECTURE.md

SECURITY_ARCHITECTURE.md

DEPLOYMENT_ARCHITECTURE.md

PERFORMANCE_TEST_PLAN.md

MODULE_LLD/
```

---

# 114. Final Logical Architecture

```text
                         OTTOBON CLIENTS

          ┌──────────────────┬──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼

        Web                 PWA          Capacitor Mobile
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                    Shared React Features
                             │
                    Shared API Client
                             │
                             ▼
                    Backend API Platform
                             │
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
        PostgreSQL         Redis          Job Queue
                                                │
                                                ▼
                                             Workers
                                                │
                       ┌────────────────────────┼──────────────┐
                       ▼                        ▼              ▼
                 Notifications             Integrations     Reports
                       │
               ┌───────┼────────┐
               ▼       ▼        ▼
             Email   WhatsApp  Push

                             +
                       Object Storage
```

Domain architecture:

```text
Organization
      ↓
Project
      ↓
Project Run
      ↓
Journey
      ↓
Independent Run Phases
      │
 ┌────┼─────┬──────┐
 ▼    ▼     ▼      ▼

 I    B     O      T

      ↓
Phase Outcomes
      ↓
Eligible Pool
      ↓
Human Selection
      ↓
Handover
      ↓
Receiving Phase
```

---

# 115. Final Scalability Principle

Today:

```text
1 KVM4
1 API
1 Worker
1 PostgreSQL
1 Redis

Web + PWA
Capacitor Android/iOS
```

Future:

```text
CDN

Load Balancer
     │
 ┌───┼───┐
 ▼   ▼   ▼
API API API

Dedicated PostgreSQL
Read Replicas

Dedicated Redis

Multiple Worker Pools

Dedicated Reporting

Object Storage

Push Infrastructure

Web/PWA CDN

Android / iOS Distribution
```

The core:

```text
Organization
Project
Project Run
IBOT
Participants
Curriculum
Cohorts
Handovers
Commercials
Payments
```

must not require redesign as infrastructure grows.

---

# 116. Final Architectural Principle

The platform is intentionally designed as:

> One backend platform + one shared React product codebase + three delivery experiences: Web, PWA, and Capacitor Mobile.

The system should scale by:

```text
adding API instances
adding workers
increasing database capacity
introducing read models
separating infrastructure
adding CDN/cache capacity
```

rather than by:

```text
rewriting the product
creating separate mobile business logic
creating customer-specific code
splitting IBOT into unnecessary early microservices
```

When implementation and this HLD conflict:

1. a newer approved ADR takes precedence;
2. otherwise this HLD defines the intended architecture;
3. agents must not silently deviate;
4. unclear architectural decisions must be raised before implementation.

````

### Most important change

For your case, I would **not build “Web App + PWA + Mobile App” as three codebases**.

Build:

```text
                  ONE React Codebase
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
          Web           PWA       Capacitor
````

That decision alone will save you a huge amount of duplicated development, testing, bug fixing, and long-term maintenance while still allowing the mobile app to use native features when needed.
