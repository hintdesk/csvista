import { Link, Route, Routes, matchPath, useLocation } from 'react-router-dom'
import ProjectListPage from '@/pages/ProjectListPage'
import ProjectPage from '@/pages/ProjectPage'
import { projectService } from '@/services/projectService'

function App() {
  const location = useLocation()
  const projectMatch = matchPath('/project/:id', location.pathname)
  const currentProjectId = projectMatch?.params.id
  const currentProject = currentProjectId ? projectService.getProjectById(currentProjectId) : undefined

  return (
    <div className="min-h-screen w-full">
      <header className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="CSVista logo" className="shrink-0">
            <rect x="2" y="2" width="28" height="28" rx="6" className="fill-primary/15 stroke-primary" strokeWidth="2" />
            <path d="M9 11.5h14M9 16h14M9 20.5h14" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="11.5" r="1" className="fill-primary" />
            <circle cx="12" cy="16" r="1" className="fill-primary" />
            <circle cx="12" cy="20.5" r="1" className="fill-primary" />
          </svg>
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
            <span>{currentProject?.name ?? currentProjectId}</span>
          </nav>
        </div>
      ) : null}

      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
    </div>
  )
}

export default App
