import type { CacheInfo } from '@/entities/cacheInfo'
import type { SearchParams } from '@/entities/searchParams'
import type { SearchResult } from '@/entities/searchResult'
import type { SortDirection } from '@/entities/sortDirection'
import { openDB, type IDBPDatabase } from 'idb'
import Papa from 'papaparse'

const DATABASE_NAME = 'csvista'

let dbPromise: Promise<IDBPDatabase> | null = null
let cache: CacheInfo | null = null

function getDb(version?: number, storeToCreate?: string) {
  if (!dbPromise || version !== undefined) {
    dbPromise = openDB(DATABASE_NAME, version, {
      upgrade(db) {
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

function normalizeFields(fields: unknown[]): string[] {
  const result: string[] = []

  for (const field of fields) {
    if (typeof field !== 'string') {
      continue
    }

    const trimmedField = field.trim()
    if (!trimmedField) {
      continue
    }

    if (result.includes(trimmedField)) {
      continue
    }

    result.push(trimmedField)
  }

  return result
}

function normalizeCsvRows(rows: unknown[], fieldOrder: string[]): Record<string, string>[] {
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => {
      const nextRow: Record<string, string> = {}
      for (const key of fieldOrder) {
        if (!key) {
          continue
        }

        const value = row[key]
        nextRow[key] = value == null ? '' : String(value)
      }

      return nextRow
    })
    .filter((row) => Object.keys(row).length > 0)
}

function buildSqlLikeQuery(projectId: string, params: SearchParams) {
  const parts = [`SELECT * FROM "${projectId}"`]
  const activeFilters = getActiveFilters(params)

  if (Object.keys(activeFilters).length > 0) {
    const whereClauses = Object.entries(activeFilters).map(([field, value]) => {
      const escapedField = field.replaceAll('"', '""')
      const terms = splitFilterTerms(value)

      if (terms.length === 1) {
        const escapedValue = terms[0]!.replaceAll("'", "''")
        return `"${escapedField}" LIKE '%${escapedValue}%'`
      }

      const orClauses = terms.map((term) => {
        const escapedValue = term.replaceAll("'", "''")
        return `"${escapedField}" LIKE '%${escapedValue}%'`
      })

      return `(${orClauses.join(' OR ')})`
    })

    parts.push(`WHERE ${whereClauses.join(' AND ')}`)
  }

  if (params.SortField) {
    parts.push(`ORDER BY "${params.SortField}" ${params.SortDirection === 'desc' ? 'DESC' : 'ASC'}`)
  }

  const offset = (Math.max(params.Page, 1) - 1) * Math.max(params.PageSize, 1)
  parts.push(`LIMIT ${Math.max(params.PageSize, 1)} OFFSET ${offset}`)

  return parts.join(' ')
}

function getActiveFilters(params: SearchParams): Record<string, string> {
  const normalizedFilters: Record<string, string> = {}

  for (const [field, value] of Object.entries(params.FilterValues ?? {})) {
    const trimmedField = field.trim()
    const trimmedValue = value.trim()
    if (!trimmedField || !trimmedValue) {
      continue
    }

    normalizedFilters[trimmedField] = trimmedValue
  }

  return normalizedFilters
}

function splitFilterTerms(value: string): string[] {
  return value
    .split('|')
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
}

function matchesFieldFilterValue(rowValue: string, filterValue: string): boolean {
  const queryTerms = splitFilterTerms(filterValue)
  if (queryTerms.length === 0) {
    return true
  }

  const normalizedRowValue = rowValue.toLocaleLowerCase()
  return queryTerms.some((term) => normalizedRowValue.includes(term.toLocaleLowerCase()))
}

function sortRows(rows: Record<string, string>[], field: string, direction: SortDirection) {
  const multiplier = direction === 'desc' ? -1 : 1

  return [...rows].sort((left, right) => {
    const leftValue = left[field] ?? ''
    const rightValue = right[field] ?? ''
    return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }) * multiplier
  })
}

async function load(projectId: string): Promise<CacheInfo> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(projectId)) {
    const emptyEntry: CacheInfo = { Rows: [] }
    cache = emptyEntry
    return emptyEntry
  }

  const rawRows = await db.getAll(projectId)
  const rows: Record<string, string>[] = []

  for (const row of rawRows) {
    if (typeof row !== 'object' || row === null) {
      continue
    }

    const nextRow: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      if (key === 'id') {
        continue
      }

      nextRow[key] = value == null ? '' : String(value)
    }

    if (Object.keys(nextRow).length > 0) {
      rows.push(nextRow)
    }
  }

  const cacheEntry: CacheInfo = { Rows: rows }
  cache = cacheEntry
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

    const fields = normalizeFields(parseResult.meta.fields ?? [])
    const rows = normalizeCsvRows(parseResult.data, fields)
    const db = await getDb()
    const transaction = db.transaction(projectId, 'readwrite')
    const store = transaction.objectStore(projectId)
    await store.clear()

    for (const row of rows) {
      await store.add(row)
    }

    await transaction.done
    cache = { Rows: rows }

    return { totalRows: rows.length, fields }
  },

  async get(projectId: string): Promise<Record<string, string>[]> {
    const cachedEntry = cache ?? (await load(projectId));
    const rows = cachedEntry.Rows;
    return rows;
  },

  async search(projectId: string, params: SearchParams): Promise<SearchResult> {
    const cachedEntry = cache ?? (await load(projectId))
    const rows = cachedEntry.Rows
    const activeFilters = getActiveFilters(params)

    let processedRows = rows
    for (const [field, value] of Object.entries(activeFilters)) {
      processedRows = processedRows.filter((row) => matchesFieldFilterValue(row[field] ?? '', value))
    }

    if (params.SortField) {
      processedRows = sortRows(processedRows, params.SortField, params.SortDirection ?? 'asc')
    }

    const page = Math.max(params.Page, 1)
    const pageSize = Math.max(params.PageSize, 1)
    const startIndex = (page - 1) * pageSize
    const paginatedRows = processedRows.slice(startIndex, startIndex + pageSize)

    return {
      Rows: paginatedRows,
      Total: processedRows.length,
      Sql: buildSqlLikeQuery(projectId, params),
    }
  },

  async delete(projectId: string): Promise<void> {
    const db = await getDb()
    if (!db.objectStoreNames.contains(projectId)) {
      return
    }

    const nextVersion = db.version + 1
    db.close()
    dbPromise = null

    dbPromise = openDB(DATABASE_NAME, nextVersion, {
      upgrade(upgradeDb) {
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
    cache = null
  },

  clearCache(): void {
    cache = null
  },
}
