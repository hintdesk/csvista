import Papa from 'papaparse'
import Dexie from 'dexie'
import { db, DATABASE_NAME, PROJECTS_TABLE_NAME } from './db'

type OpenIndexedDbOptions = {
  version?: number
  storeToCreate?: string
  storeToDelete?: string
  indexFields?: string[]
  rowsToSeed?: Record<string, string>[]
}

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

function openIndexedDb(options: OpenIndexedDbOptions = {}): Promise<IDBDatabase> {
  const { version, storeToCreate, storeToDelete, indexFields, rowsToSeed } = options

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, version)

    request.onupgradeneeded = () => {
      const upgradeDb = request.result

      if (!upgradeDb.objectStoreNames.contains(PROJECTS_TABLE_NAME)) {
        upgradeDb.createObjectStore(PROJECTS_TABLE_NAME, { keyPath: 'id' })
      }

      if (storeToDelete && upgradeDb.objectStoreNames.contains(storeToDelete)) {
        upgradeDb.deleteObjectStore(storeToDelete)
      }

      if (storeToCreate && !upgradeDb.objectStoreNames.contains(storeToCreate)) {
        const store = upgradeDb.createObjectStore(storeToCreate, { keyPath: 'id', autoIncrement: true })
        for (const field of indexFields ?? []) {
          try {
            store.createIndex(field, field, { unique: false })
          } catch {
            // Ignore invalid or duplicate index definitions.
          }
        }

        for (const row of rowsToSeed ?? []) {
          store.add(row)
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab.'))
  })
}

function normalizeIndexFields(fields: string[]): string[] {
  return Array.from(new Set(fields.map((field) => field.trim()).filter(Boolean))).sort()
}

async function hasSameProjectStoreSchema(openedDb: IDBDatabase, projectId: string, fields: string[]): Promise<boolean> {
  if (!openedDb.objectStoreNames.contains(projectId)) {
    return false
  }

  const readTransaction = openedDb.transaction(projectId, 'readonly')
  const store = readTransaction.objectStore(projectId)
  const currentIndexes = Array.from(store.indexNames).sort()
  await waitForTransaction(readTransaction)

  const nextIndexes = normalizeIndexFields(fields)
  return currentIndexes.length === nextIndexes.length && currentIndexes.every((indexName, index) => indexName === nextIndexes[index])
}

async function importRowsIntoProjectStore(projectId: string, fields: string[], rows: Record<string, string>[]): Promise<void> {
  await db.open()
  const openedDb = db.backendDB()
  const hasStore = openedDb.objectStoreNames.contains(projectId)
  const sameSchema = hasStore ? await hasSameProjectStoreSchema(openedDb, projectId, fields) : false

  if (hasStore && sameSchema) {
    const transaction = openedDb.transaction(projectId, 'readwrite')
    const store = transaction.objectStore(projectId)
    await waitForRequest(store.clear())
    for (const row of rows) {
      await waitForRequest(store.add(row))
    }
    await waitForTransaction(transaction)
    return
  }

  const nextVersion = openedDb.version + 1
  db.close()

  const upgradedDb = await openIndexedDb({
    version: nextVersion,
    storeToCreate: projectId,
    storeToDelete: hasStore ? projectId : undefined,
    indexFields: normalizeIndexFields(fields),
    rowsToSeed: rows,
  })
  upgradedDb.close()
  await db.open()
}

async function deleteProjectStore(projectId: string): Promise<void> {
  await db.open()
  const openedDb = db.backendDB()
  if (!openedDb.objectStoreNames.contains(projectId)) {
    return
  }

  const transaction = openedDb.transaction(projectId, 'readwrite')
  await waitForRequest(transaction.objectStore(projectId).clear())
  await waitForTransaction(transaction)
}

async function hasProjectStore(projectId: string): Promise<boolean> {
  await db.open()
  return db.backendDB().objectStoreNames.contains(projectId)
}


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
    parts.push(`WHERE "${params.filterField}" LIKE '${escapedValue}%'`)
  }

  if (params.sortField) {
    parts.push(`ORDER BY "${params.sortField}" ${params.sortDirection === 'desc' ? 'DESC' : 'ASC'}`)
  }

  const offset = (Math.max(params.page, 1) - 1) * Math.max(params.pageSize, 1)
  parts.push(`LIMIT ${Math.max(params.pageSize, 1)} OFFSET ${offset}`)

  return parts.join(' ')
}

function getPrimaryKeySchema(store: IDBObjectStore): string {
  const keyPath = store.keyPath

  if (typeof keyPath === 'string' && keyPath.length > 0) {
    return `${store.autoIncrement ? '++' : ''}${keyPath}`
  }

  if (Array.isArray(keyPath) && keyPath.length > 0) {
    return `[${keyPath.join('+')}]`
  }

  return store.autoIncrement ? '++' : ''
}

