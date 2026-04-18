import type { SortDirection } from "./sortDirection"

export type QueryParams = {
  page: number
  pageSize: number
  sortField?: string
  sortDirection?: SortDirection
  filterValues?: Record<string, string>
}