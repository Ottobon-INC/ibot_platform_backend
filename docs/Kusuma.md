# Kusuma's Tracking File

This file tracks the changes and contributions made by Kusuma for each push to the IBOT platform codebase.

## Log

- **[2026-09-23] Dependency & Environment Setup Hotfix**
  - Resolved npm package installation and lockfile conflicts in `ibot_platform_backend/package.json`.
  - Cleaned up redundant script references to ensure reliable local setup and CI/CD consistency.

- **[2026-09-28] Build Environment, DX & Developer Tooling**
  - **Vite Build Stability & OOM Fix:**
    - Fixed native Rolldown/Oxc Rust heap memory allocation crash in `ibot_platform_frontend` by pinning stable Vite version `^6.4.3` in `package.json`.
  - **NestJS Watch Script & Fast Compilation:**
    - Configured `"dev": "nest start -b swc -w"` in backend `package.json` for rapid NestJS recompilation using Nest SWC.
  - **Global Interactivity & Styling:**
    - Added global `cursor: pointer` rules in `index.css` and updated `src/components/ui/Button.tsx` to guarantee hover cursor affordances across all interactive UI components.

- **[2026-09-28] Backend: Milestone 3 & 4 — Dynamic Project Run Engine & Phase Selection**
  - **Prisma Schema & Relational Models:**
    - Expanded `prisma/schema.prisma` with `RunPhase`, `RunPhaseConfigVersion`, and `PhaseAssignment` models.
    - Mapped comprehensive 1:N relations between `ProjectRun` and `RunPhase`, establishing strict phase type tracking (`IDENTIFY`, `BUILD`, `OPERATE`, `TRANSFER`).
    - Defined ownership structures (`ORGANIZATION`, `OTTOBON`, `SHARED`) and config versioning semantics (`RunPhaseConfigVersion`).
  - **Project Service & Controller Extensions:**
    - Updated `src/project/project.controller.ts` with `POST /projects/:id/runs` endpoint for creating project runs.
    - Added `createProjectRun()` service method in `src/project/project.service.ts` featuring auto-increment sequence numbers, custom run code generation (e.g. `PRJ-R1`), default setup versioning (`setupVersions`), and dynamic journey phase bootstrapping per HLD Rule 5 ("Never assume all runs use all phases").
    - Extended `getProjectDetails()` to populate run phases, setup versions, and project assignments with associated `Person` records.

- **[2026-09-28] Milestone 5 Backend: Manual Phase Handover Engine & Governance Models**
  - **Prisma Schema & Relational Models:**
    - Added 4 core Milestone 5 tables to `prisma/schema.prisma`:
      - `RunParticipation` (`IBOT_run_participation`): Tracks candidate run intake.
      - `PhaseParticipation` (`IBOT_phase_participation`): Tracks candidate phase roster memberships and intake source.
      - `Handover` (`IBOT_handover`): Tracks manual phase handover packages (`SENT`, `ACCEPTED`, `REJECTED`, `CANCELLED`).
      - `HandoverParticipant` (`IBOT_handover_participant`): Itemized candidates within a handover package.
    - Configured foreign key relations linking candidate participations to `ProjectRun`, `RunPhase`, and `Person`.
    - Executed `npx prisma generate` generating clean, fully type-safe Prisma Client models.
  - **Run Service & Controller:**
    - Created `src/run/run.service.ts` with methods: `getRunDetails()`, `assignPhaseLead()`, `getPhaseDetails()`, `createHandover()`, and `acceptHandover()`.
    - Created `src/run/run.controller.ts` providing REST API endpoints:
      - `GET /v1/runs/:id`
      - `GET /v1/runs/phases/:phaseId`
      - `POST /v1/runs/phases/:phaseId/assignments`
      - `POST /v1/runs/handovers`
      - `POST /v1/runs/handovers/:id/accept`
    - Registered `RunModule` in `src/app.module.ts`.

- **[2026-09-28] Frontend: Milestone 3, 4 & 5 UI Integration**
  - **Interactive Project Run Creation Modal (Page 97):**
    - Built dynamic "Create Project Run" modal in `OrganizationProjectDetail.tsx`.
    - Implemented interactive phase enabling/disabling selector allowing users to choose custom subsets of journey phases (`IDENTIFY`, `BUILD`, `OPERATE`, `TRANSFER`).
    - Added input controls for Display Name, Description, Target Participant Count, Planned Start/End Dates with full form state management.
    - Rendered dynamic active phase badges (`Identify + Build`) in the runs table and linked run rows to navigate to the Run Dashboard.
  - **Run Execution Dashboard (Page 99 - `OrganizationRunDetail.tsx`):**
    - Built dashboard displaying run header metadata, status badge (`ACTIVE`), target intake, and total participations count.
    - Built Visual Journey Stepper rendering enabled phases (`IDENTIFY` -> `BUILD` -> `OPERATE` -> `TRANSFER`).
    - Built Phase Governance Cards displaying ownership types (`ORGANIZATION`, `OTTOBON`, `SHARED`), assigned Phase Leads, and interactive **Team Lead Assignment** modal (`POST /v1/runs/phases/:phaseId/assignments`).
  - **Phase Workbench & Manual Handover Engine (Page 100 - `RunPhaseDetail.tsx`):**
    - Built Phase Workbench with candidate roster table listing active/completed participations (`PhaseParticipation`).
    - Implemented **Manual Phase Handover Drawer**: select candidates with checkboxes, pick target phase, enter handover title and justification, and send package (`POST /v1/runs/handovers`).
    - Implemented **Handover Intake & Acceptance Drawer**: review incoming handovers and accept candidates into target phase (`POST /v1/runs/handovers/:id/accept`).
  - **Routing & Navigation:**
    - Updated `App.tsx` registering `/org/projects/:projectId/runs/:runId` and `/org/projects/:projectId/runs/:runId/phases/:phaseId`.

- **[2026-09-28] Repository Synchronization**
  - Merged main branch updates across both `ibot_platform_backend` and `ibot_platform_frontend` repositories.
  - Verified working tree clean state and build stability across frontend (`npx tsc --noEmit` code 0) and backend.
