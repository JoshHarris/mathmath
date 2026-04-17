import type {
  ArithmeticProblem,
  AdventureSessionSummary,
  GameMode,
  Operation,
  PracticeProblem,
  PracticeRunRecord,
  ProblemFamily,
  TestQuestionRecord,
  TestSessionRecord,
  ThemeId,
  UserStats,
} from '../types'

const DIGITS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

export const DEFAULT_TEST_FAMILIES: ProblemFamily[] = ['multiplication-single-digit']

export const FAMILY_GROUPS: Array<{ label: string; families: ProblemFamily[] }> = [
  {
    label: 'Multiplication',
    families: [
      'multiplication-single-digit',
      'multiplication-double-single',
      'multiplication-single-double',
      'multiplication-double-double',
    ],
  },
  {
    label: 'Division',
    families: ['division-single-digit', 'division-double-digit'],
  },
  {
    label: 'Addition',
    families: ['addition-single-digit', 'addition-double-digit', 'addition-triple-digit'],
  },
  {
    label: 'Subtraction',
    families: ['subtraction-single-digit', 'subtraction-double-digit', 'subtraction-triple-digit'],
  },
]

export const FAMILY_LABELS: Record<ProblemFamily, string> = {
  'multiplication-single-digit': 'Single-digit multiplication',
  'multiplication-double-single': 'Double-digit × single-digit multiplication',
  'multiplication-single-double': 'Single-digit × double-digit multiplication',
  'multiplication-double-double': 'Double-digit multiplication',
  'division-single-digit': 'Single-digit division',
  'division-double-digit': 'Double-digit division',
  'addition-single-digit': 'Single-digit addition',
  'addition-double-digit': 'Double-digit addition',
  'addition-triple-digit': 'Triple-digit addition',
  'subtraction-single-digit': 'Single-digit subtraction',
  'subtraction-double-digit': 'Double-digit subtraction',
  'subtraction-triple-digit': 'Triple-digit subtraction',
}

export function createId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `${prefix}-${randomPart}`
}

function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function pickOne<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0]
}

function createProblem(left: number, right: number, operation: Operation, family: ProblemFamily): ArithmeticProblem {
  return {
    id: createId('problem'),
    left,
    right,
    operation,
    family,
  }
}

export function getOperatorSymbol(operation: Operation): string {
  switch (operation) {
    case 'addition':
      return '+'
    case 'subtraction':
      return '−'
    case 'multiplication':
      return '×'
    case 'division':
      return '÷'
  }
}

export function formatProblem(problem: Pick<ArithmeticProblem, 'left' | 'right' | 'operation'>): string {
  return `${problem.left} ${getOperatorSymbol(problem.operation)} ${problem.right}`
}

export function getCorrectAnswer(problem: Pick<ArithmeticProblem, 'left' | 'right' | 'operation'>): number {
  switch (problem.operation) {
    case 'addition':
      return problem.left + problem.right
    case 'subtraction':
      return problem.left - problem.right
    case 'multiplication':
      return problem.left * problem.right
    case 'division':
      return problem.left / problem.right
  }
}

export function normalizeAnswer(answer: string): string {
  return answer.replace(/\s+/g, '')
}

export function isAnswerCorrect(
  problem: Pick<ArithmeticProblem, 'left' | 'right' | 'operation'>,
  answer: string,
): boolean {
  return normalizeAnswer(answer) !== '' && Number(normalizeAnswer(answer)) === getCorrectAnswer(problem)
}

function generateByFamily(family: ProblemFamily, random: () => number): ArithmeticProblem {
  switch (family) {
    case 'multiplication-single-digit':
      return createProblem(pickOne(DIGITS, random), pickOne(DIGITS, random), 'multiplication', family)
    case 'multiplication-double-single':
      return createProblem(randomInt(10, 99, random), pickOne(DIGITS, random), 'multiplication', family)
    case 'multiplication-single-double':
      return createProblem(pickOne(DIGITS, random), randomInt(10, 99, random), 'multiplication', family)
    case 'multiplication-double-double':
      return createProblem(randomInt(10, 99, random), randomInt(10, 99, random), 'multiplication', family)
    case 'division-single-digit': {
      const divisor = randomInt(1, 9, random)
      const quotient = random() < 0.15 ? 0 : randomInt(1, 9, random)
      return createProblem(divisor * quotient, divisor, 'division', family)
    }
    case 'division-double-digit': {
      const useDoubleDigitDivisor = random() < 0.45
      const divisor = useDoubleDigitDivisor ? randomInt(10, 99, random) : randomInt(2, 9, random)
      const quotient = randomInt(1, 9, random)
      return createProblem(divisor * quotient, divisor, 'division', family)
    }
    case 'addition-single-digit':
      return createProblem(randomInt(0, 9, random), randomInt(0, 9, random), 'addition', family)
    case 'addition-double-digit': {
      const left = random() < 0.4 ? randomInt(0, 9, random) : randomInt(10, 99, random)
      const right = random() < 0.4 ? randomInt(0, 9, random) : randomInt(10, 99, random)
      return createProblem(left, right, 'addition', family)
    }
    case 'addition-triple-digit': {
      const left = random() < 0.35 ? randomInt(10, 99, random) : randomInt(100, 999, random)
      const right = random() < 0.35 ? randomInt(10, 99, random) : randomInt(100, 999, random)
      return createProblem(left, right, 'addition', family)
    }
    case 'subtraction-single-digit': {
      const left = randomInt(0, 9, random)
      const right = randomInt(0, left, random)
      return createProblem(left, right, 'subtraction', family)
    }
    case 'subtraction-double-digit': {
      const left = random() < 0.4 ? randomInt(10, 99, random) : randomInt(0, 99, random)
      const right = randomInt(0, left, random)
      return createProblem(left, right, 'subtraction', family)
    }
    case 'subtraction-triple-digit': {
      const left = random() < 0.35 ? randomInt(100, 999, random) : randomInt(10, 999, random)
      const right = randomInt(0, left, random)
      return createProblem(left, right, 'subtraction', family)
    }
  }
}

