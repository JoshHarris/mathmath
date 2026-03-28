import { useCallback, useEffect, useMemo, useState } from 'react'
import './index.css'
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
import { createStorageAdapter } from './storage/browserStorage'
import type {
  AppScreen,
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
  const [answerInput, setAnswerInput] = useState('')
  const [practiceInput, setPracticeInput] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(DEFAULT_TIME_LIMIT_MINUTES)
  const [problemCount, setProblemCount] = useState(DEFAULT_PROBLEM_COUNT)
  const [selectedFamilies, setSelectedFamilies] = useState<ProblemFamily[]>(DEFAULT_TEST_FAMILIES)
  const [showDoneConfirm, setShowDoneConfirm] = useState(false)
  const [practiceMessage, setPracticeMessage] = useState('')
  const [openHintForProblemId, setOpenHintForProblemId] = useState<string | null>(null)
  const [isMobileReview, setIsMobileReview] = useState<boolean>(window.innerWidth <= 760)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

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

  const currentHints = useMemo(() => {
    if (!practiceState) {
      return []
    }

    return buildHints(practiceState.currentProblem)
  }, [practiceState])

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

  function startTest(): void {
    if (!activeUserId) {
      return
    }

    const timeLimitSeconds = Math.max(1, Math.round(timeLimitMinutes * 60))
    const normalizedProblemCount = Math.max(1, Math.round(problemCount))
    const families = selectedFamilies.length > 0 ? selectedFamilies : DEFAULT_TEST_FAMILIES
    const questions = generateRandomProblems(normalizedProblemCount, families)

    setLatestSession(null)
    setPracticeState(null)
    setPracticeInput('')
    setAnswerInput('')
    setShowDoneConfirm(false)
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

  function pauseOrResumeTest(): void {
    setTestState((current) => (current ? { ...current, isPaused: !current.isPaused } : current))
  }

  function submitAnswer(): void {
    if (!testState || !currentQuestion) {
      return
    }

    const trimmedAnswer = answerInput.trim()
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
    setAnswerInput('')
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
    setAnswerInput('')
  }

  const finalizeTest = useCallback(
    async (wasTimedOut: boolean): Promise<void> => {
      if (!testState || !storage) {
        return
      }

      const sessionRecord = buildSessionRecord({
        sessionId: testState.sessionId,
        userId: testState.userId,
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

      setSessions([sessionRecord, ...sessions])
      setLatestSession(sessionRecord)
      setTestState(null)
      setAnswerInput('')
      setScreen('review')
    },
    [sessions, storage, testState, updateActiveUserTimestamp],
  )

  useEffect(() => {
    if (!testState || testState.isPaused) {
      return
    }

    if (testState.timeRemainingSeconds <= 0) {
      void finalizeTest(true)
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
  }, [finalizeTest, testState])

  useEffect(() => {
    if (testState && testState.remainingQuestionIds.length === 0) {
      void finalizeTest(false)
    }
  }, [finalizeTest, testState])

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

    if (correct && nextStreak >= PRACTICE_STREAK_GOAL) {
      const runRecord = buildPracticeRunRecord({
        runId: practiceState.runId,
        userId: practiceState.userId,
        challengeDigits: practiceState.challengeDigits,
        challengeFamilies: practiceState.challengeFamilies,
        skippedProblems: practiceState.skippedProblems,
        totalAttempts: nextAttempts,
        longestStreak: nextLongestStreak,
        cleared: true,
      })

      await storage.savePracticeRun(runRecord)
      await updateActiveUserTimestamp(practiceState.userId)
      setPracticeRuns([runRecord, ...practiceRuns])
      setPracticeState(null)
      setPracticeInput('')
      setPracticeMessage('Amazing work — you got 15 in a row and cleared practice!')
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
    setPracticeMessage(correct ? 'Nice job — keep the streak going.' : 'That one resets the streak. You can build it back up!')
    setOpenHintForProblemId(null)
  }

  const challengeDigitSummary = latestSession?.challengeDigits.length
    ? latestSession.challengeDigits.join(', ')
    : 'None this time'
  const challengeFamilySummary = latestSession?.challengeFamilies.length
    ? formatFamilyList(latestSession.challengeFamilies)
    : 'None this time'
  const skippedCount = testState?.questions.filter((question) => question.skipCount > 0).length ?? 0
  const currentPosition = testState ? testState.problemCount - testState.remainingQuestionIds.length + 1 : 1
  const isSessionScreen = screen === 'test' || screen === 'practice'

  if (loading) {
    return <main className="app-shell"><section className="panel">Loading your local game…</section></main>
  }

  return (
    <main className={`app-shell ${isSessionScreen ? 'session-shell' : ''} ${screen === 'test' && isMobileReview ? 'test-mobile-shell' : ''} ${isKeyboardOpen ? 'keyboard-open' : ''}`}>
      {!isSessionScreen ? (
        <header className="hero-card panel">
          <div>
            <p className="eyebrow">Offline math trainer</p>
            <h1>Math Math</h1>
            <p className="subtle">
              Practice multiplication, division, addition, and subtraction with timed tests, supportive review, and focused challenge practice. Best on iPad in portrait.
            </p>
          </div>
        </header>
      ) : null}

      {errorMessage ? <section className="panel error-banner">{errorMessage}</section> : null}

      {screen === 'home' ? (
        <section className="home-grid">
          <section className="panel stack">
            <div className="section-head">
              <h2>Choose a user</h2>
              <p className="subtle">Separate local stats for each learner.</p>
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
              <h2>Start a test</h2>
              <p className="subtle">Choose your problem types, set a timer, and decide how many questions to practice.</p>
            </div>

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

            <button className="button primary large" onClick={startTest} disabled={!activeUser || selectedFamilies.length === 0}>
              Start test
            </button>

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
                <strong>{userStats.fastestFullRunSeconds === null ? '—' : formatSeconds(userStats.fastestFullRunSeconds)}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Practice clears</span>
                <strong>{practiceRuns.filter((run) => run.cleared).length}</strong>
              </div>
            </div>

            {practiceMessage ? <p className="success-note">{practiceMessage}</p> : null}
          </section>

          <section className="panel stack full-width">
            <div className="section-head">
              <h2>Recent tests</h2>
              <p className="subtle">Most recent first.</p>
            </div>

            {activeUser && sessions.length === 0 ? <p className="subtle">No sessions yet for {activeUser.name}.</p> : null}

            <div className="table-list">
              {sessions.slice(0, 6).map((session) => (
                <article key={session.id} className="table-row">
                  <div>
                    <strong>{new Date(session.startedAt).toLocaleString()}</strong>
                    <p className="subtle">
                      Score {session.correctCount}/{session.problemCount} · {session.selectedFamilies.length} types
                    </p>
                  </div>
                  <div className="table-meta">
                    <span>{session.wasTimedOut ? 'Timed out' : 'Finished'}</span>
                    <span>{formatSeconds(session.timeSpentSeconds)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {screen === 'test' && testState && currentQuestion ? (
        <section className="panel stack test-panel">
          <div className="session-compact-head">
            <div>
              <p className="eyebrow">Math Math</p>
              <strong>{activeUser?.name ?? 'Learner'}</strong>
            </div>
            <div className="timer-box">
              <span className="stat-label">Time left</span>
              <strong>{formatSeconds(testState.timeRemainingSeconds)}</strong>
            </div>
            <button className="button subtle-button" onClick={() => setScreen('home')}>
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
                value={answerInput}
                onChange={(event) => setAnswerInput(event.target.value)}
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
                <button className="button primary" onClick={() => void finalizeTest(false)}>
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

      {screen === 'review' && latestSession ? (
        <section className="panel stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">Session review</p>
              <h2>Positive score report</h2>
            </div>
            <button className="button" onClick={() => setScreen('home')}>
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
                      {formatProblem(question)} — entered <strong>{question.userAnswer === '' ? 'no answer' : question.userAnswer}</strong>, correct answer <strong>{getCorrectAnswer(question)}</strong>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="success-note">Perfect session — no missed or unanswered problems.</p>
            )}
          </div>

          <div className="panel inset">
            <h3>How practice works now</h3>
            <ul className="bullet-list">
              <li>Skipped problems are included directly.</li>
              <li>Wrong problems are included directly.</li>
              <li>Single-digit multiplication misses can still expand into full digit families like 7 × 0 through 9.</li>
              <li>Any weak test family adds more practice of that same family.</li>
            </ul>
          </div>

          <div className="action-row split wrap">
            <button className="button" onClick={startTest}>
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
                    Your answer: <strong>{question.userAnswer || '—'}</strong>
                  </p>
                  {!correct ? (
                    <p>
                      Correct answer: <strong>{correctAnswer}</strong>
                    </p>
                  ) : (
                    <p className="success-note">Correct — nice work.</p>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {screen === 'practice' && practiceState ? (
        <section className="panel stack test-panel">
          <div className="session-compact-head">
            <div>
              <p className="eyebrow">Math Math</p>
              <strong>{activeUser?.name ?? 'Learner'}</strong>
            </div>
            <div className="session-compact-status">Practice mode</div>
            <button className="button subtle-button" onClick={() => setScreen('home')}>
              Home
            </button>
          </div>

          <div className="summary-grid compact">
            <div className="stat-card celebrate">
              <span className="stat-label">Current streak</span>
              <strong>{practiceState.streak}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Best streak</span>
              <strong>{practiceState.longestStreak}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Focus set</span>
              <strong>{pluralize('problem', practiceState.pool.length)}</strong>
            </div>
          </div>

          <div className="panel inset compact-note">
            <strong>Practice options now built in:</strong>
            <span className="subtle"> skipped problems + exact wrong problems + more from the same family, plus digit-family multiplication when that signal exists.</span>
          </div>

          <div className="problem-card">
            <div className="section-head compact-gap">
              <div>
                <p className="eyebrow">{FAMILY_LABELS[practiceState.currentProblem.family]}</p>
                <p className="subtle">One at a time, no timer</p>
              </div>
              <button
                type="button"
                className="icon-button"
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
              <div className="hint-box">
                <h3>Ways to think about it</h3>
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
              <button type="submit" className="button primary">
                Check answer
              </button>
            </form>
            {practiceMessage ? <p className="subtle">{practiceMessage}</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default App
