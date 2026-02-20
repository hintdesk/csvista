import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, Pencil, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { dataService, type SortDirection } from '@/services/dataService'
import { type Project, projectService } from '@/services/projectService'

const PAGE_SIZE = 10

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
  const [refreshKey, setRefreshKey] = useState(0)
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
      } catch (error) {
        if (isCancelled) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Unable to load data from IndexedDB.')
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
  }, [appliedFilterValue, filterField, page, project, refreshKey, sortDirection, sortField])

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
      setFilterField('')
      setFilterInputValue('')
      setAppliedFilterValue('')
      setPage(1)
      setSelectedRow(null)
      setRefreshKey((previous) => previous + 1)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'CSV import failed.')
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
                <Combobox
                  value={sortField || null}
                  onValueChange={(value) => {
                    setSortField((value as string) ?? '')
                    setPage(1)
                  }}
                >
                  <ComboboxInput className="w-full" placeholder="None" disabled={fields.length === 0} readOnly />
                  <ComboboxContent>
                    <ComboboxEmpty>No fields available</ComboboxEmpty>
                    <ComboboxList>
                      <ComboboxItem value="">None</ComboboxItem>
                      {fields.map((field) => (
                        <ComboboxItem key={field} value={field}>
                          {field}
                        </ComboboxItem>
                      ))}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>

                <Combobox
                  value={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                  onValueChange={(value) => {
                    if (!value) {
                      return
                    }

                    setSortDirection(value === 'Ascending' ? 'asc' : 'desc')
                    setPage(1)
                  }}
                >
                  <ComboboxInput className="w-[180px]" disabled={fields.length === 0 || !sortField} readOnly />
                  <ComboboxContent>
                    <ComboboxList>
                      <ComboboxItem value="Ascending">Ascending</ComboboxItem>
                      <ComboboxItem value="Descending">Descending</ComboboxItem>
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Filter</p>
              <div className="flex gap-2">
                <Combobox
                  value={filterField || null}
                  onValueChange={(value) => {
                    const nextFilterField = (value as string) ?? ''
                    setFilterField(nextFilterField)
                    if (!nextFilterField) {
                      setFilterInputValue('')
                      setAppliedFilterValue('')
                      setPage(1)
                    }
                  }}
                >
                  <ComboboxInput className="w-full" placeholder="None" disabled={fields.length === 0} readOnly />
                  <ComboboxContent>
                    <ComboboxEmpty>No fields available</ComboboxEmpty>
                    <ComboboxList>
                      <ComboboxItem value="">None</ComboboxItem>
                      {fields.map((field) => (
                        <ComboboxItem key={field} value={field}>
                          {field}
                        </ComboboxItem>
                      ))}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
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
                    placeholder="Enter filter value"
                    disabled={fields.length === 0 || !filterField}
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
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b">
                      {fields.map((field) => (
                        <th key={field} className="w-56 max-w-56 px-3 py-2 text-left font-medium">
                          <div className="truncate" title={field}>
                            {field}
                          </div>
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
                          No data available.
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
                              <td key={`${rowIndex}-${field}`} className="w-56 max-w-56 px-3 py-2 align-top">
                                <div
                                  className="max-h-12 overflow-hidden whitespace-pre-wrap break-all [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                                  title={row[field]}
                                >
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
                  <h2 className="text-sm font-semibold">Detail</h2>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Close row detail" onClick={() => setSelectedRow(null)}>
                    <X />
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
        <p>Project not found.</p>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Update project information.</DialogDescription>
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
