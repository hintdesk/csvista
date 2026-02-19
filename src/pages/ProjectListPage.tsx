import { type MouseEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { type Project, projectService } from '@/services/projectService'

export default function ProjectListPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  useEffect(() => {
    setProjects(projectService.getProjects())
  }, [])

  const onDeleteProject = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation()
    setProjects(projectService.deleteProject(id))
  }

  const onOpenProject = (id: string) => {
    const loadedProject = projectService.loadProject(id)
    if (!loadedProject) {
      return
    }

    navigate(`/project/${id}`)
  }

  const onCreateProject = () => {
    setIsCreateDialogOpen(true)
  }

  const onCancelCreateProject = () => {
    setIsCreateDialogOpen(false)
    setNewProjectName('')
  }

  const onSaveCreateProject = () => {
    const trimmedName = newProjectName.trim()
    if (!trimmedName) {
      return
    }

    projectService.createProject(trimmedName)
    setProjects(projectService.getProjects())
    setIsCreateDialogOpen(false)
    setNewProjectName('')
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Projects</h1>

      <Card className="gap-0 overflow-hidden py-0">
        {projects.length === 0 ? (
          <CardContent className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa có project nào.</CardContent>
        ) : (
          projects.map((project) => (
            <Card
              key={project.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenProject(project.id)
                }
              }}
              className="rounded-none border-x-0 border-t-0 border-b px-4 py-3 shadow-none transition-colors hover:bg-accent/60 last:border-b-0"
            >
              <CardContent className="flex items-center justify-between px-0 py-0">
                <span className="truncate">{project.name}</span>
                <Button type="button" variant="outline" size="sm" onClick={(event) => onDeleteProject(event, project.id)}>
                  Xóa
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </Card>

      <Button type="button" onClick={onCreateProject} className="self-start">
        Create project
      </Button>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>Nhập tên project mới của bạn.</DialogDescription>
          </DialogHeader>

          <Input
            placeholder="Project name"
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSaveCreateProject()
              }
            }}
            autoFocus
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancelCreateProject}>
              Cancel
            </Button>
            <Button type="button" onClick={onSaveCreateProject} disabled={!newProjectName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
