import type { ProjectChart } from "./projectChart"

export type Project = {
  Id: string
  Name: string
  Description: string
  CreatedAt: string
  UpdatedAt: string
  Charts: ProjectChart[]
  Fields: string[]
  VisibleFields: string[]
}