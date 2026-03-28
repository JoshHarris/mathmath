import {
  buildPracticePool,
  buildSessionRecord,
  formatProblem,
  formatSeconds,
  generateRandomProblems,
  getChallengeDigits,
  getCorrectAnswer,
  isAnswerCorrect,
  moveProblemToQueueEnd,
} from '../domain/game'

describe('game domain helpers', () => {
  it('generates requested number of problems for selected families', () => {
    const problems = generateRandomProblems(8, ['multiplication-single-digit'], () => 0.99)

    expect(problems).toHaveLength(8)
    expect(problems[0]?.family).toBe('multiplication-single-digit')
    expect(problems[0]?.left).toBe(9)
    expect(problems[0]?.right).toBe(9)
  })

  it('generates division with whole-number answers', () => {
    const problems = generateRandomProblems(20, ['division-double-digit'])

    expect(problems.every((problem) => Number.isInteger(getCorrectAnswer(problem)))).toBe(true)
    expect(problems.every((problem) => problem.right !== 0)).toBe(true)
  })

  it('checks answers correctly across operations', () => {
    expect(isAnswerCorrect({ left: 7, right: 8, operation: 'multiplication' }, '56')).toBe(true)
    expect(isAnswerCorrect({ left: 56, right: 8, operation: 'division' }, '7')).toBe(true)
    expect(isAnswerCorrect({ left: 120, right: 7, operation: 'addition' }, '127')).toBe(true)
    expect(isAnswerCorrect({ left: 90, right: 40, operation: 'subtraction' }, '50')).toBe(true)
  })

  it('formats problems with the expected operator', () => {
    expect(formatProblem({ left: 12, right: 3, operation: 'division' })).toBe('12 ÷ 3')
  })

  it('moves a skipped problem to the queue end unless it is the last one', () => {
    expect(moveProblemToQueueEnd(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
    expect(moveProblemToQueueEnd(['only'], 'only')).toEqual(['only'])
  })

  it('identifies challenge digits from repeated single-digit multiplication misses', () => {
    const challengeDigits = getChallengeDigits([
      {
        id: '1',
        left: 6,
        right: 7,
        operation: 'multiplication',
        family: 'multiplication-single-digit',
        initialOrder: 1,
        userAnswer: '40',
        isCorrect: false,
        wasSkipped: false,
        skipCount: 0,
        resolvedOrder: 1,
      },
      {
        id: '2',
        left: 8,
        right: 7,
        operation: 'multiplication',
        family: 'multiplication-single-digit',
        initialOrder: 2,
        userAnswer: '40',
        isCorrect: false,
        wasSkipped: false,
        skipCount: 0,
        resolvedOrder: 2,
      },
    ])

    expect(challengeDigits).toEqual([7])
  })

  it('builds practice pool from wrong families, digit families, and skipped problems', () => {
    const { pool, challengeDigits, challengeFamilies } = buildPracticePool([
      {
        id: '1',
        left: 6,
        right: 7,
        operation: 'multiplication',
        family: 'multiplication-single-digit',
        initialOrder: 1,
        userAnswer: '40',
        isCorrect: false,
        wasSkipped: false,
        skipCount: 0,
        resolvedOrder: 1,
      },
      {
        id: '2',
        left: 8,
        right: 7,
        operation: 'multiplication',
        family: 'multiplication-single-digit',
        initialOrder: 2,
        userAnswer: '40',
        isCorrect: false,
        wasSkipped: false,
        skipCount: 0,
        resolvedOrder: 2,
      },
      {
        id: '3',
        left: 84,
        right: 12,
        operation: 'division',
        family: 'division-double-digit',
        initialOrder: 3,
        userAnswer: '8',
        isCorrect: false,
        wasSkipped: true,
        skipCount: 1,
        resolvedOrder: 3,
      },
    ])

    expect(challengeDigits).toEqual([7])
    expect(challengeFamilies).toContain('division-double-digit')
    expect(pool.some((problem) => problem.left === 7 && problem.right === 0)).toBe(true)
    expect(pool.some((problem) => problem.left === 84 && problem.right === 12)).toBe(true)
  })

  it('builds a summary session record', () => {
    const session = buildSessionRecord({
      sessionId: 'session-1',
      userId: 'user-1',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:08:00.000Z',
      timeLimitSeconds: 600,
      problemCount: 10,
      selectedFamilies: ['multiplication-single-digit', 'division-double-digit'],
      timeRemainingSeconds: 120,
      wasTimedOut: false,
      questions: [
        {
          id: '1',
          left: 7,
          right: 8,
          operation: 'multiplication',
          family: 'multiplication-single-digit',
          initialOrder: 1,
          userAnswer: '56',
          isCorrect: true,
          wasSkipped: false,
          skipCount: 0,
          resolvedOrder: 1,
        },
        {
          id: '2',
          left: 84,
          right: 12,
          operation: 'division',
          family: 'division-double-digit',
          initialOrder: 2,
          userAnswer: '6',
          isCorrect: false,
          wasSkipped: true,
          skipCount: 1,
          resolvedOrder: 2,
        },
      ],
    })

    expect(session.correctCount).toBe(1)
    expect(session.problemCount).toBe(10)
    expect(session.selectedFamilies).toContain('division-double-digit')
    expect(session.challengeFamilies).toContain('division-double-digit')
  })

  it('formats timer values as mm:ss', () => {
    expect(formatSeconds(600)).toBe('10:00')
    expect(formatSeconds(61)).toBe('01:01')
  })
})
