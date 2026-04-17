import {
  deriveAdventureStagePlan,
  partitionAdventureQuestions,
  resolveAdventureEncounter,
  summarizeAdventureSession,
} from '../domain/adventure'
import { MERMAID_THEME } from '../domain/themes'
import type { AdventureQuestionRecord, TestQuestionRecord } from '../types'

function makeQuestion(id: string): TestQuestionRecord {
  return {
    id,
    left: Number(id),
    right: 2,
    operation: 'addition',
    family: 'addition-single-digit',
    initialOrder: Number(id),
    userAnswer: '',
    isCorrect: null,
    wasSkipped: false,
    skipCount: 0,
    resolvedOrder: null,
  }
}

function decorateQuestions(questions: TestQuestionRecord[]): {
  stages: ReturnType<typeof partitionAdventureQuestions>['stages']
  questions: AdventureQuestionRecord[]
} {
  return partitionAdventureQuestions(questions, MERMAID_THEME.stageDefinitions)
}

describe('adventure helpers', () => {
  it('derives stage plans from the configured problem count', () => {
    expect(deriveAdventureStagePlan(8)).toEqual({ stageCount: 1, bossHitCount: 1 })
    expect(deriveAdventureStagePlan(10)).toEqual({ stageCount: 2, bossHitCount: 2 })
    expect(deriveAdventureStagePlan(40)).toEqual({ stageCount: 3, bossHitCount: 3 })
  })

  it('partitions questions evenly and reserves the final questions for boss hits', () => {
    const { stages, questions } = decorateQuestions(Array.from({ length: 10 }, (_, index) => makeQuestion(String(index + 1))))

    expect(stages).toHaveLength(2)
    expect(stages[0]?.questionCount).toBe(5)
    expect(stages[1]?.questionCount).toBe(5)
    expect(stages[0]?.bossQuestionIds).toEqual(['4', '5'])
    expect(stages[1]?.bossQuestionIds).toEqual(['9', '10'])
    expect(questions.filter((question) => question.stageIndex === 0 && question.encounterType === 'boss')).toHaveLength(2)
    expect(questions.filter((question) => question.stageIndex === 1 && question.encounterType === 'hazard')).toHaveLength(3)
  })

  it('resolves hazard encounters by dodging on success and losing a heart on failure', () => {
    expect(
      resolveAdventureEncounter({
        encounterType: 'hazard',
        isCorrect: true,
        heartsRemaining: 3,
        bossHeartsRemaining: 2,
      }),
    ).toMatchObject({
      heartsRemaining: 3,
      bossHeartsRemaining: 2,
      dodgedHazard: true,
      tookDamage: false,
      lastResolution: 'dodge',
    })

    expect(
      resolveAdventureEncounter({
        encounterType: 'hazard',
        isCorrect: false,
        heartsRemaining: 3,
        bossHeartsRemaining: 2,
      }),
    ).toMatchObject({
      heartsRemaining: 2,
      bossHeartsRemaining: 2,
      dodgedHazard: false,
      tookDamage: true,
      lastResolution: 'collision',
    })
  })

  it('resolves boss encounters by removing boss hearts on success and player hearts on failure', () => {
    expect(
      resolveAdventureEncounter({
        encounterType: 'boss',
        isCorrect: true,
        heartsRemaining: 2,
        bossHeartsRemaining: 2,
      }),
    ).toMatchObject({
      heartsRemaining: 2,
      bossHeartsRemaining: 1,
      landedBossHit: true,
      lastResolution: 'boss-hit',
    })

    expect(
      resolveAdventureEncounter({
        encounterType: 'boss',
        isCorrect: false,
        heartsRemaining: 2,
        bossHeartsRemaining: 2,
      }),
    ).toMatchObject({
      heartsRemaining: 1,
      bossHeartsRemaining: 2,
      tookDamage: true,
      lastResolution: 'collision',
    })
  })

  it('summarizes a victorious adventure with cleared stages and rescued sisters', () => {
    const { stages, questions } = decorateQuestions(Array.from({ length: 10 }, (_, index) => makeQuestion(String(index + 1))))
    const answeredQuestions = questions.map((question) => ({
      ...question,
      userAnswer: '4',
      isCorrect: true as const,
    }))

    const summary = summarizeAdventureSession({
      stages,
      questions: answeredQuestions,
      heartsRemaining: 3,
      timerEnabled: false,
      timeExpired: false,
    })

    expect(summary.result).toBe('victory')
    expect(summary.sistersFreed).toBe(2)
    expect(summary.bossesDefeated).toBe(2)
    expect(summary.hazardsDodged).toBe(6)
  })

  it('summarizes boss escape, time expiry, and heart loss outcomes', () => {
    const { stages, questions } = decorateQuestions(Array.from({ length: 8 }, (_, index) => makeQuestion(String(index + 1))))
    const bossEscapeQuestions = questions.map((question, index) => ({
      ...question,
      userAnswer: String(index),
      isCorrect: question.encounterType === 'boss' ? false : true,
    }))

    expect(
      summarizeAdventureSession({
        stages,
        questions: bossEscapeQuestions,
        heartsRemaining: 2,
        timerEnabled: false,
        timeExpired: false,
      }).result,
    ).toBe('boss-escaped')

    expect(
      summarizeAdventureSession({
        stages,
        questions: bossEscapeQuestions,
        heartsRemaining: 2,
        timerEnabled: true,
        timeExpired: true,
      }).result,
    ).toBe('timed-out')

    expect(
      summarizeAdventureSession({
        stages,
        questions: bossEscapeQuestions,
        heartsRemaining: 0,
        timerEnabled: false,
        timeExpired: false,
      }).result,
    ).toBe('out-of-hearts')
  })
})
