import type {
  AdventureEncounterType,
  AdventureQuestionRecord,
  AdventureSessionSummary,
  AdventureStage,
  AdventureState,
  TestQuestionRecord,
} from '../types'
import type { ThemeStageDefinition } from './themes'

export const ADVENTURE_STARTING_HEARTS = 3

export interface AdventureStagePlan {
  stageCount: number
  bossHitCount: number
}

export interface AdventureEncounterResolution {
  heartsRemaining: number
  bossHeartsRemaining: number
  lastResolution: AdventureState['lastResolution']
  tookDamage: boolean
  dodgedHazard: boolean
  landedBossHit: boolean
}

export function deriveAdventureStagePlan(problemCount: number): AdventureStagePlan {
  if (problemCount >= 25) {
    return { stageCount: 3, bossHitCount: 3 }
  }

  if (problemCount >= 10) {
    return { stageCount: 2, bossHitCount: 2 }
  }

  return { stageCount: 1, bossHitCount: 1 }
}

function distributeStageSizes(problemCount: number, stageCount: number): number[] {
  const baseSize = Math.floor(problemCount / stageCount)
  const remainder = problemCount % stageCount

  return Array.from({ length: stageCount }, (_, index) => baseSize + (index < remainder ? 1 : 0))
}

export function partitionAdventureQuestions(
  questions: TestQuestionRecord[],
  stageDefinitions: ThemeStageDefinition[],
): { stages: AdventureStage[]; questions: AdventureQuestionRecord[] } {
  const { stageCount, bossHitCount } = deriveAdventureStagePlan(questions.length)
  const stageSizes = distributeStageSizes(questions.length, stageCount)
  const stages: AdventureStage[] = []
  const adventureQuestions: AdventureQuestionRecord[] = []
  let startIndex = 0

  stageSizes.forEach((questionCount, index) => {
    const stageDefinition = stageDefinitions[index] ?? stageDefinitions[stageDefinitions.length - 1]
    const stageQuestions = questions.slice(startIndex, startIndex + questionCount)
    const safeBossHitCount = Math.min(bossHitCount, stageQuestions.length)
    const hazardCount = Math.max(0, stageQuestions.length - safeBossHitCount)
    const bossQuestionIds = stageQuestions.slice(hazardCount).map((question) => question.id)

    stages.push({
      stageIndex: index,
      stageName: stageDefinition.name,
      hazardLabel: stageDefinition.hazardLabel,
      bossLabel: stageDefinition.bossLabel,
      sisterName: stageDefinition.sisterName,
      questionIds: stageQuestions.map((question) => question.id),
      bossQuestionIds,
      questionCount: stageQuestions.length,
      bossHitCount: safeBossHitCount,
    })

    stageQuestions.forEach((question, stageQuestionIndex) => {
      const encounterType: AdventureEncounterType = stageQuestionIndex < hazardCount ? 'hazard' : 'boss'

      adventureQuestions.push({
        ...question,
        stageIndex: index,
        stageName: stageDefinition.name,
        hazardLabel: stageDefinition.hazardLabel,
        bossLabel: stageDefinition.bossLabel,
        sisterName: stageDefinition.sisterName,
        encounterType,
      })
    })

    startIndex += questionCount
  })

  return { stages, questions: adventureQuestions }
}

export function resolveAdventureEncounter(params: {
  encounterType: AdventureEncounterType
  isCorrect: boolean
  heartsRemaining: number
  bossHeartsRemaining: number
}): AdventureEncounterResolution {
  const heartsRemaining = params.isCorrect ? params.heartsRemaining : Math.max(0, params.heartsRemaining - 1)
  const bossHeartsRemaining =
    params.encounterType === 'boss' && params.isCorrect ? Math.max(0, params.bossHeartsRemaining - 1) : params.bossHeartsRemaining

  if (params.encounterType === 'hazard') {
    return {
      heartsRemaining,
      bossHeartsRemaining,
      lastResolution: params.isCorrect ? 'dodge' : 'collision',
      tookDamage: !params.isCorrect,
      dodgedHazard: params.isCorrect,
      landedBossHit: false,
    }
  }

  return {
    heartsRemaining,
    bossHeartsRemaining,
    lastResolution: params.isCorrect ? 'boss-hit' : 'collision',
    tookDamage: !params.isCorrect,
    dodgedHazard: false,
    landedBossHit: params.isCorrect,
  }
}

export function summarizeAdventureSession(params: {
  stages: AdventureStage[]
  questions: AdventureQuestionRecord[]
  heartsRemaining: number
  timerEnabled: boolean
  timeExpired: boolean
}): AdventureSessionSummary {
  const fullyAnsweredUnclearedStages = new Set<number>()
  const stageSummaries = params.stages.map((stage) => {
    const stageQuestions = params.questions.filter((question) => question.stageIndex === stage.stageIndex)
    const hazardsDodged = stageQuestions.filter(
      (question) => question.encounterType === 'hazard' && question.isCorrect === true,
    ).length
    const bossHitsLanded = stageQuestions.filter(
      (question) => question.encounterType === 'boss' && question.isCorrect === true,
    ).length
    const answeredCount = stageQuestions.filter((question) => question.userAnswer !== '').length
    const cleared = bossHitsLanded >= stage.bossHitCount
    const stageComplete = answeredCount === stage.questionCount

    return {
      stageIndex: stage.stageIndex,
      stageName: stage.stageName,
      hazardLabel: stage.hazardLabel,
      bossLabel: stage.bossLabel,
      questionCount: stage.questionCount,
      bossHitCount: stage.bossHitCount,
      hazardsDodged,
      bossHitsLanded,
      sisterFreed: cleared && stageComplete,
      cleared: cleared && stageComplete,
    }
  })

  params.stages.forEach((stage) => {
    const stageQuestions = params.questions.filter((question) => question.stageIndex === stage.stageIndex)
    const answeredCount = stageQuestions.filter((question) => question.userAnswer !== '').length
    const bossHitsLanded = stageQuestions.filter(
      (question) => question.encounterType === 'boss' && question.isCorrect === true,
    ).length

    if (answeredCount === stage.questionCount && bossHitsLanded < stage.bossHitCount) {
      fullyAnsweredUnclearedStages.add(stage.stageIndex)
    }
  })

  let result: AdventureSessionSummary['result']

  if (params.timeExpired) {
    result = 'timed-out'
  } else if (params.heartsRemaining <= 0) {
    result = 'out-of-hearts'
  } else if (fullyAnsweredUnclearedStages.size > 0) {
    result = 'boss-escaped'
  } else {
    result = 'victory'
  }

  return {
    result,
    stageCount: params.stages.length,
    sistersFreed: stageSummaries.filter((stage) => stage.sisterFreed).length,
    bossesDefeated: stageSummaries.filter((stage) => stage.cleared).length,
    hazardsDodged: stageSummaries.reduce((total, stage) => total + stage.hazardsDodged, 0),
    heartsRemaining: params.heartsRemaining,
    timerEnabled: params.timerEnabled,
    stages: stageSummaries,
  }
}
