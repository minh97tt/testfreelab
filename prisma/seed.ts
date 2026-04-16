import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding TestTree database...')

  // Create demo user
  const hashedPassword = await bcrypt.hash('Aa@123456', 12)
  const user = await prisma.user.upsert({
    where: { email: 'admin@testtree.dev' },
    update: {},
    create: {
      email: 'admin@testtree.dev',
      name: 'Admin Tree',
      password: hashedPassword,
    },
  })
  console.log('✅ Created user:', user.email)

  // Create project
  const project = await prisma.project.create({
    data: {
      name: 'Auth Service',
      version: '2.4.0',
      description: 'Authentication and authorization test suite',
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  })
  console.log('✅ Created project:', project.name)

  // Create folders
  const loginFolder = await prisma.folder.create({
    data: { name: 'Login Flow', description: 'All login-related test cases', projectId: project.id },
  })
  const registerFolder = await prisma.folder.create({
    data: { name: 'Registration', description: 'User registration flows', projectId: project.id },
  })
  const oauthFolder = await prisma.folder.create({
    data: { name: 'OAuth / SSO', parentId: loginFolder.id, projectId: project.id },
  })
  const passwordFolder = await prisma.folder.create({
    data: { name: 'Password Reset', parentId: loginFolder.id, projectId: project.id },
  })
  const apiFolder = await prisma.folder.create({
    data: { name: 'API Endpoints', projectId: project.id },
  })
  console.log('✅ Created folders')

  // Helper to get next TC code
  async function getNextCode() {
    const count = await prisma.testCase.count({ where: { projectId: project.id } })
    return `TC-${String(count + 1).padStart(4, '0')}`
  }

  // Create test cases
  const cases = [
    // Login folder
    {
      folderId: loginFolder.id,
      title: 'User login with valid credentials',
      description: 'Verify that a user can log in with correct email and password.',
      finalExpectation: 'User is authenticated, redirected to dashboard, and receives a valid session cookie.',
      severity: 'CRITICAL',
      type: 'E2E',
      status: 'PASSED',
      steps: [
        { order: 1, action: 'Navigate to /login', expected: 'Login page is displayed' },
        { order: 2, action: 'Enter valid email: demo@testtree.dev', expected: 'Email field is populated' },
        { order: 3, action: 'Enter valid password: password123', expected: 'Password field is masked' },
        { order: 4, action: 'Click Sign In button', expected: 'User is redirected to dashboard' },
      ],
    },
    {
      folderId: loginFolder.id,
      title: 'Login with invalid password',
      description: 'Verify error message when incorrect password is provided.',
      severity: 'HIGH',
      type: 'E2E',
      status: 'PASSED',
      steps: [
        { order: 1, action: 'Navigate to /login', expected: 'Login page is displayed' },
        { order: 2, action: 'Enter valid email', expected: 'Email accepted' },
        { order: 3, action: 'Enter wrong password: wrongpass', expected: 'Password field populated' },
        { order: 4, action: 'Click Sign In', expected: 'Error: "Invalid email or password" is shown' },
      ],
    },
    {
      folderId: loginFolder.id,
      title: 'Login with non-existent email',
      severity: 'MEDIUM',
      type: 'E2E',
      status: 'UNTESTED',
      steps: [
        { order: 1, action: 'Navigate to /login' },
        { order: 2, action: 'Enter unknown@email.com' },
        { order: 3, action: 'Enter any password' },
        { order: 4, action: 'Click Sign In', expected: 'Error message displayed' },
      ],
    },
    {
      folderId: loginFolder.id,
      title: 'Login form validation',
      description: 'Check that form validates email format.',
      severity: 'LOW',
      type: 'UI',
      status: 'PASSED',
      steps: [
        { order: 1, action: 'Enter "notanemail" in email field' },
        { order: 2, action: 'Click Sign In', expected: 'Validation error displayed' },
      ],
    },
    // OAuth subfolder
    {
      folderId: oauthFolder.id,
      title: 'Google OAuth login flow',
      description: 'Verify Google OAuth redirect and callback.',
      severity: 'HIGH',
      type: 'INTEGRATION',
      status: 'UNTESTED',
      steps: [
        { order: 1, action: 'Click "Continue with Google"', expected: 'Redirected to Google OAuth' },
        { order: 2, action: 'Authorize the application', expected: 'Redirected back with code' },
        { order: 3, action: 'Verify user session created', expected: 'User logged in' },
      ],
    },
    // Password reset
    {
      folderId: passwordFolder.id,
      title: 'Request password reset email',
      severity: 'HIGH',
      type: 'MANUAL',
      status: 'FAILED',
      steps: [
        { order: 1, action: 'Navigate to /forgot-password' },
        { order: 2, action: 'Enter registered email', expected: 'Email field validated' },
        { order: 3, action: 'Click Send Reset Link', expected: 'Success message displayed' },
        { order: 4, action: 'Check email inbox', expected: 'Reset email received within 30s' },
      ],
    },
    {
      folderId: passwordFolder.id,
      title: 'Reset password with valid token',
      finalExpectation: 'User can successfully sign in using the newly reset password.',
      severity: 'CRITICAL',
      type: 'E2E',
      status: 'UNTESTED',
      steps: [
        { order: 1, action: 'Click link in reset email' },
        { order: 2, action: 'Enter new password (min 8 chars)' },
        { order: 3, action: 'Confirm new password' },
        { order: 4, action: 'Submit form', expected: 'Password changed, redirected to login' },
      ],
    },
    // Registration
    {
      folderId: registerFolder.id,
      title: 'New user registration — happy path',
      description: 'Complete signup with valid data.',
      severity: 'CRITICAL',
      type: 'E2E',
      status: 'PASSED',
      steps: [
        { order: 1, action: 'Navigate to /register' },
        { order: 2, action: 'Fill all required fields with valid data' },
        { order: 3, action: 'Click Create Account', expected: 'Account created, redirected to projects' },
      ],
    },
    {
      folderId: registerFolder.id,
      title: 'Duplicate email registration',
      severity: 'HIGH',
      type: 'E2E',
      status: 'PASSED',
      steps: [
        { order: 1, action: 'Try to register with existing email' },
        { order: 2, action: 'Submit form', expected: 'Error: "Email already in use"' },
      ],
    },
    {
      folderId: registerFolder.id,
      title: 'Password complexity validation',
      severity: 'MEDIUM',
      type: 'UI',
      status: 'IN_PROGRESS',
      steps: [
        { order: 1, action: 'Enter password shorter than 6 characters' },
        { order: 2, action: 'Submit form', expected: 'Validation error shown' },
      ],
    },
    // API folder
    {
      folderId: apiFolder.id,
      title: 'POST /api/auth/login returns 200',
      description: 'Verify REST API returns correct response.',
      finalExpectation: 'API returns HTTP 200, response payload includes user profile, and session cookie is set.',
      severity: 'CRITICAL',
      type: 'API',
      status: 'PASSED',
      steps: [
        { order: 1, action: 'Send POST /api/auth/login with valid body' },
        { order: 2, action: 'Verify HTTP 200 response' },
        { order: 3, action: 'Verify Set-Cookie header present' },
        { order: 4, action: 'Verify response body contains user data' },
      ],
    },
    {
      folderId: apiFolder.id,
      title: 'POST /api/auth/login returns 401 for bad password',
      severity: 'HIGH',
      type: 'API',
      status: 'PASSED',
      steps: [
        { order: 1, action: 'Send POST /api/auth/login with wrong password' },
        { order: 2, action: 'Verify HTTP 401 response' },
        { order: 3, action: 'Verify error message in body' },
      ],
    },
    // Root test cases (no folder)
    {
      folderId: null,
      title: 'Session cookie expiry after 7 days',
      severity: 'MEDIUM',
      type: 'INTEGRATION',
      status: 'UNTESTED',
      steps: [
        { order: 1, action: 'Log in and note session cookie' },
        { order: 2, action: 'Wait for cookie to expire (skip in test: mock time)', expected: 'Cookie max-age = 604800' },
        { order: 3, action: 'Make authenticated request after expiry', expected: '401 Unauthorized returned' },
      ],
    },
  ]

  for (const tc of cases) {
    const code = await getNextCode()
    await prisma.testCase.create({
      data: {
        code,
        title: tc.title,
        description: tc.description,
        finalExpectation: tc.finalExpectation,
        severity: tc.severity || 'MEDIUM',
        type: tc.type || 'MANUAL',
        status: tc.status || 'UNTESTED',
        projectId: project.id,
        folderId: tc.folderId,
        steps: { create: tc.steps || [] },
      },
    })
  }
  console.log(`✅ Created ${cases.length} test cases`)

  // Create a demo run
  const allCases = await prisma.testCase.findMany({
    where: { projectId: project.id, status: 'PASSED' },
    take: 5,
  })

  if (allCases.length > 0) {
    const run = await prisma.testRun.create({
      data: {
        name: 'Regression Run v2.4.0',
        projectId: project.id,
        userId: user.id,
        status: 'PASSED',
        startedAt: new Date(Date.now() - 1000 * 60 * 15),
        endedAt: new Date(),
        results: {
          create: allCases.map(tc => ({
            testCaseId: tc.id,
            status: 'PASSED',
            duration: Math.floor(Math.random() * 3000) + 500,
          })),
        },
      },
    })
    console.log('✅ Created demo run:', run.name)
  }

  console.log('\n🎉 Seed complete!')
  console.log('   Email:    demo@testtree.dev')
  console.log('   Password: password123')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