function getIndexesSchema(store: IDBObjectStore): string[] {
  return Array.from(store.indexNames).map((indexName) => {
    const index = store.index(indexName)
    const keyPath =
      typeof index.keyPath === 'string'
        ? index.keyPath
        : Array.isArray(index.keyPath) && index.keyPath.length > 0
          ? `[${index.keyPath.join('+')}]`
          : indexName

    const uniquePrefix = index.unique ? '&' : ''
    const multiEntryPrefix = index.multiEntry ? '*' : ''
    return `${uniquePrefix}${multiEntryPrefix}${keyPath}`
  })
}

function buildStoreSchema(store: IDBObjectStore): string {
  const primaryKey = getPrimaryKeySchema(store)
  const indexes = getIndexesSchema(store)
  return [primaryKey, ...indexes].filter(Boolean).join(', ')
}

async function openRuntimeDexie(): Promise<Dexie> {
  await db.open()
  const backendDb = db.backendDB()
  const storeNames = Array.from(backendDb.objectStoreNames)
  const schema: Record<string, string> = {}

  if (storeNames.length > 0) {
    const transaction = backendDb.transaction(storeNames, 'readonly')
    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName)
      schema[storeName] = buildStoreSchema(store)
    }
    await waitForTransaction(transaction)
  }

  const runtimeDb = new Dexie(DATABASE_NAME)
  runtimeDb.version(backendDb.version / 10).stores(schema)
  await runtimeDb.open()
  return runtimeDb
}

function toDisplayRows(rows: Record<string, unknown>[]): Record<string, string>[] {
  return rows.map((rawRow) => {
    const nextRow: Record<string, string> = {}
    for (const [key, value] of Object.entries(rawRow)) {
      if (key === 'id') {
        continue
      }

      nextRow[key] = value == null ? '' : String(value)
    }

    return nextRow
  })
}

export const dataService = {
  async importCsv(projectId: string, csvText: string): Promise<{ totalRows: number; fields: string[] }> {
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
    await importRowsIntoProjectStore(projectId, fields, rows)

    return {
      totalRows: rows.length,
      fields,
    }
  },

  async queryProjectRows(projectId: string, params: QueryProjectRowsParams): Promise<QueryProjectRowsResult> {
    if (!(await hasProjectStore(projectId))) {
      return {
        rows: [],
        fields: [],
        total: 0,
        sql: buildSqlLikeQuery(projectId, params),
      }
    }

    const runtimeDb = await openRuntimeDexie()

    try {
      const table = runtimeDb.table<Record<string, unknown>, unknown>(projectId)
      const normalizedFilterValue = params.filterValue?.trim() ?? ''
      const page = Math.max(params.page, 1)
      const pageSize = Math.max(params.pageSize, 1)
      const offset = (page - 1) * pageSize
      const hasFilter = Boolean(params.filterField && normalizedFilterValue)
      const hasSort = Boolean(params.sortField)
      const isDesc = params.sortDirection === 'desc'
      const filterField = params.filterField ?? ''
      const sortField = params.sortField ?? ''

      let total = 0
      let paginatedRows: Record<string, string>[] = []

      if (hasFilter && hasSort && filterField === sortField) {
        let collection = table.where(filterField).startsWithIgnoreCase(normalizedFilterValue)
        if (isDesc) {
          collection = collection.reverse()
        }

        total = await collection.count()
        const rawRows = await collection.offset(offset).limit(pageSize).toArray()
        paginatedRows = toDisplayRows(rawRows)
      } else if (hasFilter && hasSort && filterField && sortField) {
        const filteredCollection = table.where(filterField).startsWithIgnoreCase(normalizedFilterValue)
        total = await filteredCollection.count()

        const sortedRows = await filteredCollection.sortBy(sortField)
        const arrangedRows = isDesc ? sortedRows.reverse() : sortedRows
        paginatedRows = toDisplayRows(arrangedRows.slice(offset, offset + pageSize))
      } else if (hasFilter && filterField) {
        let collection = table.where(filterField).startsWithIgnoreCase(normalizedFilterValue)
        total = await collection.count()
        const rawRows = await collection.offset(offset).limit(pageSize).toArray()
        paginatedRows = toDisplayRows(rawRows)
      } else if (hasSort && sortField) {
        let collection = table.orderBy(sortField)
        if (isDesc) {
          collection = collection.reverse()
        }

        total = await table.count()
        const rawRows = await collection.offset(offset).limit(pageSize).toArray()
        paginatedRows = toDisplayRows(rawRows)
      } else {
        total = await table.count()
        const rawRows = await table.offset(offset).limit(pageSize).toArray()
        paginatedRows = toDisplayRows(rawRows)
      }

      const fields = paginatedRows.length > 0 ? Object.keys(paginatedRows[0]) : []

      return {
        rows: paginatedRows,
        fields,
        total,
        sql: buildSqlLikeQuery(projectId, params),
      }
    } finally {
      runtimeDb.close()
    }
  },

  async deleteProjectTable(projectId: string): Promise<void> {
    await deleteProjectStore(projectId)
  },
}
