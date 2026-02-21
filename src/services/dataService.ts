import { openDB, type IDBPDatabase } from 'idb'
import Papa from 'papaparse'

const DATABASE_NAME = 'csvista'
const PROJECTS_STORE_NAME = 'projects'

export type SortDirection = 'asc' | 'desc'

export type QueryProjectRowsParams = {
  page: number
  pageSize: number
  sortField?: string
  sortDirection?: SortDirection
  filterField?: string
  filterValue?: string
}

export type QueryProjectRowsResult = {
  rows: Record<string, string>[]
  fields: string[]
  total: number
  sql: string
}

type ProjectRowsCacheEntry = {
  rows: Record<string, string>[]
  fields: string[]
}

let dbPromise: Promise<IDBPDatabase> | null = null
const projectRowsCache = new Map<string, ProjectRowsCacheEntry>()

function getDb(version?: number, storeToCreate?: string) {
  if (!dbPromise || version !== undefined) {
    dbPromise = openDB(DATABASE_NAME, version, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PROJECTS_STORE_NAME)) {
          db.createObjectStore(PROJECTS_STORE_NAME, { keyPath: 'id' })
        }

        if (storeToCreate && !db.objectStoreNames.contains(storeToCreate)) {
          db.createObjectStore(storeToCreate, { keyPath: 'id', autoIncrement: true })
        }
      },
      blocked() {
        dbPromise = null
      },
      blocking() {
        dbPromise = null
      },
      terminated() {
        dbPromise = null
      },
    })
  }

  return dbPromise
}

async function ensureProjectStore(projectId: string): Promise<void> {
  const db = await getDb()
  if (db.objectStoreNames.contains(projectId)) {
    return
  }

  const nextVersion = db.version + 1
  db.close()
  dbPromise = null

  await getDb(nextVersion, projectId).then((nextDb) => {
    if (!nextDb.objectStoreNames.contains(projectId)) {
      throw new Error('Unable to create a project table in IndexedDB.')
    }
  })
}

async function deleteProjectStore(projectId: string): Promise<void> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(projectId)) {
    return
  }

  const nextVersion = db.version + 1
  db.close()
  dbPromise = null

  dbPromise = openDB(DATABASE_NAME, nextVersion, {
    upgrade(upgradeDb) {
      if (!upgradeDb.objectStoreNames.contains(PROJECTS_STORE_NAME)) {
        upgradeDb.createObjectStore(PROJECTS_STORE_NAME, { keyPath: 'id' })
      }

      if (upgradeDb.objectStoreNames.contains(projectId)) {
        upgradeDb.deleteObjectStore(projectId)
      }
    },
    blocked() {
      dbPromise = null
    },
    blocking() {
      dbPromise = null
    },
    terminated() {
      dbPromise = null
    },
  })

  await dbPromise
}

function normalizeCsvRows(rows: unknown[]): Record<string, string>[] {
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => {
      const nextRow: Record<string, string> = {}
      for (const [key, value] of Object.entries(row)) {
        if (!key.trim()) {
          continue
        }

        nextRow[key] = value == null ? '' : String(value)
      }

      return nextRow
    })
    .filter((row) => Object.keys(row).length > 0)
}

function buildSqlLikeQuery(projectId: string, params: QueryProjectRowsParams) {
  const parts = [`SELECT * FROM "${projectId}"`]

  if (params.filterField && params.filterValue) {
    const escapedValue = params.filterValue.replaceAll("'", "''")
    parts.push(`WHERE "${params.filterField}" LIKE '%${escapedValue}%'`)
  }

  if (params.sortField) {
    parts.push(`ORDER BY "${params.sortField}" ${params.sortDirection === 'desc' ? 'DESC' : 'ASC'}`)
  }

  const offset = (Math.max(params.page, 1) - 1) * Math.max(params.pageSize, 1)
  parts.push(`LIMIT ${Math.max(params.pageSize, 1)} OFFSET ${offset}`)

  return parts.join(' ')
}

function sortRows(rows: Record<string, string>[], field: string, direction: SortDirection) {
  const multiplier = direction === 'desc' ? -1 : 1

  return [...rows].sort((left, right) => {
    const leftValue = left[field] ?? ''
    const rightValue = right[field] ?? ''
    return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }) * multiplier
  })
}

function sanitizeStoredRows(rawRows: unknown[]): Record<string, string>[] {
  return rawRows.map((row) => {
    const nextRow: Record<string, string> = {}
    if (typeof row !== 'object' || row === null) {
      return nextRow
    }

    for (const [key, value] of Object.entries(row)) {
      if (key === 'id') {
        continue
      }

      nextRow[key] = value == null ? '' : String(value)
    }

    return nextRow
  })
}

async function loadAndCacheProjectRows(projectId: string): Promise<ProjectRowsCacheEntry> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(projectId)) {
    const emptyEntry: ProjectRowsCacheEntry = {
      rows: [],
      fields: [],
    }
    projectRowsCache.set(projectId, emptyEntry)
    return emptyEntry
  }

  const rawRows = await db.getAll(projectId)
  const rows = sanitizeStoredRows(rawRows)
  const fields = rows.length > 0 ? Object.keys(rows[0]) : []
  const cacheEntry: ProjectRowsCacheEntry = {
    rows,
    fields,
  }
  projectRowsCache.set(projectId, cacheEntry)

  return cacheEntry
}

export const dataService = {
  async importCsv(projectId: string, csvText: string): Promise<{ totalRows: number; fields: string[] }> {
    await ensureProjectStore(projectId)
    const parseResult = Papa.parse<Record<string, unknown>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    })

    if (parseResult.errors.length > 0) {
      throw new Error(parseResult.errors[0]?.message ?? 'Unable to parse CSV file.')
    }

    const rows = normalizeCsvRows(parseResult.data)
    const fields = rows.length > 0 ? Object.keys(rows[0]) : []
    const db = await getDb()
    const transaction = db.transaction(projectId, 'readwrite')
    const store = transaction.objectStore(projectId)
    await store.clear()

    for (const row of rows) {
      await store.add(row)
    }

    await transaction.done
    projectRowsCache.set(projectId, {
      rows,
      fields,
    })

    return {
      totalRows: rows.length,
      fields,
    }
  },

  async queryProjectRows(projectId: string, params: QueryProjectRowsParams): Promise<QueryProjectRowsResult> {
    const cachedEntry = projectRowsCache.get(projectId) ?? (await loadAndCacheProjectRows(projectId))
    const rows = cachedEntry.rows
    const fields = cachedEntry.fields
    const normalizedFilterValue = params.filterValue?.trim() ?? ''

    let processedRows = rows
    if (params.filterField && normalizedFilterValue) {
      const queryText = normalizedFilterValue.toLocaleLowerCase()
      processedRows = processedRows.filter((row) => (row[params.filterField!] ?? '').toLocaleLowerCase().includes(queryText))
    }

    if (params.sortField) {
      processedRows = sortRows(processedRows, params.sortField, params.sortDirection ?? 'asc')
    }

    const page = Math.max(params.page, 1)
    const pageSize = Math.max(params.pageSize, 1)
    const startIndex = (page - 1) * pageSize
    const paginatedRows = processedRows.slice(startIndex, startIndex + pageSize)

    return {
      rows: paginatedRows,
      fields,
      total: processedRows.length,
      sql: buildSqlLikeQuery(projectId, params),
    }
  },

  async deleteProjectTable(projectId: string): Promise<void> {
    await deleteProjectStore(projectId)
    projectRowsCache.delete(projectId)
  },
}
