# TestTree — Production-Grade Test Management App

## Overview

TestTree is a full-stack test case management platform. Engineers organize test cases in a visual tree (by project → feature → test case), view them in a tabular list, and track execution runs — all in real-time. The design is faithful to the 3 Stitch screens delivered.

---

## User Review Required

> [!IMPORTANT]
> **Auth**: The plan uses a **simple email/password + JWT** session stored in a cookie — no OAuth provider required. If you want Google/GitHub OAuth, I can add NextAuth.js.

> [!NOTE]
> The app runs completely locally with `npm run dev`. No Docker, no external services required.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| **Framework** | Next.js 14 (App Router) | File-based routing, Server Actions, API routes all in one |
| **Language** | TypeScript | Type safety end-to-end |
| **Styling** | Tailwind CSS v3 | Matching the Stitch design tokens exactly |
| **Database** | SQLite via Prisma ORM | Zero setup, works on any machine, migrations included |
| **Auth** | `jose` (JWT) + HTTP-only cookie | Lightweight, no external auth provider |
| **Real-time** | Server-Sent Events (SSE) | Live run status updates without WebSocket complexity |
| **UI Icons** | Material Symbols (Google Fonts CDN) | Matches the Stitch design |
| **Fonts** | Plus Jakarta Sans, Inter, Space Grotesk (Google Fonts) | Exact match to Stitch design system |
| **State** | React `useState` + `useReducer` + SWR for data fetching | Simple, no Redux boilerplate |
| **Forms** | React Hook Form + Zod validation | Type-safe forms with schema validation |
| **Animations** | Framer Motion (layout transitions) | Smooth panel open/close, list reorder |
| **Testing** | Vitest + React Testing Library | Fast unit tests for logic |
| **Linting** | ESLint + Prettier | Code quality |

---

## Database Schema (Prisma)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String   // bcrypt hash
  avatar    String?
  createdAt DateTime @default(now())
  projects  ProjectMember[]
  runs      TestRun[]
}

model Project {
  id          String    @id @default(cuid())
  name        String
  version     String    @default("1.0.0")
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  members     ProjectMember[]
  features    Feature[]
}

model ProjectMember {
  id        String  @id @default(cuid())
  user      User    @relation(fields: [userId], references: [id])
  userId    String
  project   Project @relation(fields: [projectId], references: [id])
  projectId String
  role      Role    @default(MEMBER)
  @@unique([userId, projectId])
}

enum Role { OWNER ADMIN MEMBER VIEWER }

