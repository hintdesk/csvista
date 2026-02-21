import { db, type ProjectEntity } from './db'

export type Project = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

function normalizeProject(item: unknown): Project | null {
  if (typeof item !== 'object' || item === null) {
    return null
  }

  const project = item as Partial<ProjectEntity>
  const id = typeof project.id === 'string' && project.id.trim() ? project.id : crypto.randomUUID()
  const createdAt = typeof project.createdAt === 'string' && project.createdAt ? project.createdAt : new Date().toISOString()

  return {
    id,
    name: typeof project.name === 'string' && project.name.trim() ? project.name : `Project ${id.slice(0, 8)}`,
    createdAt,
    updatedAt: typeof project.updatedAt === 'string' && project.updatedAt ? project.updatedAt : createdAt,
  }
}

function sortProjectsByUpdatedAt(projects: Project[]) {
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export const projectService = {
  async getProjects(): Promise<Project[]> {
    const projects = await db.projects.toArray()
    return sortProjectsByUpdatedAt(projects.map(normalizeProject).filter((item): item is Project => item !== null))
  },

  async getProjectById(id: string): Promise<Project | undefined> {
    const project = await db.projects.get(id)
    return normalizeProject(project) ?? undefined
  },

  async createProject(name: string): Promise<Project> {
    const now = new Date().toISOString()
    const sanitizedName = name.trim()
    const projectName = sanitizedName || `Project ${new Date().toLocaleString()}`

    const project: Project = {
      id: crypto.randomUUID(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
    }

    await db.projects.put(project)
    return project
  },

  async deleteProject(id: string): Promise<Project[]> {
    await db.projects.delete(id)

    return this.getProjects()
  },

  async updateProject(id: string, payload: { name: string }): Promise<Project | undefined> {
    const nextName = payload.name.trim()
    if (!nextName) {
      return undefined
    }

    const existingProject = normalizeProject(await db.projects.get(id))
    if (!existingProject) {
      return undefined
    }

    const updatedProject: Project = {
      ...existingProject,
      name: nextName,
      updatedAt: new Date().toISOString(),
    }

    await db.projects.put(updatedProject)
    return updatedProject
  },

  async loadProject(id: string): Promise<Project | undefined> {
    const project = await this.getProjectById(id)
    if (!project) {
      return undefined
    }
    return project
  },
}
