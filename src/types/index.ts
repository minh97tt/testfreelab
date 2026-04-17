export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type TestType = 'E2E' | 'INTEGRATION' | 'API' | 'UI' | 'MANUAL'
export type CaseStatus = 'PASSED' | 'FAILED' | 'UNTESTED' | 'BLOCKED'
export type RunStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'CANCELLED'
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string | null
  createdAt: string
}

export interface Project {
  id: string
  name: string
  version: string
  description?: string | null
  createdAt: string
  updatedAt: string
  _count?: { testCases: number; folders: number; runs: number }
}

export interface Folder {
  id: string
  name: string
  description?: string | null
  projectId: string
  parentId?: string | null
  createdAt: string
  updatedAt: string
  children?: Folder[]
  testCases?: TestCase[]
  _count?: { testCases: number; children: number }
}

export interface Step {
  id: string
  order: number
  action: string
  testCaseId: string
}

export interface StepResult {
  stepId: string
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'UNTESTED'
  actual?: string
}

export interface TestCase {
  id: string
  code: string
  title: string
  description?: string | null
  preconditions?: string | null
  testData?: string | null
  finalExpectation?: string | null
  actualResult?: string | null
  severity: Severity
  type: TestType
  status: CaseStatus
  projectId: string
  folderId?: string | null
  folder?: Folder | null
  archived: boolean
  createdAt: string
  updatedAt: string
  lastExecutedAt?: string | null
  steps?: Step[]
  tags?: { tag: { id: string; name: string } }[]
  results?: RunResult[]
}

export interface TestRun {
  id: string
  name: string
  projectId: string
  userId: string
  status: RunStatus
  startedAt?: string | null
  endedAt?: string | null
  createdAt: string
  updatedAt: string
  user?: Pick<User, 'id' | 'name' | 'avatar'>
  results?: RunResult[]
  _count?: { results: number }
  passRate?: number
}

export interface RunResult {
  id: string
  runId: string
  testCaseId: string
  status: CaseStatus
  duration?: number | null
  error?: string | null
  notes?: string | null
  stepResults?: StepResult[] | null
  executedAt: string
  updatedAt: string
  testCase?: Pick<TestCase, 'id' | 'code' | 'title' | 'severity'>
}

export interface TreeNode {
  type: 'project' | 'folder' | 'case'
  id: string
  data: Project | Folder | TestCase
  children: TreeNode[]
  x?: number
  y?: number
}

// API response wrappers
export interface ApiResponse<T> {
  data: T
  message?: string
}
export interface ApiError {
  error: string
  details?: unknown
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Filters for list view
export interface CaseFilters {
  q?: string
  featureQ?: string
  severity?: Severity | ''
  status?: CaseStatus | ''
  folderId?: string | ''
  type?: TestType | ''
  sortBy?: 'code' | 'title' | 'severity' | 'status' | 'updatedAt'
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
