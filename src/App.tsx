import { Link, Route, Routes, matchPath, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import ChartPage from '@/pages/ChartPage'
import ProjectListPage from '@/pages/ProjectListPage'
import ProjectPage from '@/pages/ProjectPage'
import { dataService } from '@/services/dataService'
import { type Project, projectService } from '@/services/projectService'
import csvFileLogo from '@/assets/csv-file.png'

function App() {
  const location = useLocation()
  const projectMatch = matchPath('/project/:id/*', location.pathname)
  const currentProjectId = projectMatch?.params.id
  const [currentProject, setCurrentProject] = useState<Project | undefined>()

  useEffect(() => {
    dataService.clearCache()
  }, [currentProjectId])

  useEffect(() => {
    if (!currentProjectId) {
      setCurrentProject(undefined)
      return
    }

    let isCancelled = false

    const loadCurrentProject = async () => {
      const project = await projectService.getProjectById(currentProjectId)
      if (!isCancelled) {
        setCurrentProject(project)
      }
    }

    void loadCurrentProject()

    return () => {
      isCancelled = true
    }
  }, [currentProjectId])

  return (
    <div className="min-h-screen w-full">
      <header className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <img src={csvFileLogo} alt="CSVista logo" className="h-8 w-8 shrink-0 object-contain" />
          <Link to="/" className="text-xl font-semibold tracking-tight">
            CSVista
          </Link>
        </div>
      </header>

      {projectMatch ? (
        <div className="border-b px-6 py-2 text-sm text-muted-foreground">
          <nav className="flex items-center gap-2">
            <Link to="/" className="text-foreground hover:underline">
              Projects
            </Link>
            <span>→</span>
            <Link to={`/project/${currentProjectId}`} className="text-foreground hover:underline">
              {currentProject?.name ?? currentProjectId}
            </Link>
            <span>→</span>
            <Link
              to={`/project/${currentProjectId}`}
              className={location.pathname === `/project/${currentProjectId}` ? 'text-foreground' : 'hover:underline'}
            >
              Data
            </Link>
            <span>•</span>
            <Link
              to={`/project/${currentProjectId}/charts`}
              className={location.pathname === `/project/${currentProjectId}/charts` ? 'text-foreground' : 'hover:underline'}
            >
              Charts
            </Link>
          </nav>
        </div>
      ) : null}

      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/project/:id/charts" element={<ChartPage />} />
      </Routes>
    </div>
  )
}

export default App
