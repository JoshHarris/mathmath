import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './index.css'
import {
  ADVENTURE_STARTING_HEARTS,
  partitionAdventureQuestions,
  resolveAdventureEncounter,
  summarizeAdventureSession,
} from './domain/adventure'
import {
  buildPracticePool,
  buildPracticeRunRecord,
  buildSessionRecord,
  createId,
  DEFAULT_TEST_FAMILIES,
  deriveUserStats,
  FAMILY_GROUPS,
  FAMILY_LABELS,
  formatFamilyList,
  formatProblem,
  formatSeconds,
  generateRandomProblems,
  getCorrectAnswer,
  isAnswerCorrect,
  moveProblemToQueueEnd,
  pickRandomProblem,
  pluralize,
} from './domain/game'
import { buildHints } from './domain/hints'
import { getAdventureTheme, MERMAID_THEME, type ThemeStageDefinition } from './domain/themes'
import mermaidArt from './assets/mermaid-gemini.png'
import sharkArt from './assets/shark-gemini.png'
import { createStorageAdapter } from './storage/browserStorage'
import type {
  AdventureQuestionRecord,
  AdventureSessionSummary,
  AdventureState,
  AppScreen,
  GameMode,
  PracticeProblem,
  PracticeRunRecord,
  PracticeState,
  ProblemFamily,
  StorageAdapter,
  TestSessionRecord,
  TestState,
  UserProfile,
} from './types'

const DEFAULT_TIME_LIMIT_MINUTES = 10
const DEFAULT_PROBLEM_COUNT = 10
const PRACTICE_STREAK_GOAL = 15
const ADVENTURE_FEEDBACK_MS = 680

