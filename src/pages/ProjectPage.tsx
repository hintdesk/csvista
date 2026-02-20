import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, Pencil, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { dataService, type SortDirection } from '@/services/dataService'
import { type Project, projectService } from '@/services/projectService'

const PAGE_SIZE = 1000

export default function ProjectPage() {
  const { id = '' } = useParams()
  const [project, setProject] = useState<Project | undefined>()
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fields, setFields] = useState<string[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState('')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filterField, setFilterField] = useState('')
  const [filterInputValue, setFilterInputValue] = useState('')
  const [appliedFilterValue, setAppliedFilterValue] = useState('')
  const [sqlPreview, setSqlPreview] = useState('')
  const [selectedRow, setSelectedRow] = useState<Record<string, string> | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editProjectName, setEditProjectName] = useState('')
  const [isLoadingRows, setIsLoadingRows] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) {
      return
    }

    const loadedProject = projectService.loadProject(id)
    setProject(loadedProject)
    setEditProjectName(loadedProject?.name ?? '')
  }, [id])

  useEffect(() => {
    if (!project) {
      return
    }

    let isCancelled = false

    const loadRows = async () => {
      setIsLoadingRows(true)
      setErrorMessage('')

      try {
        const result = await dataService.queryProjectRows(project.id, {
          page,
          pageSize: PAGE_SIZE,
          sortField: sortField || undefined,
          sortDirection,
          filterField: filterField || undefined,
          filterValue: appliedFilterValue || undefined,
        })

        if (isCancelled) {
          return
        }

        setRows(result.rows)
        setFields(result.fields)
        setTotalRows(result.total)
        setSqlPreview(result.sql)
        setSelectedRow(null)

        if (!filterField && result.fields.length > 0) {
          setFilterField(result.fields[0])
        }
      } catch (error) {
        if (isCancelled) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu từ IndexedDB.')
      } finally {
        if (!isCancelled) {
          setIsLoadingRows(false)
        }
      }
    }

    void loadRows()

    return () => {
      isCancelled = true
    }
  }, [appliedFilterValue, filterField, page, project, sortDirection, sortField])

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))

  const onImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!project) {
      return
    }

    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsImporting(true)
    setErrorMessage('')

    try {
      const csvText = await file.text()
      const importResult = await dataService.importCsv(project.id, csvText)

      setFields(importResult.fields)
      setSortField('')
      setFilterField(importResult.fields[0] ?? '')
      setFilterInputValue('')
      setAppliedFilterValue('')
      setPage(1)
      setSelectedRow(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import CSV thất bại.')
    } finally {
      event.target.value = ''
      setIsImporting(false)
    }
  }

  const onOpenEditDialog = () => {
    if (!project) {
      return
    }

    setEditProjectName(project.name)
    setIsEditDialogOpen(true)
  }

  const onCancelEditProject = () => {
    setIsEditDialogOpen(false)
    setEditProjectName(project?.name ?? '')
  }

  const onSaveEditProject = () => {
    if (!project) {
      return
    }

    const updatedProject = projectService.updateProject(project.id, { name: editProjectName })
    if (!updatedProject) {
      return
    }

    setProject(updatedProject)
    setIsEditDialogOpen(false)
  }

  return (
    <main className="flex min-h-screen w-full flex-col gap-4 p-6">
      {project ? (
        <section className="flex flex-col gap-4">
          <header className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit project" onClick={onOpenEditDialog}>
              <Pencil />
            </Button>
          </header>

          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting} aria-label="Import data">
              <FileSpreadsheet />
              <span>Import</span>
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImportCsv} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Sort</p>
              <div className="flex gap-2">
                <select
                  value={sortField}
                  onChange={(event) => {
                    setSortField(event.target.value)
                    setPage(1)
                  }}
                  className="h-9 w-full rounded-md border border-input bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs"
                  disabled={fields.length === 0}
                >
                  <option value="">None</option>
                  {fields.length === 0 ? <option value="">Không có field</option> : null}
                  {fields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>

                <select
                  value={sortDirection}
                  onChange={(event) => {
                    setSortDirection(event.target.value as SortDirection)
                    setPage(1)
                  }}
                  className="h-9 rounded-md border border-input bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs"
                  disabled={fields.length === 0 || !sortField}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Filter</p>
              <div className="flex gap-2">
                <select
                  value={filterField}
                  onChange={(event) => setFilterField(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs"
                  disabled={fields.length === 0}
                >
                  {fields.length === 0 ? <option value="">Không có field</option> : null}
                  {fields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
                <div className="relative w-full">
                  <Input
                    value={filterInputValue}
                    onChange={(event) => setFilterInputValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        setAppliedFilterValue(filterInputValue)
                        setPage(1)
                      }
                    }}
                    className="pr-8"
                    placeholder="Nhập giá trị filter"
                    disabled={fields.length === 0}
                  />
                  {filterInputValue ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterInputValue('')
                        setAppliedFilterValue('')
                        setPage(1)
                      }}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear filter"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {fields.map((field) => (
                        <th key={field} className="px-3 py-2 text-left font-medium">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingRows ? (
                      <tr className="border-b">
                        <td colSpan={Math.max(fields.length, 1)} className="px-3 py-4 text-center text-muted-foreground">
                          Loading...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(fields.length, 1)} className="px-3 py-4 text-center text-muted-foreground">
                          Chưa có dữ liệu.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, rowIndex) => {
                        const isSelected = selectedRow === row

                        return (
                          <tr
                            key={`${page}-${rowIndex}`}
                            className={`cursor-pointer border-b last:border-b-0 ${isSelected ? 'bg-accent/70' : 'hover:bg-accent/40'}`}
                            onClick={() => setSelectedRow(row)}
                          >
                            {fields.map((field) => (
                              <td key={`${rowIndex}-${field}`} className="px-3 py-2 align-top">
                                <div className="max-h-12 overflow-hidden text-ellipsis whitespace-pre-wrap break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                  {row[field]}
                                </div>
                              </td>
                            ))}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Page {page}/{totalPages} · {totalRows} rows · {sqlPreview}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page <= 1}>
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            {selectedRow ? (
              <aside className="sticky top-6 w-[360px] shrink-0 rounded-md border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Row detail</h2>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedRow(null)}>
                    Close
                  </Button>
                </div>

                <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto pr-1">
                  {fields.map((field) => (
                    <div key={field} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{field}</p>
                      <p className="whitespace-pre-wrap break-words text-sm">{selectedRow[field] || '-'}</p>
                    </div>
                  ))}
                </div>
              </aside>
            ) : null}
          </div>
        </section>
      ) : (
        <p>Không tìm thấy project.</p>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Cập nhật thông tin project.</DialogDescription>
          </DialogHeader>

          <Input
            placeholder="Project name"
            value={editProjectName}
            onChange={(event) => setEditProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSaveEditProject()
              }
            }}
            autoFocus
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancelEditProject}>
              Cancel
            </Button>
            <Button type="button" onClick={onSaveEditProject} disabled={!editProjectName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
