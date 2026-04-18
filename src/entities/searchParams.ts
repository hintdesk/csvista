import type { SortDirection } from "./sortDirection"

export type SearchParams = {
  Page: number
  PageSize: number
  SortField?: string
  SortDirection?: SortDirection
  FilterValues?: Record<string, string>
}