export function generateRandomProblems(
  count: number,
  families: ProblemFamily[],
  random: () => number = Math.random,
): TestQuestionRecord[] {
  const activeFamilies = families.length > 0 ? families : DEFAULT_TEST_FAMILIES

  return Array.from({ length: count }, (_, index) => {
    const family = pickOne(activeFamilies, random)
    const problem = generateByFamily(family, random)

    return {
      ...problem,
      initialOrder: index + 1,
      userAnswer: '',
      isCorrect: null,
      wasSkipped: false,
      skipCount: 0,
      resolvedOrder: null,
    }
  })
}

export function moveProblemToQueueEnd(questionIds: string[], activeId: string): string[] {
  if (questionIds.length <= 1) {
    return questionIds
  }

  return [...questionIds.filter((id) => id !== activeId), activeId]
}

export function getChallengeDigits(questions: TestQuestionRecord[]): number[] {
  const counts = new Map<number, number>()

  questions
    .filter(
      (question) =>
        question.operation === 'multiplication' &&
        question.family === 'multiplication-single-digit' &&
        question.userAnswer !== '' &&
        question.isCorrect === false,
    )
    .forEach((question) => {
      const uniqueDigits = new Set([question.left, question.right])
      uniqueDigits.forEach((digit) => {
        counts.set(digit, (counts.get(digit) ?? 0) + 1)
      })
    })

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => a[0] - b[0])
    .map(([digit]) => digit)
}

export function getChallengeFamilies(questions: TestQuestionRecord[]): ProblemFamily[] {
  return [...new Set(questions.filter((q) => q.userAnswer !== '' && q.isCorrect === false).map((q) => q.family))]
}

export function getSkippedQuestions(questions: TestQuestionRecord[]): TestQuestionRecord[] {
  return questions.filter((question) => question.skipCount > 0)
}

function problemKey(problem: Pick<ArithmeticProblem, 'left' | 'right' | 'operation' | 'family'>): string {
  return `${problem.operation}:${problem.family}:${problem.left}:${problem.right}`
}

function toPracticeProblem(problem: Pick<ArithmeticProblem, 'left' | 'right' | 'operation' | 'family'>, source: PracticeProblem['source']): PracticeProblem {
  return {
    id: createId('practice'),
    left: problem.left,
    right: problem.right,
    operation: problem.operation,
    family: problem.family,
    source,
  }
}

function buildDigitFamilyProblems(digit: number): PracticeProblem[] {
  return DIGITS.map((otherDigit) => ({
    id: createId('practice-digit'),
    left: digit,
    right: otherDigit,
    operation: 'multiplication' as const,
    family: 'multiplication-single-digit' as const,
    source: 'challenge-digit' as const,
    sourceDigit: digit,
  }))
}

function buildFamilyPracticeSet(family: ProblemFamily, count: number, random: () => number): PracticeProblem[] {
  return Array.from({ length: count }, () => {
    const problem = generateByFamily(family, random)
    return {
      ...problem,
      id: createId('practice-family'),
      source: 'family-practice' as const,
    }
  })
}

