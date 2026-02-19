import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type Project, projectService } from '@/services/projectService'

export default function ProjectPage() {
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const [project, setProject] = useState<Project | undefined>()

  useEffect(() => {
    if (!id) {
      return
    }

    setProject(projectService.loadProject(id))
  }, [id])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 p-6">
      <Button type="button" variant="outline" size="sm" onClick={() => navigate('/')} className="self-start">
        Back
      </Button>
      {project ? (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-2xl">Project</CardTitle>
            <CardDescription>ID: {project.id}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-base">Name: {project.name}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <p>Không tìm thấy project.</p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