function App() {
  const [storage, setStorage] = useState<StorageAdapter | null>(null)
  const [screen, setScreen] = useState<AppScreen>('home')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [activeUserId, setActiveUserId] = useState('')
  const [sessions, setSessions] = useState<TestSessionRecord[]>([])
  const [practiceRuns, setPracticeRuns] = useState<PracticeRunRecord[]>([])
  const [latestSession, setLatestSession] = useState<TestSessionRecord | null>(null)
  const [testState, setTestState] = useState<TestState | null>(null)
  const [practiceState, setPracticeState] = useState<PracticeState | null>(null)
  const [adventureState, setAdventureState] = useState<AdventureState | null>(null)
  const [testAnswerInput, setTestAnswerInput] = useState('')
  const [adventureInput, setAdventureInput] = useState('')
  const [practiceInput, setPracticeInput] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(DEFAULT_TIME_LIMIT_MINUTES)
  const [problemCount, setProblemCount] = useState(DEFAULT_PROBLEM_COUNT)
  const [selectedFamilies, setSelectedFamilies] = useState<ProblemFamily[]>(DEFAULT_TEST_FAMILIES)
  const [adventureTimerEnabled, setAdventureTimerEnabled] = useState(false)
  const [showDoneConfirm, setShowDoneConfirm] = useState(false)
  const [practiceMessage, setPracticeMessage] = useState('')
  const [openHintForProblemId, setOpenHintForProblemId] = useState<string | null>(null)
  const [isMobileReview, setIsMobileReview] = useState<boolean>(window.innerWidth <= 760)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const adventureFeedbackTimerRef = useRef<number | null>(null)
  const adventureInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      try {
        const adapter = await createStorageAdapter()
        if (cancelled) {
          return
        }

        const loadedUsers = await adapter.getUsers()
        if (cancelled) {
          return
        }

        setStorage(adapter)
        setUsers(loadedUsers)

        if (loadedUsers[0]) {
          setActiveUserId(loadedUsers[0].id)
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load local storage.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void initialize()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const listener = () => setIsMobileReview(window.innerWidth <= 760)
    window.addEventListener('resize', listener)
    return () => window.removeEventListener('resize', listener)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const ratio = window.visualViewport ? window.visualViewport.height / window.innerHeight : 1
      setIsKeyboardOpen(ratio < 0.75)
    }

    handleResize()
    window.visualViewport?.addEventListener('resize', handleResize)
    window.addEventListener('resize', handleResize)

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const clearAdventureTimer = useCallback(() => {
    if (adventureFeedbackTimerRef.current !== null) {
      window.clearTimeout(adventureFeedbackTimerRef.current)
      adventureFeedbackTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearAdventureTimer(), [clearAdventureTimer])

  useEffect(() => {
    if (!storage || !activeUserId) {
      setSessions([])
      setPracticeRuns([])
      return
    }

    const loadUserData = async () => {
      const [loadedSessions, loadedPracticeRuns] = await Promise.all([
        storage.getTestSessions(activeUserId),
        storage.getPracticeRuns(activeUserId),
      ])

      setSessions(loadedSessions)
      setPracticeRuns(loadedPracticeRuns)
    }

    void loadUserData()
  }, [storage, activeUserId])

  const activeUser = useMemo(
    () => users.find((user) => user.id === activeUserId) ?? null,
    [activeUserId, users],
  )

  const userStats = useMemo(() => deriveUserStats(sessions, practiceRuns), [sessions, practiceRuns])

  const currentQuestion = useMemo(() => {
    if (!testState) {
      return null
    }

    const questionId = testState.remainingQuestionIds[0]
    return testState.questions.find((question) => question.id === questionId) ?? null
  }, [testState])

  const currentAdventureQuestion = useMemo(
    () => (adventureState ? adventureState.questions[adventureState.currentQuestionIndex] ?? null : null),
    [adventureState],
  )

  const currentAdventureStage = useMemo(
    () => (adventureState ? adventureState.stages[adventureState.currentStageIndex] ?? null : null),
    [adventureState],
  )
  const adventureFocusKey = adventureState
    ? `${adventureState.currentQuestionIndex}:${adventureState.currentStageIndex}:${adventureState.isResolving ? '1' : '0'}`
    : 'none'

  const currentHints = useMemo(() => {
    if (practiceState) {
      return buildHints(practiceState.currentProblem)
    }

    if (currentAdventureQuestion) {
      return buildHints(currentAdventureQuestion)
    }

    return []
  }, [practiceState, currentAdventureQuestion])

  const reviewQuestions = useMemo(() => {
    if (!latestSession) {
      return []
    }

    return isMobileReview
      ? latestSession.questions.filter((question) => question.isCorrect === false || question.userAnswer === '')
      : latestSession.questions
  }, [isMobileReview, latestSession])

  const latestPracticeOptions = useMemo(
    () => (latestSession ? buildPracticePool(latestSession.questions) : null),
    [latestSession],
  )

  const latestSessionMode = getStoredMode(latestSession?.mode)
  const latestAdventureTheme = latestSession?.themeId ? getAdventureTheme(latestSession.themeId) : MERMAID_THEME
  const latestAdventureSummary = latestSession?.adventureSummary ?? null
  const challengeDigitSummary = latestSession?.challengeDigits.length
    ? latestSession.challengeDigits.join(', ')
    : 'None this time'
  const challengeFamilySummary = latestSession?.challengeFamilies.length
    ? formatFamilyList(latestSession.challengeFamilies)
    : 'None this time'
  const skippedCount = testState?.questions.filter((question) => question.skipCount > 0).length ?? 0
  const currentPosition = testState ? testState.problemCount - testState.remainingQuestionIds.length + 1 : 1
  const isSessionScreen = screen === 'test' || screen === 'practice' || screen === 'adventure'

  const adventureStageProgress = useMemo(() => {
    if (!adventureState || !currentAdventureStage) {
      return null
    }

    const stageQuestions = adventureState.questions.filter(
      (question) => question.stageIndex === currentAdventureStage.stageIndex,
    )
    const answeredCount = stageQuestions.filter((question) => question.userAnswer !== '').length
    const hazardsDodged = stageQuestions.filter(
      (question) => question.encounterType === 'hazard' && question.isCorrect === true,
    ).length
    const bossHitsLanded = stageQuestions.filter(
      (question) => question.encounterType === 'boss' && question.isCorrect === true,
    ).length

    return {
      answeredCount,
      hazardsDodged,
      bossHitsLanded,
      hazardsTotal: currentAdventureStage.questionCount - currentAdventureStage.bossHitCount,
      questionsRemaining: currentAdventureStage.questionCount - answeredCount,
    }
  }, [adventureState, currentAdventureStage])

  const mermaidPracticeTheme =
    practiceState?.mode === 'mermaid-adventure' && practiceState.themeId
      ? getAdventureTheme(practiceState.themeId)
      : MERMAID_THEME

  const refreshUsers = useCallback(
    async (nextActiveUserId?: string): Promise<void> => {
      if (!storage) {
        return
      }

      const loadedUsers = await storage.getUsers()
      setUsers(loadedUsers)
      if (nextActiveUserId) {
        setActiveUserId(nextActiveUserId)
      } else if (!loadedUsers.some((user) => user.id === activeUserId)) {
        setActiveUserId(loadedUsers[0]?.id ?? '')
      }
    },
    [activeUserId, storage],
  )

  async function createUser(): Promise<void> {
    const trimmedName = newUserName.trim()
    if (!trimmedName || !storage) {
      return
    }

    const now = new Date().toISOString()
    const user: UserProfile = {
      id: createId('user'),
      name: trimmedName,
      createdAt: now,
      lastActiveAt: now,
    }

    await storage.saveUser(user)
    setNewUserName('')
    await refreshUsers(user.id)
  }

  const updateActiveUserTimestamp = useCallback(
    async (userId: string): Promise<void> => {
      if (!storage) {
        return
      }

      const user = users.find((entry) => entry.id === userId)
      if (!user) {
        return
      }

      await storage.saveUser({ ...user, lastActiveAt: new Date().toISOString() })
      await refreshUsers(userId)
    },
    [refreshUsers, storage, users],
  )

  function toggleFamily(family: ProblemFamily): void {
    setSelectedFamilies((current) => {
      if (current.includes(family)) {
        return current.length === 1 ? current : current.filter((item) => item !== family)
      }

      return [...current, family]
    })
  }

  function prepareForNewRun(): void {
    clearAdventureTimer()
    setLatestSession(null)
    setTestState(null)
    setAdventureState(null)
    setPracticeState(null)
    setPracticeInput('')
    setTestAnswerInput('')
    setAdventureInput('')
    setShowDoneConfirm(false)
    setOpenHintForProblemId(null)
  }

  function startClassicTest(): void {
    if (!activeUserId) {
      return
    }

    const timeLimitSeconds = Math.max(1, Math.round(timeLimitMinutes * 60))
    const normalizedProblemCount = Math.max(1, Math.round(problemCount))
    const families = selectedFamilies.length > 0 ? selectedFamilies : DEFAULT_TEST_FAMILIES
    const questions = generateRandomProblems(normalizedProblemCount, families)

    prepareForNewRun()
    setScreen('test')
    setTestState({
      sessionId: createId('test'),
      userId: activeUserId,
      startedAt: new Date().toISOString(),
      problemCount: normalizedProblemCount,
      selectedFamilies: families,
      timeLimitSeconds,
      timeRemainingSeconds: timeLimitSeconds,
      isPaused: false,
      questions,
      remainingQuestionIds: questions.map((question) => question.id),
      resolutionCounter: 0,
    })
  }

  function startMermaidAdventure(): void {
    if (!activeUserId) {
      return
    }

    const normalizedProblemCount = Math.max(1, Math.round(problemCount))
    const families = selectedFamilies.length > 0 ? selectedFamilies : DEFAULT_TEST_FAMILIES
    const seedQuestions = generateRandomProblems(normalizedProblemCount, families)
    const theme = MERMAID_THEME
    const { stages, questions } = partitionAdventureQuestions(seedQuestions, theme.stageDefinitions)
    const timeLimitSeconds = adventureTimerEnabled ? Math.max(1, Math.round(timeLimitMinutes * 60)) : 0

    prepareForNewRun()
    setScreen('adventure')
    setAdventureState({
      sessionId: createId('adventure'),
      userId: activeUserId,
      mode: 'mermaid-adventure',
      themeId: theme.id,
      startedAt: new Date().toISOString(),
      problemCount: normalizedProblemCount,
      selectedFamilies: families,
      timerEnabled: adventureTimerEnabled,
      timeLimitSeconds,
      timeRemainingSeconds: timeLimitSeconds,
      isPaused: false,
      heartsRemaining: ADVENTURE_STARTING_HEARTS,
      stages,
      questions,
      currentQuestionIndex: 0,
      currentStageIndex: 0,
      bossHeartsRemaining: stages[0]?.bossHitCount ?? 0,
      bossesDefeated: 0,
      sistersFreed: 0,
      hazardsDodged: 0,
      lastResolution: 'idle',
      isResolving: false,
    })
  }

  function pauseOrResumeTest(): void {
    setTestState((current) => (current ? { ...current, isPaused: !current.isPaused } : current))
  }

  function pauseOrResumeAdventure(): void {
    setAdventureState((current) => (current ? { ...current, isPaused: !current.isPaused } : current))
  }

  function submitAnswer(): void {
    if (!testState || !currentQuestion) {
      return
    }

    const trimmedAnswer = testAnswerInput.trim()
    if (!trimmedAnswer) {
      return
    }

    const correct = isAnswerCorrect(currentQuestion, trimmedAnswer)
    const nextResolution = testState.resolutionCounter + 1

    setTestState({
      ...testState,
      resolutionCounter: nextResolution,
      questions: testState.questions.map((question) =>
        question.id === currentQuestion.id
          ? {
              ...question,
              userAnswer: trimmedAnswer,
              isCorrect: correct,
              resolvedOrder: nextResolution,
            }
          : question,
      ),
      remainingQuestionIds: testState.remainingQuestionIds.slice(1),
    })
    setTestAnswerInput('')
  }

  function skipQuestion(): void {
    if (!testState || !currentQuestion || testState.remainingQuestionIds.length <= 1) {
      return
    }

    setTestState({
      ...testState,
      questions: testState.questions.map((question) =>
        question.id === currentQuestion.id
          ? { ...question, wasSkipped: true, skipCount: question.skipCount + 1 }
          : question,
      ),
      remainingQuestionIds: moveProblemToQueueEnd(testState.remainingQuestionIds, currentQuestion.id),
    })
    setTestAnswerInput('')
  }

  const finalizeClassicTest = useCallback(
    async (wasTimedOut: boolean): Promise<void> => {
      if (!testState || !storage) {
        return
      }

      const sessionRecord = buildSessionRecord({
        sessionId: testState.sessionId,
        userId: testState.userId,
        mode: 'classic',
        startedAt: testState.startedAt,
        endedAt: new Date().toISOString(),
        timeLimitSeconds: testState.timeLimitSeconds,
        problemCount: testState.problemCount,
        selectedFamilies: testState.selectedFamilies,
        timeRemainingSeconds: testState.timeRemainingSeconds,
        questions: testState.questions,
        wasTimedOut,
      })

      await storage.saveTestSession(sessionRecord)
      await updateActiveUserTimestamp(testState.userId)

      setSessions((current) => [sessionRecord, ...current.filter((session) => session.id !== sessionRecord.id)])
      setLatestSession(sessionRecord)
      setTestState(null)
      setTestAnswerInput('')
      setScreen('review')
    },
    [storage, testState, updateActiveUserTimestamp],
  )

  const finalizeAdventure = useCallback(
    async (state: AdventureState, wasTimedOut: boolean): Promise<void> => {
      if (!storage) {
        return
      }

      clearAdventureTimer()

      const adventureSummary = summarizeAdventureSession({
        stages: state.stages,
        questions: state.questions,
        heartsRemaining: state.heartsRemaining,
        timerEnabled: state.timerEnabled,
        timeExpired: wasTimedOut,
      })

      const sessionRecord = buildSessionRecord({
        sessionId: state.sessionId,
        userId: state.userId,
        mode: state.mode,
        themeId: state.themeId,
        startedAt: state.startedAt,
        endedAt: new Date().toISOString(),
        timeLimitSeconds: state.timerEnabled ? state.timeLimitSeconds : 0,
        problemCount: state.problemCount,
        selectedFamilies: state.selectedFamilies,
        timeRemainingSeconds: state.timerEnabled ? state.timeRemainingSeconds : 0,
        questions: state.questions,
        wasTimedOut,
        adventureSummary,
      })

      await storage.saveTestSession(sessionRecord)
      await updateActiveUserTimestamp(state.userId)

      setSessions((current) => [sessionRecord, ...current.filter((session) => session.id !== sessionRecord.id)])
      setLatestSession(sessionRecord)
      setAdventureState(null)
      setAdventureInput('')
      setOpenHintForProblemId(null)
      setScreen('adventure-review')
    },
    [clearAdventureTimer, storage, updateActiveUserTimestamp],
  )

  const continueAdventureAfterResolution = useCallback(
    async (resolvedState: AdventureState): Promise<void> => {
      clearAdventureTimer()

      const activeStage = resolvedState.stages[resolvedState.currentStageIndex]
      if (!activeStage) {
        return
      }

      const stageQuestions = resolvedState.questions.filter((question) => question.stageIndex === activeStage.stageIndex)
      const answeredCount = stageQuestions.filter((question) => question.userAnswer !== '').length
      const bossHitsLanded = stageQuestions.filter(
        (question) => question.encounterType === 'boss' && question.isCorrect === true,
      ).length
      const stageFinished = answeredCount >= activeStage.questionCount
      const bossDefeated = bossHitsLanded >= activeStage.bossHitCount

      if (resolvedState.heartsRemaining <= 0) {
        await finalizeAdventure({ ...resolvedState, isResolving: false, lastResolution: 'idle' }, false)
        return
      }

      if (stageFinished && !bossDefeated) {
        await finalizeAdventure({ ...resolvedState, isResolving: false, lastResolution: 'idle' }, false)
        return
      }

      const nextQuestionIndex = resolvedState.currentQuestionIndex + 1
      if (nextQuestionIndex >= resolvedState.questions.length) {
        await finalizeAdventure({ ...resolvedState, isResolving: false, lastResolution: 'idle' }, false)
        return
      }

      if (stageFinished && bossDefeated) {
        const nextStageIndex = resolvedState.currentStageIndex + 1
        const nextStage = resolvedState.stages[nextStageIndex]

        setAdventureState({
          ...resolvedState,
          currentQuestionIndex: nextQuestionIndex,
          currentStageIndex: nextStageIndex,
          bossHeartsRemaining: nextStage?.bossHitCount ?? 0,
          bossesDefeated: resolvedState.bossesDefeated + 1,
          sistersFreed: resolvedState.sistersFreed + 1,
          lastResolution: 'idle',
          isResolving: false,
        })
        return
      }

      setAdventureState({
        ...resolvedState,
        currentQuestionIndex: nextQuestionIndex,
        lastResolution: 'idle',
        isResolving: false,
      })
    },
    [clearAdventureTimer, finalizeAdventure],
  )

  function submitAdventureAnswer(): void {
    if (!adventureState || !currentAdventureQuestion || adventureState.isResolving) {
      return
    }

    const trimmedAnswer = adventureInput.trim()
    if (!trimmedAnswer) {
      return
    }

    const correct = isAnswerCorrect(currentAdventureQuestion, trimmedAnswer)
    const resolution = resolveAdventureEncounter({
      encounterType: currentAdventureQuestion.encounterType,
      isCorrect: correct,
      heartsRemaining: adventureState.heartsRemaining,
      bossHeartsRemaining: adventureState.bossHeartsRemaining,
    })

    const resolvedState: AdventureState = {
      ...adventureState,
      questions: adventureState.questions.map((question, index) =>
        index === adventureState.currentQuestionIndex
          ? {
              ...question,
              userAnswer: trimmedAnswer,
              isCorrect: correct,
              resolvedOrder: adventureState.currentQuestionIndex + 1,
            }
          : question,
      ),
      heartsRemaining: resolution.heartsRemaining,
      bossHeartsRemaining: resolution.bossHeartsRemaining,
      hazardsDodged: adventureState.hazardsDodged + (resolution.dodgedHazard ? 1 : 0),
      lastResolution: resolution.lastResolution,
      isResolving: true,
    }

    clearAdventureTimer()
    setAdventureState(resolvedState)
    setAdventureInput('')
    setOpenHintForProblemId(null)
    window.requestAnimationFrame(() => {
      adventureInputRef.current?.focus({ preventScroll: true })
    })
    adventureFeedbackTimerRef.current = window.setTimeout(() => {
      void continueAdventureAfterResolution(resolvedState)
    }, ADVENTURE_FEEDBACK_MS)
  }

  useEffect(() => {
    if (!testState || testState.isPaused) {
      return
    }

    if (testState.timeRemainingSeconds <= 0) {
      void finalizeClassicTest(true)
      return
    }

    const timer = window.setInterval(() => {
      setTestState((current) => {
        if (!current || current.isPaused) {
          return current
        }

        return {
          ...current,
          timeRemainingSeconds: Math.max(0, current.timeRemainingSeconds - 1),
        }
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [finalizeClassicTest, testState])

  useEffect(() => {
    if (testState && testState.remainingQuestionIds.length === 0) {
      void finalizeClassicTest(false)
    }
  }, [finalizeClassicTest, testState])

  useEffect(() => {
    if (!adventureState || !adventureState.timerEnabled || adventureState.isPaused || adventureState.isResolving) {
      return
    }

    if (adventureState.timeRemainingSeconds <= 0) {
      void finalizeAdventure(adventureState, true)
      return
    }

    const timer = window.setInterval(() => {
      setAdventureState((current) => {
        if (!current || !current.timerEnabled || current.isPaused || current.isResolving) {
          return current
        }

        return {
          ...current,
          timeRemainingSeconds: Math.max(0, current.timeRemainingSeconds - 1),
        }
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [adventureState, finalizeAdventure])

  useEffect(() => {
    if (screen !== 'adventure' || adventureFocusKey === 'none') {
      return
    }

    adventureInputRef.current?.focus({ preventScroll: true })
  }, [adventureFocusKey, screen])

  function startPracticeFromLatestSession(): void {
    if (!latestSession || !activeUserId) {
      return
    }

    const options = buildPracticePool(latestSession.questions)
    if (options.pool.length === 0) {
      return
    }

    const skippedProblems: PracticeProblem[] = latestSession.questions
      .filter((problem) => problem.skipCount > 0)
      .map((problem) => ({
        id: createId('practice-skipped'),
        left: problem.left,
        right: problem.right,
        operation: problem.operation,
        family: problem.family,
        source: 'skipped-problem',
      }))

    setPracticeMessage('')
    setPracticeInput('')
    setOpenHintForProblemId(null)
    setPracticeState({
      runId: createId('practice'),
      userId: activeUserId,
      mode: getStoredMode(latestSession.mode),
      themeId: latestSession.themeId,
      challengeDigits: options.challengeDigits,
      challengeFamilies: options.challengeFamilies,
      skippedProblems,
      pool: options.pool,
      currentProblem: pickRandomProblem(options.pool),
      streak: 0,
      longestStreak: 0,
      totalAttempts: 0,
    })
    setScreen('practice')
  }

  async function submitPracticeAnswer(): Promise<void> {
    if (!practiceState || !storage) {
      return
    }

    const trimmedAnswer = practiceInput.trim()
    if (!trimmedAnswer) {
      return
    }

    const correct = isAnswerCorrect(practiceState.currentProblem, trimmedAnswer)
    const nextStreak = correct ? practiceState.streak + 1 : 0
    const nextLongestStreak = Math.max(practiceState.longestStreak, nextStreak)
    const nextAttempts = practiceState.totalAttempts + 1
    const mode = practiceState.mode

    if (correct && nextStreak >= PRACTICE_STREAK_GOAL) {
      const runRecord = buildPracticeRunRecord({
        runId: practiceState.runId,
        userId: practiceState.userId,
        mode: practiceState.mode,
        themeId: practiceState.themeId,
        challengeDigits: practiceState.challengeDigits,
        challengeFamilies: practiceState.challengeFamilies,
        skippedProblems: practiceState.skippedProblems,
        totalAttempts: nextAttempts,
        longestStreak: nextLongestStreak,
        cleared: true,
      })

      await storage.savePracticeRun(runRecord)
      await updateActiveUserTimestamp(practiceState.userId)
      setPracticeRuns((current) => [runRecord, ...current.filter((run) => run.id !== runRecord.id)])
      setPracticeState(null)
      setPracticeInput('')
      setPracticeMessage(getPracticeClearMessage(mode))
      setScreen('home')
      return
    }

    setPracticeState({
      ...practiceState,
      streak: nextStreak,
      longestStreak: nextLongestStreak,
      totalAttempts: nextAttempts,
      currentProblem: pickRandomProblem(practiceState.pool),
    })
    setPracticeInput('')
    setPracticeMessage(getPracticeFeedbackMessage(mode, correct))
    setOpenHintForProblemId(null)
  }

  function goHome(): void {
    clearAdventureTimer()
    setScreen('home')
  }

  if (loading) {
    return <main className="app-shell"><section className="panel">Loading your local game...</section></main>
  }

  return (
    <main
      className={[
        'app-shell',
        isSessionScreen ? 'session-shell' : '',
        screen === 'test' && isMobileReview ? 'test-mobile-shell' : '',
        screen === 'adventure' || screen === 'adventure-review' ? 'ocean-shell' : '',
        practiceState?.mode === 'mermaid-adventure' ? 'ocean-shell' : '',
        isKeyboardOpen ? 'keyboard-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {screen === 'home' ? (
        <header className="hero-card panel ocean-hero">
          <div className="stack">
            <p className="eyebrow">Offline family math game</p>
            <h1>Math Math</h1>
            <p className="subtle">
              Keep the classic drills, or dive into Mermaid Adventure to dodge sea dangers, beat storybook bosses, and rescue sisters with every correct answer.
            </p>
            <div className="hero-badges">
              <span className="pill">Classic test mode</span>
              <span className="pill ocean-pill">{MERMAID_THEME.copy.modeLabel}</span>
            </div>
          </div>
          <div className="hero-orbs" aria-hidden="true">
            <div className="hero-orb large" />
            <div className="hero-orb mid" />
            <div className="hero-orb small" />
          </div>
        </header>
      ) : null}

      {errorMessage ? <section className="panel error-banner">{errorMessage}</section> : null}

      {screen === 'home' ? (
        <section className="home-grid">
          <section className="panel stack">
            <div className="section-head">
              <div>
                <h2>Choose a learner</h2>
                <p className="subtle">Each learner keeps separate local scores, practice clears, and adventure runs.</p>
              </div>
            </div>

            <div className="user-form">
              <form
                className="user-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void createUser()
                }}
              >
                <input
                  name="new-user-name"
                  value={newUserName}
                  onChange={(event) => setNewUserName(event.target.value)}
                  placeholder="Add a new learner"
                  aria-label="Add a new learner"
                />
                <button className="button primary user-add-button" type="submit">
                  Add
                </button>
              </form>
            </div>

            <div className="user-list">
              {users.length === 0 ? <p className="subtle">Create a user to get started.</p> : null}
              {users.map((user) => (
                <button
                  key={user.id}
                  className={`user-card ${user.id === activeUserId ? 'selected' : ''}`}
                  onClick={() => setActiveUserId(user.id)}
                >
                  <strong>{user.name}</strong>
                  <span className="subtle">Last active {new Date(user.lastActiveAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel stack">
            <div className="section-head">
              <div>
                <h2>Math settings</h2>
                <p className="subtle">Problem count and families stay shared across both game modes.</p>
              </div>
            </div>

            <label className="field">
              <span>Number of problems</span>
              <input
                name="problem-count"
                type="number"
                min="1"
                step="1"
                value={problemCount}
                onChange={(event) => setProblemCount(Number(event.target.value) || 1)}
              />
            </label>

            <div className="field">
              <span>Problem types</span>
              <div className="family-groups">
                {FAMILY_GROUPS.map((group) => (
                  <fieldset key={group.label} className="family-group">
                    <legend>{group.label}</legend>
                    {group.families.map((family) => (
                      <label key={family} className="family-option">
                        <input
                          name={`family-${family}`}
                          type="checkbox"
                          checked={selectedFamilies.includes(family)}
                          onChange={() => toggleFamily(family)}
                        />
                        <span>{FAMILY_LABELS[family]}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </div>

            <div className="summary-grid">
              <div className="stat-card">
                <span className="stat-label">Best score</span>
                <strong>{userStats.bestScore}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Most completed</span>
                <strong>{userStats.highestCompletionCount}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Fastest full run</span>
                <strong>{userStats.fastestFullRunSeconds === null ? '-' : formatSeconds(userStats.fastestFullRunSeconds)}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Practice clears</span>
                <strong>{practiceRuns.filter((run) => run.cleared).length}</strong>
              </div>
            </div>
          </section>

          <section className="panel stack full-width">
            <div className="section-head">
              <div>
                <h2>Choose your mode</h2>
                <p className="subtle">Classic keeps the quiz-and-review loop. Mermaid Adventure turns the same equations into a stage rescue game.</p>
              </div>
            </div>

            <div className="launch-grid">
              <article className="launch-card">
                <p className="eyebrow">Classic</p>
                <h3>Classic Test</h3>
                <p className="subtle">Timed test, skip button, review screen, and challenge practice exactly like before.</p>
                <label className="field">
                  <span>Time limit in minutes</span>
                  <input
                    name="time-limit-minutes"
                    type="number"
                    min="1"
                    step="1"
                    value={timeLimitMinutes}
                    onChange={(event) => setTimeLimitMinutes(Number(event.target.value) || 1)}
                  />
                </label>
                <button
                  className="button primary large"
                  onClick={startClassicTest}
                  disabled={!activeUser || selectedFamilies.length === 0}
                >
                  Start classic test
                </button>
              </article>

              <article className="launch-card launch-card-mermaid">
                <p className="eyebrow ocean-eyebrow">{MERMAID_THEME.name}</p>
                <h3>Dive Into Mermaid Adventure</h3>
                <p className="subtle">{MERMAID_THEME.intro}</p>
                <label className="toggle-card">
                  <input
                    name="adventure-timer"
                    type="checkbox"
                    checked={adventureTimerEnabled}
                    onChange={(event) => setAdventureTimerEnabled(event.target.checked)}
                  />
                  <span>
                    <strong>Use a countdown</strong>
                    <small>{adventureTimerEnabled ? 'Adventure timer is on.' : 'Relaxed free-swim mode with no countdown.'}</small>
                  </span>
                </label>
                {adventureTimerEnabled ? (
                  <label className="field">
                    <span>Adventure timer in minutes</span>
                    <input
                      name="adventure-time-limit-minutes"
                      type="number"
                      min="1"
                      step="1"
                      value={timeLimitMinutes}
                      onChange={(event) => setTimeLimitMinutes(Number(event.target.value) || 1)}
                    />
                  </label>
                ) : (
                  <div className="mode-note">
                    <strong>Storybook pacing:</strong>
                    <span className="subtle">Use all three hearts to finish each run. No timer pressure unless you turn it on.</span>
                  </div>
                )}
                <button
                  className="button ocean-button large"
                  onClick={startMermaidAdventure}
                  disabled={!activeUser || selectedFamilies.length === 0}
                >
                  Start Mermaid Adventure
                </button>
              </article>
            </div>

            {practiceMessage ? <p className="success-note">{practiceMessage}</p> : null}
          </section>

          <section className="panel stack full-width">
            <div className="section-head">
              <div>
                <h2>Recent runs</h2>
                <p className="subtle">Most recent first, across classic tests and Mermaid Adventure.</p>
              </div>
            </div>

            {activeUser && sessions.length === 0 ? <p className="subtle">No sessions yet for {activeUser.name}.</p> : null}

            <div className="table-list">
              {sessions.slice(0, 6).map((session) => {
                const mode = getStoredMode(session.mode)
                const isAdventure = mode === 'mermaid-adventure'

                return (
                  <article key={session.id} className={`table-row ${isAdventure ? 'ocean-row' : ''}`}>
                    <div>
                      <strong>{new Date(session.startedAt).toLocaleString()}</strong>
                      <p className="subtle">
                        {isAdventure
                          ? `${session.adventureSummary?.sistersFreed ?? 0} sisters freed · ${session.correctCount}/${session.problemCount} answers right`
                          : `Score ${session.correctCount}/${session.problemCount} · ${session.selectedFamilies.length} types`}
                      </p>
                    </div>
                    <div className="table-meta">
                      <span>{getModeLabel(mode)}</span>
                      <span>{getRecentRunMeta(session)}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        </section>
      ) : null}

      {screen === 'test' && testState && currentQuestion ? (
        <section className="panel stack test-panel">
          <div className="session-compact-head">
            <div>
              <p className="eyebrow">Classic Test</p>
              <strong>{activeUser?.name ?? 'Learner'}</strong>
            </div>
            <div className="timer-box">
              <span className="stat-label">Time left</span>
              <strong>{formatSeconds(testState.timeRemainingSeconds)}</strong>
            </div>
            <button className="button subtle-button" onClick={goHome}>
              Home
            </button>
          </div>

          {isMobileReview ? (
            <div className="test-compact-bar" aria-label="Test summary">
              <div className="compact-stat">
                <span>Pos</span>
                <strong>{currentPosition}</strong>
              </div>
              <div className="compact-stat">
                <span>Left</span>
                <strong>{testState.remainingQuestionIds.length}</strong>
              </div>
              <div className="compact-stat">
                <span>Skipped</span>
                <strong>{skippedCount}</strong>
              </div>
              <div className="compact-stat timer">
                <span>Time</span>
                <strong>{formatSeconds(testState.timeRemainingSeconds)}</strong>
              </div>
            </div>
          ) : null}

          {!isMobileReview ? (
            <div className="summary-grid compact">
              <div className="stat-card">
                <span className="stat-label">Current position</span>
                <strong>{currentPosition}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Left to answer</span>
                <strong>{testState.remainingQuestionIds.length}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Already skipped</span>
                <strong>{skippedCount}</strong>
              </div>
            </div>
          ) : null}

          <div className={`problem-card ${isMobileReview ? 'problem-card-mobile' : ''}`}>
            <p className="eyebrow">{FAMILY_LABELS[currentQuestion.family]}</p>
            <div className="problem">{formatProblem(currentQuestion)}</div>
            <form
              className="answer-form"
              onSubmit={(event) => {
                event.preventDefault()
                submitAnswer()
              }}
            >
              <input
                name="test-answer"
                autoFocus
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                autoComplete="off"
                value={testAnswerInput}
                onChange={(event) => setTestAnswerInput(event.target.value)}
                aria-label="Answer"
              />
              <div className="action-row">
                <button type="submit" className="button primary">
                  Submit
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={skipQuestion}
                  disabled={testState.remainingQuestionIds.length <= 1}
                >
                  Skip
                </button>
              </div>
            </form>
            {testState.remainingQuestionIds.length <= 1 ? <p className="subtle">You cannot skip the last remaining problem.</p> : null}
          </div>

          <div className="action-row split">
            <button className="button" onClick={pauseOrResumeTest}>
              {testState.isPaused ? 'Resume' : 'Pause'} timer
            </button>
            <button className="button danger" onClick={() => setShowDoneConfirm(true)}>
              Done
            </button>
          </div>

          {showDoneConfirm ? (
            <div className="dialog-card">
              <p>Finish now and score what has been completed so far?</p>
              <div className="action-row">
                <button className="button primary" onClick={() => void finalizeClassicTest(false)}>
                  Yes, finish
                </button>
                <button className="button" onClick={() => setShowDoneConfirm(false)}>
                  Keep going
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {screen === 'adventure' && adventureState && currentAdventureQuestion && currentAdventureStage && adventureStageProgress ? (
        <section className="panel stack test-panel adventure-panel">
          <div className="section-head adventure-head">
            <div>
              <p className="eyebrow ocean-eyebrow">{MERMAID_THEME.name}</p>
              <h2>{currentAdventureStage.stageName}</h2>
              <p className="subtle">
                {currentAdventureQuestion.encounterType === 'boss'
                  ? `Boss battle: ${currentAdventureStage.bossLabel}`
                  : `Solve correctly to dodge ${currentAdventureStage.hazardLabel}.`}
              </p>
            </div>
            <div className="adventure-head-actions">
              {adventureState.timerEnabled ? (
                <div className="timer-box ocean-timer">
                  <span className="stat-label">Current tide</span>
                  <strong>{formatSeconds(adventureState.timeRemainingSeconds)}</strong>
                </div>
              ) : (
                <div className="pill ocean-pill">Free swim mode</div>
              )}
              <button className="button subtle-button" onClick={goHome}>
                Home
              </button>
            </div>
          </div>

          <div className="adventure-status-grid">
            <div className="story-stat">
              <span className="stat-label">Stage</span>
              <strong>
                {currentAdventureStage.stageIndex + 1}/{adventureState.stages.length}
              </strong>
            </div>
            <div className="story-stat">
              <span className="stat-label">Hearts</span>
              <HeartMeter current={adventureState.heartsRemaining} total={ADVENTURE_STARTING_HEARTS} />
            </div>
            <div className="story-stat">
              <span className="stat-label">Boss shield</span>
              <strong>
                {adventureState.bossHeartsRemaining}/{currentAdventureStage.bossHitCount}
              </strong>
            </div>
            <div className="story-stat">
              <span className="stat-label">Sisters freed</span>
              <strong>
                {adventureState.sistersFreed}/{adventureState.stages.length}
              </strong>
            </div>
          </div>

          <div className="stage-track adventure-route">
            {adventureState.stages.map((stage, index) => (
              <div
                key={stage.stageName}
                className={`stage-token ${index < adventureState.sistersFreed ? 'freed' : ''} ${index === currentAdventureStage.stageIndex ? 'current' : ''}`}
              >
                <CageGlyph freed={index < adventureState.sistersFreed} />
                <strong>{stage.sisterName}</strong>
                <span>{stage.stageName}</span>
              </div>
            ))}
          </div>

          <div className="adventure-layout">
            <AdventureScene
              stageDefinition={MERMAID_THEME.stageDefinitions[currentAdventureStage.stageIndex] ?? MERMAID_THEME.stageDefinitions[0]}
              question={currentAdventureQuestion}
              lastResolution={adventureState.lastResolution}
              sistersFreed={adventureState.sistersFreed}
              totalStages={adventureState.stages.length}
              bossHeartsRemaining={adventureState.bossHeartsRemaining}
              bossHitCount={currentAdventureStage.bossHitCount}
            />

            <div className="problem-card adventure-problem-card">
              <div className="section-head compact-gap">
                <div>
                  <p className="eyebrow ocean-eyebrow">
                    {currentAdventureQuestion.encounterType === 'boss' ? currentAdventureStage.bossLabel : currentAdventureStage.hazardLabel}
                  </p>
                  <p className="subtle">
                    Encounter {adventureState.currentQuestionIndex + 1} of {adventureState.questions.length} · {adventureStageProgress.questionsRemaining} left in this stage
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-button ocean-icon-button"
                  onClick={() =>
                    setOpenHintForProblemId((current) =>
                      current === currentAdventureQuestion.id ? null : currentAdventureQuestion.id,
                    )
                  }
                  aria-expanded={openHintForProblemId === currentAdventureQuestion.id}
                  aria-label="Show solving ideas"
                  title="Show solving ideas"
                >
                  i
                </button>
              </div>

              <div className="problem">{formatProblem(currentAdventureQuestion)}</div>

              {openHintForProblemId === currentAdventureQuestion.id ? (
                <div className="hint-box ocean-hint-box">
                  <h3>Sea-sense ideas</h3>
                  <ul className="bullet-list">
                    {currentHints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <form
                className="answer-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitAdventureAnswer()
                }}
              >
                <input
                  name="adventure-answer"
                  autoFocus
                  ref={adventureInputRef}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="done"
                  autoComplete="off"
                  value={adventureInput}
                  onChange={(event) => setAdventureInput(event.target.value)}
                  aria-label="Adventure answer"
                />
                <div className="action-row split wrap">
                  <button type="submit" className="button ocean-button" disabled={adventureState.isResolving}>
                    {currentAdventureQuestion.encounterType === 'boss' ? 'Strike the boss' : 'Dodge now'}
                  </button>
                  {adventureState.timerEnabled ? (
                    <button type="button" className="button" onClick={pauseOrResumeAdventure}>
                      {adventureState.isPaused ? 'Resume' : 'Pause'} timer
                    </button>
                  ) : (
                    <div className="mode-note compact-note">
                      <strong>Next goal:</strong>
                      <span className="subtle">
                        {currentAdventureQuestion.encounterType === 'boss'
                          ? `${adventureState.bossHeartsRemaining} boss hits still needed in ${currentAdventureStage.stageName}.`
                          : `${currentAdventureStage.hazardLabel} are still on the move.`}
                      </span>
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>
        </section>
      ) : null}

      {screen === 'review' && latestSession ? (
        <section className="panel stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">Classic review</p>
              <h2>Positive score report</h2>
            </div>
            <button className="button" onClick={goHome}>
              Back home
            </button>
          </div>

          <div className="summary-grid">
            <div className="stat-card celebrate">
              <span className="stat-label">Correct</span>
              <strong>{latestSession.correctCount}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Completed</span>
              <strong>{latestSession.answeredCount}/{latestSession.problemCount}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Time used</span>
              <strong>{formatSeconds(latestSession.timeSpentSeconds)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Challenge digits</span>
              <strong>{challengeDigitSummary}</strong>
            </div>
          </div>

          <div className="summary-grid compact-2">
            <div className="stat-card">
              <span className="stat-label">Test types</span>
              <strong>{formatFamilyList(latestSession.selectedFamilies)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Practice focus</span>
              <strong>{challengeFamilySummary}</strong>
            </div>
          </div>

          <div className="panel inset">
            <h3>Wrong answer summary</h3>
            {latestSession.questions.some((question) => question.isCorrect === false || question.userAnswer === '') ? (
              <ul className="bullet-list">
                {latestSession.questions
                  .filter((question) => question.isCorrect === false || question.userAnswer === '')
                  .map((question) => (
                    <li key={question.id}>
                      {formatProblem(question)} - entered <strong>{question.userAnswer === '' ? 'no answer' : question.userAnswer}</strong>, correct answer <strong>{getCorrectAnswer(question)}</strong>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="success-note">Perfect session - no missed or unanswered problems.</p>
            )}
          </div>

          <div className="panel inset">
            <h3>How practice works now</h3>
            <ul className="bullet-list">
              <li>Skipped problems are included directly.</li>
              <li>Wrong problems are included directly.</li>
              <li>Single-digit multiplication misses can still expand into full digit families like 7 x 0 through 9.</li>
              <li>Any weak test family adds more practice of that same family.</li>
            </ul>
          </div>

          <div className="action-row split wrap">
            <button className="button" onClick={startClassicTest}>
              Start another test
            </button>
            <button className="button primary" onClick={startPracticeFromLatestSession} disabled={!latestPracticeOptions || latestPracticeOptions.pool.length === 0}>
              Start challenge practice
            </button>
          </div>

          <div className="review-grid">
            {reviewQuestions.map((question) => {
              const correctAnswer = getCorrectAnswer(question)
              const correct = question.isCorrect === true

              return (
                <article key={question.id} className={`review-card ${correct ? 'correct' : 'incorrect'}`}>
                  <div className="review-card-top">
                    <strong>{formatProblem(question)}</strong>
                    {question.skipCount > 0 ? <span className="tag">Skipped first</span> : null}
                  </div>
                  <p className="subtle">{FAMILY_LABELS[question.family]}</p>
                  <p>
                    Your answer: <strong>{question.userAnswer || '-'}</strong>
                  </p>
                  {!correct ? (
                    <p>
                      Correct answer: <strong>{correctAnswer}</strong>
                    </p>
                  ) : (
                    <p className="success-note">Correct - nice work.</p>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {screen === 'adventure-review' && latestSession && latestSessionMode === 'mermaid-adventure' && latestAdventureSummary ? (
        <section className="panel stack adventure-review-shell">
          <div className="section-head">
            <div>
              <p className="eyebrow ocean-eyebrow">{latestAdventureTheme.name}</p>
              <h2>{latestAdventureSummary.result === 'victory' ? latestAdventureTheme.copy.winTitle : latestAdventureTheme.copy.loseTitle}</h2>
              <p className="subtle">{getAdventureNarrative(latestAdventureSummary)}</p>
            </div>
            <button className="button" onClick={goHome}>
              Back home
            </button>
          </div>

          <div className="summary-grid adventure-results-grid">
            <div className="stat-card celebrate">
              <span className="stat-label">Sisters freed</span>
              <strong>{latestAdventureSummary.sistersFreed}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Bosses defeated</span>
              <strong>{latestAdventureSummary.bossesDefeated}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Hazards dodged</span>
              <strong>{latestAdventureSummary.hazardsDodged}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Hearts left</span>
              <strong>{latestAdventureSummary.heartsRemaining}</strong>
            </div>
          </div>

          <div className="summary-grid compact-2">
            <div className="stat-card">
              <span className="stat-label">Timer outcome</span>
              <strong>{formatAdventureTimerOutcome(latestAdventureSummary, latestSession.wasTimedOut)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Math focus</span>
              <strong>{formatFamilyList(latestSession.selectedFamilies)}</strong>
            </div>
          </div>

          <div className="stage-report-grid">
            {latestAdventureSummary.stages.map((stage, index) => (
              <article key={stage.stageName} className={`stage-report-card ${stage.cleared ? 'cleared' : ''}`}>
                <div className="review-card-top">
                  <strong>{stage.stageName}</strong>
                  <span className="tag">{latestAdventureTheme.stageDefinitions[index]?.sisterName ?? `Sister ${index + 1}`}</span>
                </div>
                <p className="subtle">{stage.bossLabel}</p>
                <p>Hazards dodged: <strong>{stage.hazardsDodged}</strong></p>
                <p>Boss hits landed: <strong>{stage.bossHitsLanded}/{stage.bossHitCount}</strong></p>
                <p>{stage.sisterFreed ? 'Sister rescued from this cage.' : 'This cage stayed locked.'}</p>
              </article>
            ))}
          </div>

          <div className="panel inset ocean-inset">
            <h3>Missed encounter summary</h3>
            {latestSession.questions.some((question) => question.isCorrect === false || question.userAnswer === '') ? (
              <ul className="bullet-list">
                {latestSession.questions
                  .filter((question) => question.isCorrect === false || question.userAnswer === '')
                  .map((question) => (
                    <li key={question.id}>
                      {formatProblem(question)} - entered <strong>{question.userAnswer === '' ? 'no answer' : question.userAnswer}</strong>, correct answer <strong>{getCorrectAnswer(question)}</strong>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="success-note">Every encounter was answered correctly in this run.</p>
            )}
          </div>

          <div className="action-row split wrap">
            <button className="button ocean-button" onClick={startMermaidAdventure}>
              Dive again
            </button>
            <button className="button primary" onClick={startPracticeFromLatestSession} disabled={!latestPracticeOptions || latestPracticeOptions.pool.length === 0}>
              Start rescue training
            </button>
          </div>
        </section>
      ) : null}

      {screen === 'practice' && practiceState ? (
        <section className={`panel stack test-panel ${practiceState.mode === 'mermaid-adventure' ? 'adventure-panel practice-ocean-panel' : ''}`}>
          <div className="session-compact-head">
            <div>
              <p className={`eyebrow ${practiceState.mode === 'mermaid-adventure' ? 'ocean-eyebrow' : ''}`}>
                {practiceState.mode === 'mermaid-adventure' ? mermaidPracticeTheme.copy.practiceTitle : 'Practice mode'}
              </p>
              <strong>{activeUser?.name ?? 'Learner'}</strong>
            </div>
            <div className="session-compact-status">
              {practiceState.mode === 'mermaid-adventure' ? mermaidPracticeTheme.copy.practiceSubtitle : 'Practice mode'}
            </div>
            <button className="button subtle-button" onClick={goHome}>
              Home
            </button>
          </div>

          <div className="summary-grid compact">
            <div className="stat-card celebrate">
              <span className="stat-label">{practiceState.mode === 'mermaid-adventure' ? 'Pearl streak' : 'Current streak'}</span>
              <strong>{practiceState.streak}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Best streak</span>
              <strong>{practiceState.longestStreak}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">{practiceState.mode === 'mermaid-adventure' ? 'Rescue set' : 'Focus set'}</span>
              <strong>{pluralize('problem', practiceState.pool.length)}</strong>
            </div>
          </div>

          <div className={`panel inset compact-note ${practiceState.mode === 'mermaid-adventure' ? 'ocean-inset' : ''}`}>
            <strong>{practiceState.mode === 'mermaid-adventure' ? 'Training bundle:' : 'Practice options now built in:'}</strong>
            <span className="subtle">
              {practiceState.mode === 'mermaid-adventure'
                ? ' missed encounters + wrong answers + extra problems from the same family, plus digit-family multiplication when that signal appears.'
                : ' skipped problems + exact wrong problems + more from the same family, plus digit-family multiplication when that signal exists.'}
            </span>
          </div>

          <div className="problem-card">
            <div className="section-head compact-gap">
              <div>
                <p className={`eyebrow ${practiceState.mode === 'mermaid-adventure' ? 'ocean-eyebrow' : ''}`}>{FAMILY_LABELS[practiceState.currentProblem.family]}</p>
                <p className="subtle">{practiceState.mode === 'mermaid-adventure' ? 'One calm swim at a time' : 'One at a time, no timer'}</p>
              </div>
              <button
                type="button"
                className={`icon-button ${practiceState.mode === 'mermaid-adventure' ? 'ocean-icon-button' : ''}`}
                onClick={() =>
                  setOpenHintForProblemId((current) =>
                    current === practiceState.currentProblem.id ? null : practiceState.currentProblem.id,
                  )
                }
                aria-expanded={openHintForProblemId === practiceState.currentProblem.id}
                aria-label="Show solving ideas"
                title="Show solving ideas"
              >
                i
              </button>
            </div>
            <div className="problem">{formatProblem(practiceState.currentProblem)}</div>
            {openHintForProblemId === practiceState.currentProblem.id ? (
              <div className={`hint-box ${practiceState.mode === 'mermaid-adventure' ? 'ocean-hint-box' : ''}`}>
                <h3>{practiceState.mode === 'mermaid-adventure' ? 'Sea-sense ideas' : 'Ways to think about it'}</h3>
                <ul className="bullet-list">
                  {currentHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <form
              className="answer-form"
              onSubmit={(event) => {
                event.preventDefault()
                void submitPracticeAnswer()
              }}
            >
              <input
                name="practice-answer"
                autoFocus
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                autoComplete="off"
                value={practiceInput}
                onChange={(event) => setPracticeInput(event.target.value)}
                aria-label="Practice answer"
              />
              <button type="submit" className={`button ${practiceState.mode === 'mermaid-adventure' ? 'ocean-button' : 'primary'}`}>
                {practiceState.mode === 'mermaid-adventure' ? 'Swim onward' : 'Check answer'}
              </button>
            </form>
            {practiceMessage ? <p className="subtle">{practiceMessage}</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}

function getStoredMode(mode?: GameMode): GameMode {
  return mode ?? 'classic'
}

function getModeLabel(mode: GameMode): string {
  return mode === 'mermaid-adventure' ? 'Mermaid Adventure' : 'Classic'
}

function getPracticeFeedbackMessage(mode: GameMode, correct: boolean): string {
  if (mode === 'mermaid-adventure') {
    return correct ? 'Splash! That answer helped the mermaid slip past the danger.' : 'That bump cost a pearl streak, but the mermaid can build it back.'
  }

  return correct ? 'Nice job - keep the streak going.' : 'That one resets the streak. You can build it back up!'
}

function getPracticeClearMessage(mode: GameMode): string {
  return mode === 'mermaid-adventure'
    ? 'The reef gate opened - 15 pearls in a row and the rescue training is cleared.'
    : 'Amazing work - you got 15 in a row and cleared practice!'
}

function getAdventureNarrative(summary: AdventureSessionSummary): string {
  switch (summary.result) {
    case 'victory':
      return `The mermaid cleared every stage, defeated ${summary.bossesDefeated} bosses, and rescued all ${summary.sistersFreed} sisters.`
    case 'timed-out':
      return `The tide ran out after ${summary.sistersFreed} sister rescues. The next run can start from the reef again.`
    case 'out-of-hearts':
      return `The sea dangers used up all three hearts after ${summary.hazardsDodged} successful dodges.`
    case 'boss-escaped':
      return `The boss at the end of a stage still had strength left, so the mermaid had to turn back for now.`
  }
}

function getRecentRunMeta(session: TestSessionRecord): string {
  if (session.wasTimedOut) {
    return 'Timed out'
  }

  if (getStoredMode(session.mode) === 'mermaid-adventure' && session.configuredTimeLimitSeconds === 0) {
    return 'Untimed'
  }

  return formatSeconds(session.timeSpentSeconds)
}

function formatAdventureTimerOutcome(summary: AdventureSessionSummary, wasTimedOut: boolean): string {
  if (!summary.timerEnabled) {
    return 'Free swim mode'
  }

  return wasTimedOut ? 'Timer expired' : 'Timer survived'
}

function HeartMeter(props: { current: number; total: number }) {
  return (
    <div className="heart-meter" aria-label={`${props.current} of ${props.total} hearts remaining`}>
      {Array.from({ length: props.total }, (_, index) => (
        <span key={index} className={`heart-chip ${index < props.current ? 'filled' : ''}`}>
          <HeartGlyph filled={index < props.current} />
        </span>
      ))}
    </div>
  )
}

function AdventureScene(props: {
  stageDefinition: ThemeStageDefinition
  question: AdventureQuestionRecord
  lastResolution: AdventureState['lastResolution']
  sistersFreed: number
  totalStages: number
  bossHeartsRemaining: number
  bossHitCount: number
}) {
  const style = {
    '--scene-backdrop': props.stageDefinition.palette.backdrop,
    '--scene-water-glow': props.stageDefinition.palette.waterGlow,
    '--scene-reef-glow': props.stageDefinition.palette.reefGlow,
    '--scene-hazard-glow': props.stageDefinition.palette.hazardGlow,
  } as CSSProperties
  const burstLabel =
    props.lastResolution === 'dodge'
      ? 'Splash dodge!'
      : props.lastResolution === 'boss-hit'
        ? 'Boss cracked!'
        : props.lastResolution === 'collision'
          ? 'Bubble bump!'
          : ''

  return (
    <section className="adventure-scene" style={style}>
      {burstLabel ? (
        <div className={`scene-burst ${props.lastResolution}`} aria-hidden="true">
          {burstLabel}
        </div>
      ) : null}
      <div className="scene-bubbles" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="scene-cages" aria-hidden="true">
        {Array.from({ length: props.totalStages }, (_, index) => (
          <div key={index} className={`scene-cage ${index < props.sistersFreed ? 'freed' : index === props.question.stageIndex ? 'current' : ''}`}>
            <CageGlyph freed={index < props.sistersFreed} />
          </div>
        ))}
      </div>

      <div className="scene-lane-label">
        <span>{props.question.stageName}</span>
        <strong>{props.question.encounterType === 'boss' ? props.question.bossLabel : props.question.hazardLabel}</strong>
      </div>

      <div className={`scene-stage scene-${props.stageDefinition.key} resolution-${props.lastResolution}`}>
        <div className="reef reef-left" />
        <div className="reef reef-right" />
        <div className="scene-mermaid">
          <img src={mermaidArt} alt="Cute storybook mermaid" />
        </div>
        <div className={`scene-threat ${props.question.encounterType === 'boss' ? 'boss' : 'hazard'}`}>
          {props.stageDefinition.key === 'reef-sprint' ? (
            <img
              src={sharkArt}
              alt={props.question.encounterType === 'boss' ? 'Angry shark boss' : 'Shark hazard'}
            />
          ) : props.question.encounterType === 'boss' ? (
            <BossGlyph stageKey={props.stageDefinition.key} />
          ) : (
            <HazardGlyph stageKey={props.stageDefinition.key} />
          )}
        </div>
      </div>

      <div className="scene-caption">
        <span>{props.question.encounterType === 'boss' ? 'Boss shield' : 'Current threat'}</span>
        <strong>
          {props.question.encounterType === 'boss'
            ? `${props.bossHeartsRemaining} / ${props.bossHitCount}`
            : props.question.hazardLabel}
        </strong>
      </div>
    </section>
  )
}

function HazardGlyph(props: { stageKey: string }) {
  switch (props.stageKey) {
    case 'reef-sprint':
      return (
        <svg viewBox="0 0 160 120" role="img" aria-label="Shark">
          <path d="M16 70c30-30 74-34 110-16l18-18 2 24-2 24-18-18c-38 18-82 14-110 4z" fill="#cbd5f5" />
          <path d="M54 48l16-20 16 24" fill="#94a3b8" />
          <circle cx="104" cy="58" r="4" fill="#0f172a" />
        </svg>
      )
    case 'urchin-garden':
      return (
        <svg viewBox="0 0 120 120" role="img" aria-label="Urchin">
          <circle cx="60" cy="60" r="26" fill="#7c3aed" />
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index / 12) * Math.PI * 2
            const x1 = 60 + Math.cos(angle) * 22
            const y1 = 60 + Math.sin(angle) * 22
            const x2 = 60 + Math.cos(angle) * 44
            const y2 = 60 + Math.sin(angle) * 44

            return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" />
          })}
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 140 120" role="img" aria-label="Pirate">
          <circle cx="70" cy="38" r="18" fill="#f8c9a8" />
          <path d="M38 24c18-22 46-22 64 0v10H38z" fill="#111827" />
          <rect x="50" y="56" width="40" height="42" rx="10" fill="#991b1b" />
          <path d="M30 88h80l-12 18H42z" fill="#0f172a" />
        </svg>
      )
  }
}

function BossGlyph(props: { stageKey: string }) {
  switch (props.stageKey) {
    case 'reef-sprint':
      return (
        <svg viewBox="0 0 180 140" role="img" aria-label="Queen Shark">
          <path d="M14 84c28-40 84-52 134-28l22-22 4 28-4 28-18-18c-44 24-98 24-138 12z" fill="#93c5fd" />
          <path d="M72 44l22-28 24 34" fill="#1d4ed8" />
          <circle cx="122" cy="64" r="5" fill="#0f172a" />
          <path d="M130 84l-10 10 18 4" fill="#f8fafc" />
        </svg>
      )
    case 'urchin-garden':
      return (
        <svg viewBox="0 0 140 140" role="img" aria-label="Urchin Empress">
          <circle cx="70" cy="70" r="34" fill="#6d28d9" />
          {Array.from({ length: 18 }, (_, index) => {
            const angle = (index / 18) * Math.PI * 2
            const x1 = 70 + Math.cos(angle) * 28
            const y1 = 70 + Math.sin(angle) * 28
            const x2 = 70 + Math.cos(angle) * 58
            const y2 = 70 + Math.sin(angle) * 58

            return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fb7185" strokeWidth="7" strokeLinecap="round" />
          })}
          <circle cx="58" cy="66" r="4" fill="#fef3c7" />
          <circle cx="82" cy="66" r="4" fill="#fef3c7" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 180 150" role="img" aria-label="Captain Blackwake">
          <rect x="46" y="48" width="88" height="58" rx="14" fill="#7c2d12" />
          <circle cx="90" cy="34" r="22" fill="#f8c9a8" />
          <path d="M52 20c18-18 58-18 76 0v12H52z" fill="#1f2937" />
          <path d="M26 112h128l-18 22H44z" fill="#111827" />
          <path d="M140 34l18 10-18 8z" fill="#fbbf24" />
        </svg>
      )
  }
}

function CageGlyph(props: { freed: boolean }) {
  return (
    <svg viewBox="0 0 80 80" role="img" aria-label={props.freed ? 'Freed cage' : 'Locked cage'}>
      <rect x="20" y="22" width="40" height="34" rx="6" fill={props.freed ? '#bbf7d0' : '#e5e7eb'} stroke={props.freed ? '#16a34a' : '#64748b'} strokeWidth="4" />
      <path d="M28 22v-8c0-8 6-14 12-14s12 6 12 14v8" fill="none" stroke={props.freed ? '#16a34a' : '#64748b'} strokeWidth="4" />
      <line x1="32" y1="26" x2="32" y2="52" stroke={props.freed ? '#16a34a' : '#64748b'} strokeWidth="4" />
      <line x1="40" y1="26" x2="40" y2="52" stroke={props.freed ? '#16a34a' : '#64748b'} strokeWidth="4" />
      <line x1="48" y1="26" x2="48" y2="52" stroke={props.freed ? '#16a34a' : '#64748b'} strokeWidth="4" />
      <circle cx="40" cy="68" r="6" fill={props.freed ? '#16a34a' : '#94a3b8'} />
    </svg>
  )
}

function HeartGlyph(props: { filled: boolean }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
      <path
        d="M32 54 12 34C6 28 6 18 12 12c6-6 16-6 22 0l-2 2 2-2c6-6 16-6 22 0 6 6 6 16 0 22z"
        fill={props.filled ? '#fb7185' : '#e2e8f0'}
        stroke={props.filled ? '#be123c' : '#94a3b8'}
        strokeWidth="3"
      />
    </svg>
  )
}

export default App