model Folder {
  id          String     @id @default(cuid())
  name        String
  description String?
  project     Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId   String
  parent      Folder?    @relation("FolderTree", fields: [parentId], references: [id])
  parentId    String?    // null = root folder
  children    Folder[]   @relation("FolderTree")
  testCases   TestCase[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

// A TestCase belongs to a Folder (for grouping). Can also sit at project root (folderId = null).

model TestCase {
  id          String     @id @default(cuid())
  code        String     // e.g. "TC-4029" - auto-generated per project
  title       String
  description String?
  severity    Severity   @default(MEDIUM)
  type        TestType   @default(MANUAL)
  status      CaseStatus @default(UNTESTED) // derived from last run result
  steps       Step[]
  folder      Folder?    @relation(fields: [folderId], references: [id])
  folderId    String?    // null = root of project (no folder)
  project     Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId   String
  runs        RunResult[]
  tags        Tag[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  archived    Boolean    @default(false)
}

model Step {
  id         String   @id @default(cuid())
  order      Int
  action     String
  expected   String?
  testCase   TestCase @relation(fields: [testCaseId], references: [id], onDelete: Cascade)
  testCaseId String
}

model Tag {
  id    String     @id @default(cuid())
  name  String     @unique
  cases TestCase[]
}

enum Severity   { CRITICAL HIGH MEDIUM LOW }
enum TestType   { E2E INTEGRATION API UI MANUAL }
enum CaseStatus { PASSED FAILED UNTESTED IN_PROGRESS }

model TestRun {
  id        String      @id @default(cuid())
  name      String
  project   Project     @relation(fields: [projectId], references: [id])  // via Feature
  // Store projectId denormalized for easy querying
  projectId String
  status    RunStatus   @default(QUEUED)
  startedAt DateTime?
  endedAt   DateTime?
  createdBy User        @relation(fields: [userId], references: [id])
  userId    String
  results   RunResult[]
  createdAt DateTime    @default(now())
}

model RunResult {
  id         String     @id @default(cuid())
  run        TestRun    @relation(fields: [runId], references: [id], onDelete: Cascade)
  runId      String
  testCase   TestCase   @relation(fields: [testCaseId], references: [id])
  testCaseId String
  status     CaseStatus
  duration   Int?       // ms
  error      String?    // failure message
  stepResults Json?     // [{stepId, status, actual}]
  executedAt DateTime   @default(now())
}

enum RunStatus { QUEUED RUNNING PASSED FAILED CANCELLED }
```

---

## API Design (Next.js Route Handlers)

### Authentication
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → set JWT cookie |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/me` | Current user |

### Projects
| Method | Route | Description |
|---|---|---|
| GET | `/api/projects` | List projects for current user |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/[id]` | Get project + tree |
| PATCH | `/api/projects/[id]` | Update project |
| DELETE | `/api/projects/[id]` | Delete project |

### Features (Tree Nodes)
| Method | Route | Description |
|---|---|---|
| GET | `/api/projects/[id]/features` | Get full nested tree |
| POST | `/api/projects/[id]/features` | Create feature |
| PATCH | `/api/features/[id]` | Rename / reparent |
| DELETE | `/api/features/[id]` | Delete feature + children |

### Test Cases
| Method | Route | Description |
|---|---|---|
| GET | `/api/projects/[id]/cases` | List cases (with filters) |
| POST | `/api/projects/[id]/cases` | Create test case |
| GET | `/api/cases/[id]` | Get case details + steps |
| PATCH | `/api/cases/[id]` | Update case |
| DELETE | `/api/cases/[id]` | Delete (soft → archive) |

### Runs
| Method | Route | Description |
|---|---|---|
| GET | `/api/projects/[id]/runs` | List runs |
| POST | `/api/projects/[id]/runs` | Create & queue run |
| GET | `/api/runs/[id]` | Run details + results |
| PATCH | `/api/runs/[id]` | Update run (cancel) |
| GET | `/api/runs/[id]/stream` | **SSE** — live run progress |

---

## Frontend Architecture

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, global styles)
│   ├── page.tsx                  # Redirect → /login or /projects
│   ├── login/page.tsx            # Login page
│   ├── register/page.tsx         # Register page
│   └── projects/
│       ├── page.tsx              # Projects list
│       ├── new/page.tsx          # Create project
│       └── [projectId]/
│           ├── layout.tsx        # App shell (sidebar + topnav)
│           ├── tree/page.tsx     # 🌳 Tree View (Stitch Screen 1 & 2)
│           ├── list/page.tsx     # 📋 List View (Stitch Screen 3)
│           └── runs/
│               ├── page.tsx      # Runs dashboard
│               └── [runId]/page.tsx  # Run detail
│
├── components/
│   ├── layout/
│   │   ├── TopNav.tsx
│   │   ├── Sidebar.tsx
│   │   └── MobileBottomNav.tsx
│   ├── tree/
│   │   ├── TreeCanvas.tsx        # Dotted canvas + SVG bezier lines
│   │   ├── RootNode.tsx
│   │   ├── FeatureNode.tsx
│   │   ├── TestCaseNode.tsx
│   │   └── DetailPanel.tsx       # Right slide-in panel
│   ├── list/
│   │   ├── CasesTable.tsx
│   │   ├── CaseRow.tsx
│   │   ├── ListDetailPanel.tsx
│   │   ├── FilterBar.tsx
│   │   └── Pagination.tsx
│   ├── runs/
│   │   ├── RunsTable.tsx
│   │   ├── RunCard.tsx
│   │   ├── LiveRunProgress.tsx   # SSE subscriber
│   │   └── StatsCards.tsx
│   ├── modals/
│   │   ├── CreateCaseModal.tsx
│   │   ├── EditCaseModal.tsx
│   │   └── CreateFeatureModal.tsx
│   └── ui/                       # Reusable design system atoms
│       ├── Badge.tsx
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Select.tsx
│       ├── Modal.tsx
│       ├── Toast.tsx
│       └── Spinner.tsx
│
├── lib/
│   ├── prisma.ts                 # Prisma client singleton
│   ├── auth.ts                   # JWT sign/verify helpers
│   ├── middleware.ts             # Route protection
│   └── utils.ts                 # cn(), formatDate(), etc.
│
├── hooks/
│   ├── useProject.ts            # SWR data hooks
│   ├── useCases.ts
│   ├── useRun.ts
│   └── useRunStream.ts          # SSE hook for live run updates
│
└── types/
    └── index.ts                 # Shared TypeScript types
```

---

## Key Interactions & Full Functionality

### Tree View
- **Drag to reparent** — drag a feature node onto another feature to reparent
- **Add Feature** — click `+` on a feature → modal → POST `/api/features`
- **Add Test Case** — click `+` on a feature node → modal with title, severity, steps
- **Click TC card** → right detail panel slides in with steps, history chart, Run button
- **Run a test case** → POST `/api/runs` with single case → SSE streams progress to history chart
- **Zoom / pan** the canvas (CSS transform + mouse drag)

### List View
- **Sort by column** (ID, title, severity, status)
- **Filter** severity + status live (client-side debounce + server re-fetch)
- **Search** — real-time search hitting `/api/cases?q=...`
- **Edit / Delete** — row actions → modal → PATCH/DELETE
- **Click row** → right detail panel (no Run button per Stitch design)
- **Export CSV** — client-side `Blob` download of current filtered set
- **Pagination** — server cursor pagination

### Runs View
- **Start Run** button → select feature or all cases → POST `/api/runs`
- **Live progress bar** — SSE stream updates each case result in real-time
- **Cancel run** — PATCH `/api/runs/[id]` `{status: CANCELLED}`
- **Run history** with date filter

### Auth
- Register → login → JWT in HTTP-only cookie (7-day expiry)
- Middleware protects all `/projects/**` routes
- `/api/auth/me` returns current user for header avatar

---

## Proposed Changes

### New Files/Directories

Everything will be scaffolded fresh inside the existing `/Users/tongthienminh/dev/testfree/` workspace:

#### [NEW] `testtree/` — Next.js project root
- `prisma/schema.prisma` — Full schema above
- `prisma/seed.ts` — Sample data (users, projects, features, test cases, runs)
- `src/app/...` — All pages
- `src/components/...` — All components
- `src/lib/...` — Utilities
- `src/hooks/...` — SWR hooks
- `tailwind.config.ts` — Full design token config matching Stitch palette
- `.env.local` — DATABASE_URL + JWT_SECRET (generated locally)
- `package.json` — All dependencies

---

## Open Questions

> [!IMPORTANT]
> **1. Database preference**: Use **SQLite** (zero setup, fully local) or **PostgreSQL** (production-ready, needs pg running)?

> [!IMPORTANT]
> **2. Auth preference**: **Email/password** (simpler) or add **Google OAuth** via NextAuth.js?

> [!NOTE]
> **3. Run execution model**: "Test Run" in this app = marking each test case pass/fail manually (like TestRail) OR do you want it to actually execute code/scripts (like a real CI runner)? 
> - **Manual execution**: Engineer opens a run, marks each step pass/fail via the UI ← *default plan*
> - **Script execution**: Each test case has a script path, the server forks a child process to run it ← *more complex*

> [!NOTE]
> **4. Project subfolder**: Should the Next.js app be created at `/Users/tongthienminh/dev/testfree/testtree/` (new subfolder) or replace the current directory contents?

---

## Verification Plan

### Automated
- `npx prisma db push` — validates schema
- `npm run build` — TypeScript compile check
- Seed script creates demo data verifiable via UI

### Manual
- Open `http://localhost:3000` → lands on login
- Register → create project → add features + test cases → tree view renders with bezier lines
- List view shows table with filters + detail panel
- Start a test run → SSE updates run status live
- Mobile responsive — bottom nav works on narrow viewport
