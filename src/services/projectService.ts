import type { Project } from '@/entities/project'
import type { ProjectChart } from '@/entities/projectChart'
import { openDB, type IDBPDatabase } from 'idb'

const DATABASE_NAME = 'csvista'
const PROJECTS_STORE_NAME = 'projects'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DATABASE_NAME, undefined, {
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

function releaseDb(db: IDBPDatabase) {
  db.close()
  dbPromise = null
}

async function ensureProjectsStore() {
  const db = await getDb()
  if (db.objectStoreNames.contains(PROJECTS_STORE_NAME)) {
    return db
  }

  const nextVersion = db.version + 1
  db.close()
  dbPromise = null

  dbPromise = openDB(DATABASE_NAME, nextVersion, {
    upgrade(upgradeDb) {
      if (!upgradeDb.objectStoreNames.contains(PROJECTS_STORE_NAME)) {
        upgradeDb.createObjectStore(PROJECTS_STORE_NAME, { keyPath: 'Id' })
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

  return dbPromise
}

function normalizeProject(item: unknown): Project | null {
  if (typeof item !== 'object' || item === null) {
    return null
  }

  const project = item as Partial<Project>
  const id = typeof project.Id === 'string' && project.Id.trim() ? project.Id : crypto.randomUUID()
  const createdAt = typeof project.CreatedAt === 'string' && project.CreatedAt ? project.CreatedAt : new Date().toISOString()
  const charts = Array.isArray(project.Charts)
    ? project.Charts
        .filter((chart): chart is ProjectChart => typeof chart === 'object' && chart !== null)
        .map<ProjectChart | null>((chart) => {
          const chartId = typeof chart.Id === 'string' && chart.Id.trim() ? chart.Id : crypto.randomUUID()
          const type = chart.Type === 'line' ? 'line' : 'bar'
          const field = typeof chart.Field === 'string' ? chart.Field.trim() : ''

          if (type === 'line') {
            return field
              ? {
                  Id: chartId,
                  Type: type,
                  Field: field,
                }
              : {
                  Id: chartId,
                  Type: type,
                }
          }

          if (!field) {
            return null
          }

          return {
            Id: chartId,
            Type: type,
            Field: field,
          }
        })
        .filter((chart): chart is ProjectChart => chart !== null)
    : []

  const fields = Array.isArray(project.Fields)
    ? project.Fields.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map((f) => f.trim())
    : []

  const visibleFields = Array.isArray(project.VisibleFields)
    ? project.VisibleFields.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map((f) => f.trim())
    : fields

  return {
    Id: id,
    Name: typeof project.Name === 'string' && project.Name.trim() ? project.Name : `Project ${id.slice(0, 8)}`,
    Description: typeof project.Description === 'string' ? project.Description : '',
    CreatedAt: createdAt,
    UpdatedAt: typeof project.UpdatedAt === 'string' && project.UpdatedAt ? project.UpdatedAt : createdAt,
    Charts: charts,
    Fields: fields,
    VisibleFields: visibleFields,
  }
}

function sortProjectsByUpdatedAt(projects: Project[]) {
  return [...projects].sort((left, right) => right.UpdatedAt.localeCompare(left.UpdatedAt))
}

export const projectService = {
  async getProjects(): Promise<Project[]> {
    const db = await ensureProjectsStore()

    try {
      const projects = await db.getAll(PROJECTS_STORE_NAME)
      return sortProjectsByUpdatedAt(projects.map(normalizeProject).filter((item): item is Project => item !== null))
    } finally {
      releaseDb(db)
    }
  },

  async getProjectById(id: string): Promise<Project | undefined> {
    const db = await ensureProjectsStore()

    try {
      const project = await db.get(PROJECTS_STORE_NAME, id)
      return normalizeProject(project) ?? undefined
    } finally {
      releaseDb(db)
    }
  },

  async createProject(payload: { name: string; description: string }): Promise<Project> {
    const now = new Date().toISOString()
    const sanitizedName = payload.name.trim()
    const projectName = sanitizedName || `Project ${new Date().toLocaleString()}`

    const project: Project = {
      Id: crypto.randomUUID(),
      Name: projectName,
      Description: payload.description.trim(),
      CreatedAt: now,
      UpdatedAt: now,
      Charts: [],
      Fields: [],
      VisibleFields: [],
    }

    const db = await ensureProjectsStore()

    try {
      await db.put(PROJECTS_STORE_NAME, project)
      return project
    } finally {
      releaseDb(db)
    }
  },

  async deleteProject(id: string): Promise<Project[]> {
    const db = await ensureProjectsStore()

    try {
      await db.delete(PROJECTS_STORE_NAME, id)
    } finally {
      releaseDb(db)
    }

    return this.getProjects()
  },

  async updateProject(id: string, payload: { name: string; description: string }): Promise<Project | undefined> {
    const nextName = payload.name.trim()
    if (!nextName) {
      return undefined
    }

    const db = await ensureProjectsStore()

    try {
      const existingProject = normalizeProject(await db.get(PROJECTS_STORE_NAME, id))
      if (!existingProject) {
        return undefined
      }

      const updatedProject: Project = {
        ...existingProject,
        Name: nextName,
        Description: payload.description.trim(),
        UpdatedAt: new Date().toISOString(),
      }

      await db.put(PROJECTS_STORE_NAME, updatedProject)
      return updatedProject
    } finally {
      releaseDb(db)
    }
  },

  async loadProject(id: string): Promise<Project | undefined> {
    const project = await this.getProjectById(id)
    if (!project) {
      return undefined
    }
    return project
  },

  async setFieldMeta(id: string, fields: string[], visibleFields: string[]): Promise<Project | undefined> {
    const db = await ensureProjectsStore()

    try {
      const existingProject = normalizeProject(await db.get(PROJECTS_STORE_NAME, id))
      if (!existingProject) {
        return undefined
      }

      const updatedProject: Project = {
        ...existingProject,
        Fields: fields,
        VisibleFields: visibleFields,
        UpdatedAt: new Date().toISOString(),
      }

      await db.put(PROJECTS_STORE_NAME, updatedProject)
      return updatedProject
    } finally {
      releaseDb(db)
    }
  },

  async setCharts(id: string, charts: ProjectChart[]): Promise<Project | undefined> {
    const db = await ensureProjectsStore()

    try {
      const existingProject = normalizeProject(await db.get(PROJECTS_STORE_NAME, id))
      if (!existingProject) {
        return undefined
      }

      const normalizedCharts = charts
        .map<ProjectChart | null>((chart) => {
          const chartType = chart.Type === 'line' ? 'line' : 'bar'
          const field = chart.Field?.trim() ?? ''

          if (chartType === 'line') {
            return field
              ? {
                  Id: chart.Id,
                  Type: chartType,
                  Field: field,
                }
              : {
                  Id: chart.Id,
                  Type: chartType,
                }
          }

          if (!field) {
            return null
          }

          return {
            Id: chart.Id,
            Type: chartType,
            Field: field,
          }
        })
        .filter((chart): chart is ProjectChart => chart !== null)

      const updatedProject: Project = {
        ...existingProject,
        Charts: normalizedCharts,
        UpdatedAt: new Date().toISOString(),
      }

      await db.put(PROJECTS_STORE_NAME, updatedProject)
      return updatedProject
    } finally {
      releaseDb(db)
    }
  },
}
