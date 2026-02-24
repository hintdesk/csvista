import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { dataService } from '@/services/dataService'
import { type Project, type ProjectChart, projectService } from '@/services/projectService'

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


async function loadData(projectId: string, filterField: string, appliedFilterValue: string) {
    const [result, loadedRows] = await Promise.all([
        dataService.search(projectId, {
            page: 1,
            pageSize: 1,
        }),
        dataService.filter(projectId, {
            filterField: filterField || undefined,
            filterValue: appliedFilterValue || undefined,
        }),
    ])

    return {
        fields: result.fields,
        rows: loadedRows,
    }
}

export default function ChartPage() {
    const { id = '' } = useParams()
    const [project, setProject] = useState<Project | undefined>()
    const [rows, setRows] = useState<Record<string, string>[]>([])
    const [fields, setFields] = useState<string[]>([])
    const [filterField, setFilterField] = useState('')
    const [filterInputValue, setFilterInputValue] = useState('')
    const [appliedFilterValue, setAppliedFilterValue] = useState('')
    const [charts, setCharts] = useState<ProjectChart[]>([])
    const [isChartDialogOpen, setIsChartDialogOpen] = useState(false)
    const [chartDialogMode, setChartDialogMode] = useState<'create' | 'edit'>('create')
    const [selectedChartField, setSelectedChartField] = useState('')
    const [activeChartId, setActiveChartId] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState('')

    useEffect(() => {
        if (!id) {
            return
        }

        let isCancelled = false

        projectService.loadProject(id).then((loadedProject) => {
            if (isCancelled) {
                return
            }

            setProject(loadedProject)
            setCharts(loadedProject?.charts ?? [])
        })

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

        setErrorMessage('')

        loadData(projectId, filterField, appliedFilterValue)
            .then(({ fields: loadedFields, rows: loadedRows }) => {
                if (isCancelled) {
                    return
                }

                setFields(loadedFields)
                setRows(loadedRows)
                setCharts((previous) => previous.filter((chart) => loadedFields.includes(chart.field)))
            })
            .catch((error: unknown) => {
                if (isCancelled) {
                    return
                }

                setErrorMessage(error instanceof Error ? error.message : 'Unable to load data from IndexedDB.')
            })

        return () => {
            isCancelled = true
        }
    }, [appliedFilterValue, filterField, project?.id])

    const onOpenAddChartDialog = () => {
        if (fields.length === 0) {
            return
        }

        setChartDialogMode('create')
        setActiveChartId(null)
        setSelectedChartField(fields[0] ?? '')
        setIsChartDialogOpen(true)
    }

    const onOpenEditChartDialog = (chart: ProjectChart) => {
        setChartDialogMode('edit')
        setActiveChartId(chart.id)
        setSelectedChartField(chart.field)
        setIsChartDialogOpen(true)
    }

    const onDeleteChart = (chartId: string) => {
        setCharts((previous) => {
            const nextCharts = previous.filter((chart) => chart.id !== chartId)

            if (project) {
                void projectService.setCharts(project.id, nextCharts)
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
                projectService.setCharts(project.id, nextCharts)
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
            void projectService.setCharts(project.id, nextCharts)
            return nextCharts
        })
        setIsChartDialogOpen(false)
    }

    const chartDataById = useMemo(() => {
        const next = new Map<string, Array<{ value: string; count: number }>>()

        for (const chart of charts) {
            next.set(chart.id, buildFieldCountChartData(rows, chart.field))
        }

        return next
    }, [charts, rows])

    if (!project) {
        return (
            <main className="flex min-h-screen w-full flex-col gap-4 p-6">
                <p>Project not found.</p>
            </main>
        )
    }

    return (
        <main className="flex min-h-screen w-full flex-col gap-4 p-6">
            <section className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-1">{project.description ? <p className="text-sm text-muted-foreground">{project.description}</p> : null}</div>

                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={onOpenAddChartDialog} disabled={fields.length === 0} aria-label="Add chart">
                        <Plus />
                        <span>Add chart</span>
                    </Button>
                </div>
            </section>

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
                                        <Button type="button" size="icon-sm" variant="outline" onClick={() => onOpenEditChartDialog(chart)} aria-label="Edit chart">
                                            <Pencil />
                                        </Button>
                                        <Button type="button" size="icon-sm" variant="outline" onClick={() => onDeleteChart(chart.id)} aria-label="Delete chart">
                                            <Trash2 />
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
                                                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]}>
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
            ) : (
                <p className="text-sm text-muted-foreground">No chart yet. Add your first chart.</p>
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
        </main>
    )
}
