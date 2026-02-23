import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, FileSpreadsheet, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { dataService, type SortDirection } from '@/services/dataService'
import { type Project, type ProjectChart, projectService } from '@/services/projectService'

const PAGE_SIZE = 10

type AddedChart = ProjectChart

const barChartConfig = {
  count: {
    label: 'Count',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig

function createChartId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function buildFieldCountChartData(rows: Record<string, string>[], field: string) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const rawValue = (row[field] ?? '').trim()
    const value = rawValue || '(Empty)'
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count
      }

      return left.value.localeCompare(right.value, undefined, { sensitivity: 'base' })
    })
}

function truncateCategoryLabel(value: string) {
  return value.slice(0, 20)
}

function getChartHeight(categoryCount: number) {
  const minHeight = 320
  const rowHeight = 30
  const topBottomPadding = 24

  return Math.max(minHeight, categoryCount * rowHeight + topBottomPadding)
}

export default function ProjectPage() {
  const { id = '' } = useParams()
  const [project, setProject] = useState<Project | undefined>()
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [filteredRows, setFilteredRows] = useState<Record<string, string>[]>([])
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
  const [editProjectDescription, setEditProjectDescription] = useState('')
  const [isLoadingRows, setIsLoadingRows] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [charts, setCharts] = useState<AddedChart[]>([])
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false)
  const [chartDialogMode, setChartDialogMode] = useState<'create' | 'edit'>('create')
  const [selectedChartField, setSelectedChartField] = useState('')
  const [activeChartId, setActiveChartId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) {
      return
    }

    let isCancelled = false

    const loadProject = async () => {
      const loadedProject = await projectService.loadProject(id)
      if (isCancelled) {
        return
      }

      setProject(loadedProject)
      setEditProjectName(loadedProject?.name ?? '')
      setEditProjectDescription(loadedProject?.description ?? '')
      setCharts(loadedProject?.charts ?? [])
    }

    void loadProject()

    return () => {
      isCancelled = true
    }
  }, [id])

  useEffect(() => {
    const projectId = project?.id
    if (!projectId) {
      return
    }

    let isCancelled = false

    const loadRows = async () => {
      setIsLoadingRows(true)
      setErrorMessage('')

      try {
        const [result, nextFilteredRows] = await Promise.all([
          dataService.search(projectId, {
            page,
            pageSize: PAGE_SIZE,
            sortField: sortField || undefined,
            sortDirection,
            filterField: filterField || undefined,
            filterValue: appliedFilterValue || undefined,
          }),
          dataService.getFilteredRows(projectId, {
            filterField: filterField || undefined,
            filterValue: appliedFilterValue || undefined,
          }),
        ])

        if (isCancelled) {
          return
        }

        setRows(result.rows)
        setFilteredRows(nextFilteredRows)
        setFields(result.fields)
        setTotalRows(result.total)
        setSqlPreview(result.sql)
        setSelectedRow(null)
        setCharts((previous) => previous.filter((chart) => result.fields.includes(chart.field)))
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
  }, [appliedFilterValue, filterField, page, project?.id, refreshKey, sortDirection, sortField])

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
      setFilteredRows([])
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
    setEditProjectDescription(project.description)
    setIsEditDialogOpen(true)
  }

  const onCancelEditProject = () => {
    setIsEditDialogOpen(false)
    setEditProjectName(project?.name ?? '')
    setEditProjectDescription(project?.description ?? '')
  }

  const onSaveEditProject = async () => {
    if (!project) {
      return
    }

    const updatedProject = await projectService.updateProject(project.id, {
      name: editProjectName,
      description: editProjectDescription,
    })
    if (!updatedProject) {
      return
    }

    setProject(updatedProject)
    setIsEditDialogOpen(false)
  }

  const onSortByField = (field: string) => {
    if (sortField !== field) {
      setSortField(field)
      setSortDirection('asc')
      setPage(1)
      return
    }

    if (sortDirection === 'asc') {
      setSortDirection('desc')
      setPage(1)
      return
    }

    setSortField('')
    setSortDirection('asc')
    setPage(1)
  }

  const onOpenAddChartDialog = () => {
    if (fields.length === 0) {
      return
    }

    setChartDialogMode('create')
    setActiveChartId(null)
    setSelectedChartField(fields[0] ?? '')
    setIsChartDialogOpen(true)
  }

  const onOpenEditChartDialog = (chart: AddedChart) => {
    setChartDialogMode('edit')
    setActiveChartId(chart.id)
    setSelectedChartField(chart.field)
    setIsChartDialogOpen(true)
  }

  const onDeleteChart = (chartId: string) => {
    setCharts((previous) => {
      const nextCharts = previous.filter((chart) => chart.id !== chartId)

      if (project) {
        void projectService.updateProjectCharts(project.id, nextCharts)
      }

      return nextCharts
    })
  }

  const onSaveChart = () => {
    if (!selectedChartField) {
      return
    }

    if (!project) {
      return
    }

    if (chartDialogMode === 'create') {
      setCharts((previous) => {
        const nextCharts = [...previous, { id: createChartId(), field: selectedChartField }]

        void projectService.updateProjectCharts(project.id, nextCharts)

        return nextCharts
      })
      setIsChartDialogOpen(false)
      return
    }

    if (!activeChartId) {
      return
    }

    setCharts((previous) => {
      const nextCharts = previous.map((chart) => (chart.id === activeChartId ? { ...chart, field: selectedChartField } : chart))

      void projectService.updateProjectCharts(project.id, nextCharts)

      return nextCharts
    })
    setIsChartDialogOpen(false)
  }

  const chartDataById = useMemo(() => {
    const next = new Map<string, Array<{ value: string; count: number }>>()

    for (const chart of charts) {
      next.set(chart.id, buildFieldCountChartData(filteredRows, chart.field))
    }

    return next
  }, [charts, filteredRows])

  return (
    <main className="flex min-h-screen w-full flex-col gap-4 p-6">
      {project ? (
        <section className="flex flex-col gap-4">
          <header className="flex items-center gap-2">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">{project.name}</h1>
              {project.description ? <p className="text-sm text-muted-foreground">{project.description}</p> : null}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit project" onClick={onOpenEditDialog}>
              <Pencil />
            </Button>
          </header>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onOpenAddChartDialog} disabled={fields.length === 0} aria-label="Add chart">
              <Plus />
              <span>Add chart</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting} aria-label="Import data">
              <FileSpreadsheet />
              <span>Import</span>
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImportCsv} />
          </div>

          <div className="grid gap-3">
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
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      {fields.map((field) => (
                        <TableHead key={field} className="w-56 max-w-56 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => onSortByField(field)}
                            className="flex w-full items-center justify-between gap-2 text-left"
                            aria-label={`Sort by ${field}`}
                          >
                            <span className="truncate" title={field}>
                              {field}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <ArrowUp className={`size-4 ${sortField === field && sortDirection === 'asc' ? 'text-foreground' : 'text-muted-foreground'}`} />
                              <ArrowDown className={`size-4 ${sortField === field && sortDirection === 'desc' ? 'text-foreground' : 'text-muted-foreground'}`} />
                            </span>
                          </button>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingRows ? (
                      <TableRow>
                        <TableCell colSpan={Math.max(fields.length, 1)} className="px-3 py-4 text-center text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={Math.max(fields.length, 1)} className="px-3 py-4 text-center text-muted-foreground">
                          No data available.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row, rowIndex) => {
                        const isSelected = selectedRow === row

                        return (
                          <TableRow
                            key={`${page}-${rowIndex}`}
                            className={`cursor-pointer ${isSelected ? 'bg-accent/70' : 'hover:bg-accent/40'}`}
                            onClick={() => setSelectedRow(row)}
                          >
                            {fields.map((field) => (
                              <TableCell key={`${rowIndex}-${field}`} className="w-56 max-w-56 px-3 py-2 align-top whitespace-normal">
                                <div
                                  className="max-h-12 overflow-hidden whitespace-pre-wrap break-all [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                                  title={row[field]}
                                >
                                  {row[field]}
                                </div>
                              </TableCell>
                            ))}
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
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

          {charts.length > 0 ? (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {charts.map((chart) => {
                const chartData = chartDataById.get(chart.id) ?? []

                return (
                  <Card key={chart.id} className="gap-3 py-4">
                    <CardHeader className="flex flex-row items-start justify-between gap-3 px-4">
                      <div className="space-y-1">
                        <CardTitle>{chart.field}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="xs" variant="outline" onClick={() => onOpenEditChartDialog(chart)}>
                          <Pencil />
                          Edit
                        </Button>
                        <Button type="button" size="xs" variant="outline" onClick={() => onDeleteChart(chart.id)}>
                          <Trash2 />
                          Delete
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4">
                      {chartData.length > 0 ? (
                        <ChartContainer config={barChartConfig} className="w-full aspect-auto" style={{ height: `${getChartHeight(chartData.length)}px` }}>
                          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 44, bottom: 8, left: 16 }}>
                            <CartesianGrid horizontal={false} />
                            <XAxis type="number" dataKey="count" allowDecimals={false} />
                            <YAxis type="category" dataKey="value" width={120} interval={0} tickFormatter={truncateCategoryLabel} />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                            <Bar dataKey="count" fill="var(--color-count)" radius={4}>
                              <LabelList dataKey="count" position="right" className="fill-foreground text-xs" />
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      ) : (
                        <p className="text-sm text-muted-foreground">No data available for this chart.</p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </section>
          ) : null}
        </section>
      ) : (
        <p>Project not found.</p>
      )}

      <Dialog
        modal={false}
        open={isChartDialogOpen}
        onOpenChange={(nextOpen) => {
          setIsChartDialogOpen(nextOpen)
          if (!nextOpen) {
            setSelectedChartField('')
            setActiveChartId(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{chartDialogMode === 'create' ? 'Add chart' : 'Edit chart'}</DialogTitle>
            <DialogDescription>Select a field for the horizontal bar chart.</DialogDescription>
          </DialogHeader>

          <Combobox value={selectedChartField || null} onValueChange={(value) => setSelectedChartField((value as string) ?? '')}>
            <ComboboxInput className="w-full" placeholder="Select field" readOnly />
            <ComboboxContent>
              <ComboboxEmpty>No fields available</ComboboxEmpty>
              <ComboboxList>
                {fields.map((field) => (
                  <ComboboxItem key={field} value={field}>
                    {field}
                  </ComboboxItem>
                ))}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsChartDialogOpen(false)
                setSelectedChartField('')
                setActiveChartId(null)
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onSaveChart} disabled={!selectedChartField}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

          <Textarea placeholder="Description" value={editProjectDescription} onChange={(event) => setEditProjectDescription(event.target.value)} />

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
