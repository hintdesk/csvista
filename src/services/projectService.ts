export type Project = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

const PROJECTS_STORAGE_KEY = 'projects'
const ACTIVE_PROJECT_STORAGE_KEY = 'activeProjectId'

function parseProjects(raw: string | null): Project[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item): item is Partial<Project> => typeof item === 'object' && item !== null)
      .map((item) => {
        const id = typeof item.id === 'string' && item.id.trim() ? item.id : crypto.randomUUID()
        const name = typeof item.name === 'string' && item.name.trim() ? item.name : `Project ${id.slice(0, 8)}`
        const createdAt = typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString()
        const updatedAt = typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : createdAt

        return {
          id,
          name,
          createdAt,
          updatedAt,
        }
      })
  } catch {
    return []
  }
}

function saveProjects(projects: Project[]) {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
}

export const projectService = {
  getProjects(): Project[] {
    return parseProjects(localStorage.getItem(PROJECTS_STORAGE_KEY))
  },

  getProjectById(id: string): Project | undefined {
    return this.getProjects().find((project) => project.id === id)
  },

  createProject(name: string): Project {
    const now = new Date().toISOString()
    const sanitizedName = name.trim()
    const projectName = sanitizedName || `Project ${new Date().toLocaleString()}`

    const project: Project = {
      id: crypto.randomUUID(),
      name: projectName,
      createdAt: now,
      updatedAt: now,
    }

    const projects = this.getProjects()
    const nextProjects = [project, ...projects]
    saveProjects(nextProjects)
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, project.id)

    return project
  },

  deleteProject(id: string): Project[] {
    const nextProjects = this.getProjects().filter((project) => project.id !== id)
    saveProjects(nextProjects)

    if (localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) === id) {
      localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY)
    }

    return nextProjects
  },

  updateProject(id: string, payload: { name: string }): Project | undefined {
    const nextName = payload.name.trim()
    if (!nextName) {
      return undefined
    }

    const projects = this.getProjects()
    let updatedProject: Project | undefined

    const nextProjects = projects.map((project) => {
      if (project.id !== id) {
        return project
      }

      updatedProject = {
        ...project,
        name: nextName,
        updatedAt: new Date().toISOString(),
      }

      return updatedProject
    })

    if (!updatedProject) {
      return undefined
    }

    saveProjects(nextProjects)
    return updatedProject
  },

  loadProject(id: string): Project | undefined {
    const project = this.getProjectById(id)
    if (!project) {
      return undefined
    }

    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, id)
    return project
  },
}
