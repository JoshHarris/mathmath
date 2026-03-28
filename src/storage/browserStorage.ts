import type { PracticeRunRecord, StorageAdapter, TestSessionRecord, UserProfile } from '../types'

const DB_NAME = 'mathmath-db'
const DB_VERSION = 1
const USERS_STORE = 'users'
const SESSIONS_STORE = 'testSessions'
const PRACTICE_STORE = 'practiceRuns'

interface LocalStorageShape {
  users: UserProfile[]
  testSessions: TestSessionRecord[]
  practiceRuns: PracticeRunRecord[]
}

function sortNewestFirst<T extends { createdAt?: string; startedAt?: string; completedAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aDate = a.startedAt ?? a.completedAt ?? a.createdAt ?? ''
    const bDate = b.startedAt ?? b.completedAt ?? b.createdAt ?? ''
    return bDate.localeCompare(aDate)
  })
}

class LocalStorageAdapter implements StorageAdapter {
  public readonly kind = 'localstorage' as const

  private readAll(): LocalStorageShape {
    const raw = window.localStorage.getItem(DB_NAME)
    if (!raw) {
      return { users: [], testSessions: [], practiceRuns: [] }
    }

    try {
      return JSON.parse(raw) as LocalStorageShape
    } catch {
      return { users: [], testSessions: [], practiceRuns: [] }
    }
  }

  private writeAll(value: LocalStorageShape): void {
    window.localStorage.setItem(DB_NAME, JSON.stringify(value))
  }

  async initialize(): Promise<void> {
    const current = this.readAll()
    this.writeAll(current)
  }

  async getUsers(): Promise<UserProfile[]> {
    return sortNewestFirst(this.readAll().users)
  }

  async saveUser(user: UserProfile): Promise<void> {
    const current = this.readAll()
    const nextUsers = current.users.filter((entry) => entry.id !== user.id)
    nextUsers.push(user)
    this.writeAll({ ...current, users: nextUsers })
  }

  async getTestSessions(userId: string): Promise<TestSessionRecord[]> {
    return sortNewestFirst(this.readAll().testSessions.filter((session) => session.userId === userId))
  }

  async saveTestSession(session: TestSessionRecord): Promise<void> {
    const current = this.readAll()
    const nextSessions = current.testSessions.filter((entry) => entry.id !== session.id)
    nextSessions.push(session)
    this.writeAll({ ...current, testSessions: nextSessions })
  }

  async getPracticeRuns(userId: string): Promise<PracticeRunRecord[]> {
    return sortNewestFirst(this.readAll().practiceRuns.filter((run) => run.userId === userId))
  }

  async savePracticeRun(run: PracticeRunRecord): Promise<void> {
    const current = this.readAll()
    const nextRuns = current.practiceRuns.filter((entry) => entry.id !== run.id)
    nextRuns.push(run)
    this.writeAll({ ...current, practiceRuns: nextRuns })
  }
}

class IndexedDbAdapter implements StorageAdapter {
  public readonly kind = 'indexeddb' as const
  private dbPromise: Promise<IDBDatabase> | null = null

  async initialize(): Promise<void> {
    await this.getDb()
  }

  async getUsers(): Promise<UserProfile[]> {
    const users = await this.getAll<UserProfile>(USERS_STORE)
    return sortNewestFirst(users)
  }

  async saveUser(user: UserProfile): Promise<void> {
    await this.put(USERS_STORE, user)
  }

  async getTestSessions(userId: string): Promise<TestSessionRecord[]> {
    const sessions = await this.getByIndex<TestSessionRecord>(SESSIONS_STORE, 'userId', userId)
    return sortNewestFirst(sessions)
  }

  async saveTestSession(session: TestSessionRecord): Promise<void> {
    await this.put(SESSIONS_STORE, session)
  }

  async getPracticeRuns(userId: string): Promise<PracticeRunRecord[]> {
    const runs = await this.getByIndex<PracticeRunRecord>(PRACTICE_STORE, 'userId', userId)
    return sortNewestFirst(runs)
  }

  async savePracticeRun(run: PracticeRunRecord): Promise<void> {
    await this.put(PRACTICE_STORE, run)
  }

  private async getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
        request.onupgradeneeded = () => {
          const db = request.result

          if (!db.objectStoreNames.contains(USERS_STORE)) {
            db.createObjectStore(USERS_STORE, { keyPath: 'id' })
          }

          if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
            const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
            store.createIndex('userId', 'userId', { unique: false })
          }

          if (!db.objectStoreNames.contains(PRACTICE_STORE)) {
            const store = db.createObjectStore(PRACTICE_STORE, { keyPath: 'id' })
            store.createIndex('userId', 'userId', { unique: false })
          }
        }
      })
    }

    return this.dbPromise
  }

  private async put(storeName: string, value: unknown): Promise<void> {
    const db = await this.getDb()

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.objectStore(storeName).put(value)
    })
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.getDb()

    return new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).getAll()
      request.onsuccess = () => resolve((request.result as T[]) ?? [])
      request.onerror = () => reject(request.error)
    })
  }

  private async getByIndex<T>(storeName: string, indexName: string, query: string): Promise<T[]> {
    const db = await this.getDb()

    return new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).index(indexName).getAll(query)
      request.onsuccess = () => resolve((request.result as T[]) ?? [])
      request.onerror = () => reject(request.error)
    })
  }
}

export async function createStorageAdapter(): Promise<StorageAdapter> {
  if ('indexedDB' in window) {
    try {
      const adapter = new IndexedDbAdapter()
      await adapter.initialize()
      return adapter
    } catch {
      const fallbackAdapter = new LocalStorageAdapter()
      await fallbackAdapter.initialize()
      return fallbackAdapter
    }
  }

  const adapter = new LocalStorageAdapter()
  await adapter.initialize()
  return adapter
}
