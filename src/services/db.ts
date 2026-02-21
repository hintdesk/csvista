import Dexie, { type Table } from 'dexie'

export type ProjectEntity = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export const DATABASE_NAME = 'csvista'
export const PROJECTS_TABLE_NAME = 'projects'

class CsvistaDatabase extends Dexie {
  projects!: Table<ProjectEntity, string>

  constructor() {
    super(DATABASE_NAME)

    this.version(1)
      .stores({
        projects: 'id, updatedAt, createdAt',
      })
  }
}

export const db = new CsvistaDatabase()