export function buildPracticePool(
  questions: TestQuestionRecord[],
  random: () => number = Math.random,
): { pool: PracticeProblem[]; challengeDigits: number[]; challengeFamilies: ProblemFamily[] } {
  const pool = new Map<string, PracticeProblem>()
  const wrongQuestions = questions.filter((question) => question.userAnswer !== '' && question.isCorrect === false)
  const skippedQuestions = getSkippedQuestions(questions)
  const challengeDigits = getChallengeDigits(questions)
  const challengeFamilies = getChallengeFamilies(questions)

  skippedQuestions.forEach((problem) => {
    const practiceProblem = toPracticeProblem(problem, 'skipped-problem')
    pool.set(problemKey(practiceProblem), practiceProblem)
  })

  wrongQuestions.forEach((problem) => {
    const practiceProblem = toPracticeProblem(problem, 'wrong-problem')
    pool.set(problemKey(practiceProblem), practiceProblem)
  })

  challengeDigits.forEach((digit) => {
    buildDigitFamilyProblems(digit).forEach((problem) => {
      pool.set(problemKey(problem), problem)
    })
  })

  challengeFamilies.forEach((family) => {
    buildFamilyPracticeSet(family, family === 'multiplication-single-digit' ? 8 : 12, random).forEach((problem) => {
      if (!pool.has(problemKey(problem))) {
        pool.set(problemKey(problem), problem)
      }
    })
  })

  return { pool: [...pool.values()], challengeDigits, challengeFamilies }
}

export function pickRandomProblem<T>(problems: T[], random: () => number = Math.random): T {
  const index = Math.floor(random() * problems.length)
  return problems[index] ?? problems[0]
}

export function buildSessionRecord(params: {
  sessionId: string
  userId: string
  mode?: GameMode
  themeId?: ThemeId
  startedAt: string
  endedAt: string
  timeLimitSeconds: number
  problemCount: number
  selectedFamilies: ProblemFamily[]
  timeRemainingSeconds: number
  questions: TestQuestionRecord[]
  wasTimedOut: boolean
  adventureSummary?: AdventureSessionSummary
}): TestSessionRecord {
  const answeredCount = params.questions.filter((question) => question.userAnswer !== '').length
  const correctCount = params.questions.filter((question) => question.isCorrect === true).length
  const challengeDigits = getChallengeDigits(params.questions)
  const challengeFamilies = getChallengeFamilies(params.questions)

  return {
    id: params.sessionId,
    userId: params.userId,
    mode: params.mode ?? 'classic',
    themeId: params.themeId,
    startedAt: params.startedAt,
    endedAt: params.endedAt,
    configuredTimeLimitSeconds: params.timeLimitSeconds,
    problemCount: params.problemCount,
    selectedFamilies: params.selectedFamilies,
    timeRemainingSeconds: params.timeRemainingSeconds,
    timeSpentSeconds: Math.max(0, params.timeLimitSeconds - params.timeRemainingSeconds),
    wasTimedOut: params.wasTimedOut,
    answeredCount,
    correctCount,
    challengeDigits,
    challengeFamilies,
    adventureSummary: params.adventureSummary,
    questions: [...params.questions].sort((a, b) => {
      if (a.resolvedOrder === null && b.resolvedOrder === null) {
        return a.initialOrder - b.initialOrder
      }
      if (a.resolvedOrder === null) {
        return 1
      }
      if (b.resolvedOrder === null) {
        return -1
      }
      return a.resolvedOrder - b.resolvedOrder
    }),
  }
}

export function buildPracticeRunRecord(params: {
  runId: string
  userId: string
  mode?: GameMode
  themeId?: ThemeId
  challengeDigits: number[]
  challengeFamilies: ProblemFamily[]
  skippedProblems: PracticeProblem[]
  totalAttempts: number
  longestStreak: number
  cleared: boolean
}): PracticeRunRecord {
  return {
    id: params.runId,
    userId: params.userId,
    mode: params.mode ?? 'classic',
    themeId: params.themeId,
    completedAt: new Date().toISOString(),
    challengeDigits: params.challengeDigits,
    challengeFamilies: params.challengeFamilies,
    sourceSkippedProblems: params.skippedProblems.map((problem) => ({
      left: problem.left,
      right: problem.right,
      operation: problem.operation,
      family: problem.family,
    })),
    totalAttempts: params.totalAttempts,
    longestStreak: params.longestStreak,
    cleared: params.cleared,
  }
}

export function deriveUserStats(
  sessions: TestSessionRecord[],
  practiceRuns: PracticeRunRecord[],
): UserStats {
  const completedSessions = sessions.filter((session) => session.answeredCount === session.questions.length)
  const fastestFullRunSeconds = completedSessions.length
    ? Math.min(...completedSessions.map((session) => session.timeSpentSeconds))
    : null

  return {
    totalSessions: sessions.length,
    totalPracticeRuns: practiceRuns.length,
    bestScore: sessions.reduce((best, session) => Math.max(best, session.correctCount), 0),
    highestCompletionCount: sessions.reduce((best, session) => Math.max(best, session.answeredCount), 0),
    fastestFullRunSeconds,
    latestChallengeDigits: sessions[0]?.challengeDigits ?? [],
    latestChallengeFamilies: sessions[0]?.challengeFamilies ?? [],
  }
}

export function formatFamilyList(families: ProblemFamily[]): string {
  return families.map((family) => FAMILY_LABELS[family]).join(', ')
}

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function pluralize(word: string, count: number): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
