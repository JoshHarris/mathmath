export type AppScreen = 'home' | 'test' | 'review' | 'practice'

export type Operation = 'addition' | 'subtraction' | 'multiplication' | 'division'

export type ProblemFamily =
  | 'multiplication-single-digit'
  | 'multiplication-double-single'
  | 'multiplication-single-double'
  | 'multiplication-double-double'
  | 'division-single-digit'
  | 'division-double-digit'
  | 'addition-single-digit'
  | 'addition-double-digit'
  | 'addition-triple-digit'
  | 'subtraction-single-digit'
  | 'subtraction-double-digit'
  | 'subtraction-triple-digit'

export interface UserProfile {
  id: string
  name: string
  createdAt: string
  lastActiveAt: string
}

export interface ArithmeticProblem {
  id: string
  left: number
  right: number
  operation: Operation
  family: ProblemFamily
}

export interface TestQuestionRecord extends ArithmeticProblem {
  initialOrder: number
  userAnswer: string
  isCorrect: boolean | null
  wasSkipped: boolean
  skipCount: number
  resolvedOrder: number | null
}

export interface TestSessionRecord {
  id: string
  userId: string
  startedAt: string
  endedAt: string
  configuredTimeLimitSeconds: number
  problemCount: number
  selectedFamilies: ProblemFamily[]
  timeRemainingSeconds: number
  timeSpentSeconds: number
  wasTimedOut: boolean
  answeredCount: number
  correctCount: number
  challengeDigits: number[]
  challengeFamilies: ProblemFamily[]
  questions: TestQuestionRecord[]
}

export interface PracticeProblem extends ArithmeticProblem {
  source: 'challenge-digit' | 'skipped-problem' | 'wrong-problem' | 'family-practice'
  sourceDigit?: number
}

export interface PracticeRunRecord {
  id: string
  userId: string
  completedAt: string
  challengeDigits: number[]
  challengeFamilies: ProblemFamily[]
  sourceSkippedProblems: Array<Pick<PracticeProblem, 'left' | 'right' | 'operation' | 'family'>>
  totalAttempts: number
  longestStreak: number
  cleared: boolean
}

export interface UserStats {
  totalSessions: number
  totalPracticeRuns: number
  bestScore: number
  highestCompletionCount: number
  fastestFullRunSeconds: number | null
  latestChallengeDigits: number[]
  latestChallengeFamilies: ProblemFamily[]
}

export interface StorageAdapter {
  readonly kind: 'indexeddb' | 'localstorage'
  initialize: () => Promise<void>
  getUsers: () => Promise<UserProfile[]>
  saveUser: (user: UserProfile) => Promise<void>
  getTestSessions: (userId: string) => Promise<TestSessionRecord[]>
  saveTestSession: (session: TestSessionRecord) => Promise<void>
  getPracticeRuns: (userId: string) => Promise<PracticeRunRecord[]>
  savePracticeRun: (run: PracticeRunRecord) => Promise<void>
}

export interface TestState {
  sessionId: string
  userId: string
  startedAt: string
  problemCount: number
  selectedFamilies: ProblemFamily[]
  timeLimitSeconds: number
  timeRemainingSeconds: number
  isPaused: boolean
  questions: TestQuestionRecord[]
  remainingQuestionIds: string[]
  resolutionCounter: number
}

export interface PracticeState {
  runId: string
  userId: string
  challengeDigits: number[]
  challengeFamilies: ProblemFamily[]
  skippedProblems: PracticeProblem[]
  pool: PracticeProblem[]
  currentProblem: PracticeProblem
  streak: number
  longestStreak: number
  totalAttempts: number
}
