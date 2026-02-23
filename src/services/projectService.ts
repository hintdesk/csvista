import { openDB, type IDBPDatabase } from 'idb'

export type Project = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  charts: ProjectChart[]
}

export type ProjectChart = {
  id: string
  field: string
}

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
        upgradeDb.createObjectStore(PROJECTS_STORE_NAME, { keyPath: 'id' })
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
  const id = typeof project.id === 'string' && project.id.trim() ? project.id : crypto.randomUUID()
  const createdAt = typeof project.createdAt === 'string' && project.createdAt ? project.createdAt : new Date().toISOString()
  const charts = Array.isArray(project.charts)
    ? project.charts
        .filter((chart): chart is ProjectChart => typeof chart === 'object' && chart !== null)
        .map((chart) => ({
          id: typeof chart.id === 'string' && chart.id.trim() ? chart.id : crypto.randomUUID(),
          field: typeof chart.field === 'string' ? chart.field : '',
        }))
        .filter((chart) => chart.field.trim().length > 0)
    : []

  return {
    id,
    name: typeof project.name === 'string' && project.name.trim() ? project.name : `Project ${id.slice(0, 8)}`,
    description: typeof project.description === 'string' ? project.description : '',
    createdAt,
    updatedAt: typeof project.updatedAt === 'string' && project.updatedAt ? project.updatedAt : createdAt,
    charts,
  }
}

function sortProjectsByUpdatedAt(projects: Project[]) {
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
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
      id: crypto.randomUUID(),
      name: projectName,
      description: payload.description.trim(),
      createdAt: now,
      updatedAt: now,
      charts: [],
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
        name: nextName,
        description: payload.description.trim(),
        updatedAt: new Date().toISOString(),
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

  async updateProjectCharts(id: string, charts: ProjectChart[]): Promise<Project | undefined> {
    const db = await ensureProjectsStore()

    try {
      const existingProject = normalizeProject(await db.get(PROJECTS_STORE_NAME, id))
      if (!existingProject) {
        return undefined
      }

      const normalizedCharts = charts
        .filter((chart) => chart.field.trim().length > 0)
        .map((chart) => ({
          id: chart.id,
          field: chart.field,
        }))

      const updatedProject: Project = {
        ...existingProject,
        charts: normalizedCharts,
        updatedAt: new Date().toISOString(),
      }

      await db.put(PROJECTS_STORE_NAME, updatedProject)
      return updatedProject
    } finally {
      releaseDb(db)
    }
  },
}
