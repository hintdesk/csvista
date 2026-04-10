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
  filterValues?: Record<string, string>
  filterField?: string
  filterValue?: string
}

export type QueryFilteredRowsParams = {
  filterValues?: Record<string, string>
  filterField?: string
  filterValue?: string
}

export type QueryProjectRowsResult = {
  rows: Record<string, string>[]
  fields: string[]
  total: number
  sql: string
}

type CacheInfo = {
  rows: Record<string, string>[]
  fields: string[]
}

const FIELD_ORDER_META_KEY = '__csvista_meta__'
const FIELD_ORDER_META_VALUE = 'field-order'

let dbPromise: Promise<IDBPDatabase> | null = null
let cache: CacheInfo | null = null

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

function normalizeFieldOrder(fields: unknown[]): string[] {
  const nextFields: string[] = []

  for (const field of fields) {
    if (typeof field !== 'string') {
      continue
    }

    const trimmedField = field.trim()
    if (!trimmedField) {
      continue
    }

    if (nextFields.includes(trimmedField)) {
      continue
    }

    nextFields.push(trimmedField)
  }

  return nextFields
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

function buildSqlLikeQuery(projectId: string, params: QueryProjectRowsParams) {
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

  if (params.sortField) {
    parts.push(`ORDER BY "${params.sortField}" ${params.sortDirection === 'desc' ? 'DESC' : 'ASC'}`)
  }

  const offset = (Math.max(params.page, 1) - 1) * Math.max(params.pageSize, 1)
  parts.push(`LIMIT ${Math.max(params.pageSize, 1)} OFFSET ${offset}`)

  return parts.join(' ')
}

function getActiveFilters(params: QueryProjectRowsParams | QueryFilteredRowsParams): Record<string, string> {
  const normalizedFilters: Record<string, string> = {}

  for (const [field, value] of Object.entries(params.filterValues ?? {})) {
    const trimmedField = field.trim()
    const trimmedValue = value.trim()
    if (!trimmedField || !trimmedValue) {
      continue
    }

    normalizedFilters[trimmedField] = trimmedValue
  }

  const legacyField = params.filterField?.trim() ?? ''
  const legacyValue = params.filterValue?.trim() ?? ''
  if (legacyField && legacyValue && !normalizedFilters[legacyField]) {
    normalizedFilters[legacyField] = legacyValue
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

function sanitizeStoredRows(rawRows: unknown[]): CacheInfo {
  const rows: Record<string, string>[] = []
  let fieldsFromMeta: string[] = []

  for (const row of rawRows) {
    if (typeof row === 'object' && row !== null) {
      const metadataCandidate = row as Record<string, unknown>
      if (metadataCandidate[FIELD_ORDER_META_KEY] === FIELD_ORDER_META_VALUE && Array.isArray(metadataCandidate.fields)) {
        fieldsFromMeta = normalizeFieldOrder(metadataCandidate.fields)
        continue
      }
    }

    const nextRow: Record<string, string> = {}
    if (typeof row !== 'object' || row === null) {
      continue
    }

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

  const fields = fieldsFromMeta.length > 0 ? fieldsFromMeta : rows.length > 0 ? Object.keys(rows[0]) : []

  return {
    rows,
    fields,
  }
}

async function load(projectId: string): Promise<CacheInfo> {
  const db = await getDb()
  if (!db.objectStoreNames.contains(projectId)) {
    const emptyEntry: CacheInfo = {
      rows: [],
      fields: [],
    }
    cache = emptyEntry
    return emptyEntry
  }

  const rawRows = await db.getAll(projectId)
  const sanitizedData = sanitizeStoredRows(rawRows)
  const rows = sanitizedData.rows
  const fields = sanitizedData.fields
  const cacheEntry: CacheInfo = {
    rows,
    fields,
  }
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

    const fields = normalizeFieldOrder(parseResult.meta.fields ?? [])
    const rows = normalizeCsvRows(parseResult.data, fields)
    const db = await getDb()
    const transaction = db.transaction(projectId, 'readwrite')
    const store = transaction.objectStore(projectId)
    await store.clear()

    await store.add({
      [FIELD_ORDER_META_KEY]: FIELD_ORDER_META_VALUE,
      fields,
    })

    for (const row of rows) {
      await store.add(row)
    }

    await transaction.done
    cache = {
      rows,
      fields,
    }

    return {
      totalRows: rows.length,
      fields,
    }
  },

  async search(projectId: string, params: QueryProjectRowsParams): Promise<QueryProjectRowsResult> {
    const cachedEntry = cache ?? (await load(projectId))
    const rows = cachedEntry.rows
    const fields = cachedEntry.fields
    const activeFilters = getActiveFilters(params)

    let processedRows = rows
    for (const [field, value] of Object.entries(activeFilters)) {
      processedRows = processedRows.filter((row) => matchesFieldFilterValue(row[field] ?? '', value))
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

  async filter(projectId: string, params: QueryFilteredRowsParams): Promise<Record<string, string>[]> {
    const cachedEntry = cache ?? (await load(projectId))
    const rows = cachedEntry.rows
    const activeFilters = getActiveFilters(params)

    let processedRows = rows
    for (const [field, value] of Object.entries(activeFilters)) {
      processedRows = processedRows.filter((row) => matchesFieldFilterValue(row[field] ?? '', value))
    }

    return processedRows
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
    cache = null
  },

  clearCache(): void {
    cache = null
  },
}
