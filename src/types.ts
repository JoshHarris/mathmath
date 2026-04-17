export type AppScreen = 'home' | 'test' | 'review' | 'practice' | 'adventure' | 'adventure-review'

export type GameMode = 'classic' | 'mermaid-adventure'

export type ThemeId = 'mermaid'

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

export type AdventureEncounterType = 'hazard' | 'boss'

export type AdventureResult = 'victory' | 'timed-out' | 'out-of-hearts' | 'boss-escaped'

export interface AdventureStageSummary {
  stageIndex: number
  stageName: string
  hazardLabel: string
  bossLabel: string
  questionCount: number
  bossHitCount: number
  hazardsDodged: number
  bossHitsLanded: number
  sisterFreed: boolean
  cleared: boolean
}

export interface AdventureSessionSummary {
  result: AdventureResult
  stageCount: number
  sistersFreed: number
  bossesDefeated: number
  hazardsDodged: number
  heartsRemaining: number
  timerEnabled: boolean
  stages: AdventureStageSummary[]
}

export interface AdventureQuestionRecord extends TestQuestionRecord {
  stageIndex: number
  stageName: string
  hazardLabel: string
  bossLabel: string
  sisterName: string
  encounterType: AdventureEncounterType
}

export interface AdventureStage {
  stageIndex: number
  stageName: string
  hazardLabel: string
  bossLabel: string
  sisterName: string
  questionIds: string[]
  bossQuestionIds: string[]
  questionCount: number
  bossHitCount: number
}

export interface TestSessionRecord {
  id: string
  userId: string
  mode?: GameMode
  themeId?: ThemeId
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
  adventureSummary?: AdventureSessionSummary
  questions: TestQuestionRecord[]
}

export interface PracticeProblem extends ArithmeticProblem {
  source: 'challenge-digit' | 'skipped-problem' | 'wrong-problem' | 'family-practice'
  sourceDigit?: number
}

export interface PracticeRunRecord {
  id: string
  userId: string
  mode?: GameMode
  themeId?: ThemeId
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
  mode: GameMode
  themeId?: ThemeId
  challengeDigits: number[]
  challengeFamilies: ProblemFamily[]
  skippedProblems: PracticeProblem[]
  pool: PracticeProblem[]
  currentProblem: PracticeProblem
  streak: number
  longestStreak: number
  totalAttempts: number
}

export interface AdventureState {
  sessionId: string
  userId: string
  mode: 'mermaid-adventure'
  themeId: ThemeId
  startedAt: string
  problemCount: number
  selectedFamilies: ProblemFamily[]
  timerEnabled: boolean
  timeLimitSeconds: number
  timeRemainingSeconds: number
  isPaused: boolean
  heartsRemaining: number
  stages: AdventureStage[]
  questions: AdventureQuestionRecord[]
  currentQuestionIndex: number
  currentStageIndex: number
  bossHeartsRemaining: number
  bossesDefeated: number
  sistersFreed: number
  hazardsDodged: number
  lastResolution: 'idle' | 'dodge' | 'collision' | 'boss-hit'
  isResolving: boolean
}
