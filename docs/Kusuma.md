# Kusuma's Tracking File

This file tracks the changes and contributions made by Kusuma for each push to the IBOT platform codebase.

## Log

- **[2026-09-23] Dependency & Environment Setup Hotfix**
  - Resolved npm package installation and lockfile conflicts in `ibot_platform_backend/package.json`.
  - Cleaned up redundant script references to ensure reliable local setup and CI/CD consistency.

- **[2026-09-28] Backend: Implemented Project Run Engine & Extended Prisma Schema**
  - **Prisma Schema & Relational Models:**
    - Expanded `prisma/schema.prisma` with `RunPhase`, `RunPhaseConfigVersion`, and `PhaseAssignment` models.
    - Mapped comprehensive 1:N relations between `ProjectRun` and `RunPhase`, establishing strict phase type tracking (`IDENTIFY`, `BUILD`, `OPERATE`, `TRANSFER`).
    - Defined ownership structures (`ORGANIZATION`, `OTTOBON`, `SHARED`) and config versioning semantics (`RunPhaseConfigVersion`).
  - **Project Service & Controller Extensions:**
    - Updated `src/project/project.controller.ts` with `POST /projects/:id/runs` endpoint for creating project runs.
    - Added `createProjectRun()` service method in `src/project/project.service.ts` featuring auto-increment sequence numbers, custom run code generation (e.g. `PRJ-R1`), default setup versioning (`setupVersions`), and initial journey phase bootstrapping.
    - Extended `getProjectDetails()` to populate run phases, setup versions, and project assignments with associated `Person` records.
  - **TypeScript Configuration:**
    - Adjusted `tsconfig.json` compiler options (`module`: `commonjs`, `moduleResolution`: `node`) to ensure compatibility across NestJS modules.

- **[2026-09-28] Frontend: Implemented Create Project Run Modal & UI Integration**
  - **Interactive Project Run Creation Modal:**
    - Built dynamic "Create Project Run" modal inside `src/pages/organization/OrganizationProjectDetail.tsx`.
    - Implemented interactive phase enabling/disabling selector allowing users to choose custom subsets of journey phases (`IDENTIFY`, `BUILD`, `OPERATE`, `TRANSFER`) per HLD architecture.
    - Added input controls for Display Name, Description, Target Participant Count, Planned Start Date, and Planned End Date with full form state management.
    - Integrated direct API communication (`POST /projects/:id/runs`) sending `enabledPhases` array with asynchronous loading states, validation, and automated run list refresh.
  - **UI Checklist & Zero-State Enhancements:**
    - Linked "Create first Project Run" action item in the project onboarding checklist directly to the creation modal.
    - Provided an empty-state action button on the runs tab to trigger run creation when zero runs exist.
  - **UI Component Refactoring & Flexibility:**
    - Enhanced `src/components/ui/Button.tsx` to support rendering children as node elements in addition to static labels.
    - Updated `OtpInput.tsx`, `CreateAccount.tsx`, `EmailVerification.tsx`, `RegistrationDetails.tsx`, and `SecuritySettings.tsx` for cleaner component interfaces.
  - **Performance & Utilities:**
    - Replaced external heavy `date-fns` calls in `src/pages/organization/OrganizationProjectsList.tsx` with a custom, lightweight `formatTimeAgo()` relative time helper.
  - **TypeScript & Module Support:**
    - Added `src/vite-env.d.ts` for module style declaration support.
    - Configured `tsconfig.app.json` for Vitest and Vite type compatibility while tuning compiler flags.

- **[2026-09-28] Milestone 5 Backend: Manual Phase Handover Engine & Governance Models**
  - **Prisma Schema & Relational Models:**
    - Expanded `prisma/schema.prisma` with `RunParticipation`, `PhaseParticipation`, `Handover`, and `HandoverParticipant` models.
    - Configured foreign key relations linking candidate participations to `ProjectRun` and `RunPhase`.
    - Added handover governance tracking status transitions (`SENT`, `ACCEPTED`, `REJECTED`, `CANCELLED`).
  - **Run Service & Controller:**
    - Created `src/run/run.service.ts` with `getRunDetails()`, `assignPhaseLead()`, `getPhaseDetails()`, `createHandover()`, and `acceptHandover()`.
    - Created `src/run/run.controller.ts` providing REST endpoints: `GET /v1/runs/:id`, `GET /v1/runs/phases/:phaseId`, `POST /v1/runs/phases/:phaseId/assignments`, `POST /v1/runs/handovers`, `POST /v1/runs/handovers/:id/accept`.
    - Registered `RunModule` in `src/app.module.ts`.

- **[2026-09-28] Repository Synchronization**
  - Merged main branch updates across both `ibot_platform_backend` and `ibot_platform_frontend` repositories.
  - Verified working tree clean state and build stability across frontend and backend.

