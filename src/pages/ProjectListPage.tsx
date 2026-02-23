import { type MouseEvent, useEffect, useState } from 'react'
import { Trash } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { dataService } from '@/services/dataService'
import { type Project, projectService } from '@/services/projectService'

export default function ProjectListPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [pendingDeleteProject, setPendingDeleteProject] = useState<Project | null>(null)

  useEffect(() => {
    let isCancelled = false

    const loadProjects = async () => {
      const projectList = await projectService.getProjects()
      if (!isCancelled) {
        setProjects(projectList)
      }
    }

    void loadProjects()

    return () => {
      isCancelled = true
    }
  }, [])

  const onDeleteProject = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation()
    const project = projects.find((item) => item.id === id)
    if (!project) {
      return
    }

    setPendingDeleteProject(project)
    setIsDeleteDialogOpen(true)
  }

  const onConfirmDeleteProject = async () => {
    if (!pendingDeleteProject) {
      return
    }

    await dataService.delete(pendingDeleteProject.id)
    const nextProjects = await projectService.deleteProject(pendingDeleteProject.id)
    setProjects(nextProjects)
    setPendingDeleteProject(null)
    setIsDeleteDialogOpen(false)
  }

  const onCancelDeleteProject = () => {
    setPendingDeleteProject(null)
    setIsDeleteDialogOpen(false)
    navigate('/')
  }

  const onOpenProject = async (id: string) => {
    const loadedProject = await projectService.loadProject(id)
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
    setNewProjectDescription('')
  }

  const onSaveCreateProject = async () => {
    const trimmedName = newProjectName.trim()
    if (!trimmedName) {
      return
    }

    await projectService.createProject({
      name: trimmedName,
      description: newProjectDescription,
    })
    setProjects(await projectService.getProjects())
    setIsCreateDialogOpen(false)
    setNewProjectName('')
    setNewProjectDescription('')
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Projects</h1>

      <Card className="gap-0 overflow-hidden py-0">
        {projects.length === 0 ? (
          <CardContent className="px-4 py-8 text-center text-sm text-muted-foreground">No projects yet.</CardContent>
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
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Delete project ${project.name}`}
                  onClick={(event) => onDeleteProject(event, project.id)}
                >
                  <Trash />
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
            <DialogDescription>Enter your new project name.</DialogDescription>
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

          <Textarea placeholder="Description" value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} />

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

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{pendingDeleteProject?.name ?? ''}&quot;?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancelDeleteProject}>
              No
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirmDeleteProject}>
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
