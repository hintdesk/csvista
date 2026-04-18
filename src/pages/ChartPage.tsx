import { useEffect, useMemo, useState } from 'react'
import { BarChart3 as BarChartIcon, LineChart as LineChartIcon, Pencil, Trash2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { dataService } from '@/services/dataService'
import { projectService } from '@/services/projectService'
import type { Project } from '@/entities/project'
import type { ProjectChart } from '@/entities/projectChart'

const barChartConfig = {
    count: {
        label: 'Count',
        color: 'var(--chart-1)',
    },
} satisfies ChartConfig

const TOTAL_CHART_COLORS = 20

type LineChartSeries = {
    key: string
    label: string
    color: string
}

type LineChartPoint = {
    x: string
    [seriesKey: string]: number | string
}

type LineChartModel = {
    data: LineChartPoint[]
    series: LineChartSeries[]
}

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

function getChartBarColor(index: number) {
    const token = (index % TOTAL_CHART_COLORS) + 1
    return `var(--chart-${token})`
}

function createLineSeriesKey(value: string, index: number) {
    const normalized = value
        .trim()
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

    return normalized ? `series-${normalized}-${index}` : `series-${index}`
}

function parseLineValue(rawValue: string) {
    const normalizedValue = rawValue.trim()
    if (!normalizedValue) {
        return null
    }

    const parsed = Number(normalizedValue)
    return Number.isFinite(parsed) ? parsed : null
}

function buildLineChartData(rows: Record<string, string>[], fields: string[], seriesField: string): LineChartModel {
    if (!seriesField || fields.length < 2 || rows.length === 0) {
        return {
            data: [],
            series: [],
        }
    }

    const valueFields = fields.filter((field) => field !== seriesField)
    const points: LineChartPoint[] = valueFields.map((field) => ({ x: field }))
    const seriesList: LineChartSeries[] = []

    for (const [rowIndex, row] of rows.entries()) {
        const rawLabel = (row[seriesField] ?? '').trim()
        const label = rawLabel || `Series ${rowIndex + 1}`
        const key = createLineSeriesKey(label, rowIndex)

        seriesList.push({
            key,
            label,
            color: getChartBarColor(rowIndex),
        })

        for (const [valueIndex, valueField] of valueFields.entries()) {
            const parsedValue = parseLineValue(row[valueField] ?? '')
            if (parsedValue === null) {
                continue
            }

            points[valueIndex]![key] = parsedValue
        }
    }

    return {
        data: points,
        series: seriesList,
    }
}

function buildLineChartConfig(seriesList: LineChartSeries[]): ChartConfig {
    return seriesList.reduce<ChartConfig>((config, series) => {
        config[series.key] = {
            label: series.label,
            color: series.color,
        }

        return config
    }, {})
}


export default function ChartPage() {
    const { id = '' } = useParams()
    const [project, setProject] = useState<Project | undefined>()
    const [rows, setRows] = useState<Record<string, string>[]>([])
    const [fields, setFields] = useState<string[]>([])
    const [charts, setCharts] = useState<ProjectChart[]>([])
    const [isChartDialogOpen, setIsChartDialogOpen] = useState(false)
    const [chartDialogMode, setChartDialogMode] = useState<'create' | 'edit'>('create')
    const [chartDialogType, setChartDialogType] = useState<'bar' | 'line'>('bar')
    const [selectedChartField, setSelectedChartField] = useState('')
    const [activeChartId, setActiveChartId] = useState<string | null>(null)
    const [addChartType, setAddChartType] = useState<string | null>(null)
    const [lineSeriesVisibilityByChartId, setLineSeriesVisibilityByChartId] = useState<Record<string, Record<string, boolean>>>({})
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
            setCharts(loadedProject?.Charts ?? [])
        })

        return () => {
            isCancelled = true
        }
    }, [id])

    useEffect(() => {
        const projectId = project?.Id
        if (!projectId) {
            return
        }

        let isCancelled = false

        setErrorMessage('')

        dataService.get(projectId)
            .then((loadedRows) => {
                if (isCancelled) {
                    return
                }

                const visibleFields = project?.VisibleFields ?? []
                setFields(visibleFields)
                setRows(loadedRows)
                setCharts((previous) => previous.filter((chart) => visibleFields.includes(chart.Field ?? '')))
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
    }, [project?.Id])

    const onOpenAddChartDialog = () => {
        if (fields.length === 0) {
            return
        }

        setChartDialogMode('create')
        setChartDialogType('bar')
        setActiveChartId(null)
        setSelectedChartField(fields[0] ?? '')
        setIsChartDialogOpen(true)
    }

    const onOpenAddLineChartDialog = () => {
        if (fields.length < 2 || rows.length === 0) {
            return
        }

        setChartDialogMode('create')
        setChartDialogType('line')
        setActiveChartId(null)
        setSelectedChartField(fields[0] ?? '')
        setIsChartDialogOpen(true)
    }

    const onSelectAddChartType = (value: string | null) => {
        setAddChartType(value)

        if (value === 'bar') {
            onOpenAddChartDialog()
        }

        if (value === 'line') {
            onOpenAddLineChartDialog()
        }

        setAddChartType(null)
    }

    const onOpenEditChartDialog = (chart: ProjectChart) => {
        if (!chart.Field) {
            return
        }

        setChartDialogMode('edit')
        setChartDialogType(chart.Type)
        setActiveChartId(chart.Id)
        setSelectedChartField(chart.Field ?? '')
        setIsChartDialogOpen(true)
    }

    const onDeleteChart = (chartId: string) => {
        setCharts((previous) => {
            const nextCharts = previous.filter((chart) => chart.Id !== chartId)

            if (project) {
                void projectService.setCharts(project.Id, nextCharts)
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
                const nextCharts: ProjectChart[] = [...previous, { Id: createChartId(), Type: chartDialogType, Field: selectedChartField }]
                void projectService.setCharts(project.Id, nextCharts)
                return nextCharts
            })
            setIsChartDialogOpen(false)
            return
        }

        if (!activeChartId) {
            return
        }

        setCharts((previous) => {
            const nextCharts = previous.map((chart) => {
                if (chart.Id !== activeChartId) {
                    return chart
                }

                return {
                    ...chart,
                    field: selectedChartField,
                }
            })
            void projectService.setCharts(project.Id, nextCharts)
            return nextCharts
        })
        setIsChartDialogOpen(false)
    }

    const barChartDataById = useMemo(() => {
        const next = new Map<string, Array<{ value: string; count: number }>>()

        for (const chart of charts) {
            if (chart.Type !== 'bar' || !chart.Field) {
                continue
            }

            next.set(chart.Id, buildFieldCountChartData(rows, chart.Field))
        }

        return next
    }, [charts, rows])

    const lineChartDataById = useMemo(() => {
        const next = new Map<string, LineChartModel>()

        for (const chart of charts) {
            if (chart.Type !== 'line' || !chart.Field) {
                continue
            }

            const lineModel = buildLineChartData(rows, fields, chart.Field)
            next.set(chart.Id, lineModel)
        }

        return next
    }, [charts, fields, rows])

    const lineChartConfigById = useMemo(() => {
        const next = new Map<string, ChartConfig>()

        for (const chart of charts) {
            if (chart.Type !== 'line') {
                continue
            }

            const lineModel = lineChartDataById.get(chart.Id)
            next.set(chart.Id, buildLineChartConfig(lineModel?.series ?? []))
        }

        return next
    }, [charts, lineChartDataById])

    useEffect(() => {
        setLineSeriesVisibilityByChartId((previous) => {
            const next: Record<string, Record<string, boolean>> = {}

            for (const chart of charts) {
                if (chart.Type !== 'line') {
                    continue
                }

                const lineModel = lineChartDataById.get(chart.Id)
                const previousVisibility = previous[chart.Id] ?? {}
                const nextVisibility: Record<string, boolean> = {}

                for (const series of lineModel?.series ?? []) {
                    nextVisibility[series.key] = previousVisibility[series.key] ?? true
                }

                next[chart.Id] = nextVisibility
            }

            return next
        })
    }, [charts, lineChartDataById])

    const onToggleLineSeriesVisibility = (chartId: string, seriesKey: string) => {
        setLineSeriesVisibilityByChartId((previous) => {
            const currentByChart = previous[chartId] ?? {}

            return {
                ...previous,
                [chartId]: {
                    ...currentByChart,
                    [seriesKey]: !(currentByChart[seriesKey] ?? true),
                },
            }
        })
    }

    const canAddBarChart = fields.length > 0
    const canAddLineChart = fields.length > 1 && rows.length > 0

    const chartDialogTitle =
        chartDialogType === 'bar'
            ? chartDialogMode === 'create'
                ? 'Add bar chart'
                : 'Edit bar chart'
            : chartDialogMode === 'create'
              ? 'Add line chart'
              : 'Edit line chart'

    const chartDialogDescription =
        chartDialogType === 'bar'
            ? 'Select a field for the horizontal bar chart.'
            : 'Select a column for line series labels in the legend.'

    if (!project) {
        return (
            <main className="flex min-h-screen w-full flex-col gap-4 p-6">
                <p>Project not found.</p>
            </main>
        )
    }

    return (
        <main className="flex min-h-screen w-full flex-col gap-4 p-6">
            <section className="flex items-center justify-end gap-2">
                <div className="flex items-center gap-2">
                    <Combobox
                        value={addChartType}
                        onValueChange={(value) => onSelectAddChartType(((value as string) ?? '') || null)}
                    >
                        <ComboboxInput className="w-56" placeholder="Select Add Chart" readOnly disabled={!canAddBarChart && !canAddLineChart} />
                        <ComboboxContent>
                            <ComboboxEmpty>No chart type available</ComboboxEmpty>
                            <ComboboxList>
                                {canAddBarChart ? (
                                    <ComboboxItem value="bar">
                                        <BarChartIcon className="size-4" />
                                        Bar Chart
                                    </ComboboxItem>
                                ) : null}
                                {canAddLineChart ? (
                                    <ComboboxItem value="line">
                                        <LineChartIcon className="size-4" />
                                        Line Chart
                                    </ComboboxItem>
                                ) : null}
                            </ComboboxList>
                        </ComboboxContent>
                    </Combobox>
                </div>
            </section>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            {charts.length > 0 ? (
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {charts.map((chart) => {
                        if (chart.Type === 'line') {
                            const lineModel = lineChartDataById.get(chart.Id) ?? { data: [], series: [] }
                            const chartConfig = lineChartConfigById.get(chart.Id) ?? {}
                            const seriesVisibility = lineSeriesVisibilityByChartId[chart.Id] ?? {}

                            return (
                                <Card key={chart.Id} className="gap-3 py-4">
                                    <CardHeader className="flex flex-row items-start justify-between gap-3 px-4">
                                        <div className="space-y-1">
                                            <CardTitle>Line chart: {chart.Field ?? ''}</CardTitle>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button type="button" size="icon-sm" variant="outline" onClick={() => onOpenEditChartDialog(chart)} aria-label="Edit chart">
                                                <Pencil />
                                            </Button>
                                            <Button type="button" size="icon-sm" variant="outline" onClick={() => onDeleteChart(chart.Id)} aria-label="Delete chart">
                                                <Trash2 />
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="px-4">
                                        {lineModel.data.length > 0 && lineModel.series.length > 0 ? (
                                            <div className="flex flex-col gap-3 md:flex-row">
                                                <div className="min-w-0 flex-1">
                                                    <ChartContainer config={chartConfig} className="w-full aspect-auto" style={{ height: '360px' }}>
                                                        <LineChart data={lineModel.data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                                                            <CartesianGrid horizontal={false} />
                                                            <XAxis type="category" dataKey="x" />
                                                            <YAxis />
                                                            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                                                            {lineModel.series.map((series) => {
                                                                const isVisible = seriesVisibility[series.key] ?? true
                                                                if (!isVisible) {
                                                                    return null
                                                                }

                                                                return (
                                                                    <Line
                                                                        key={series.key}
                                                                        type="monotone"
                                                                        dataKey={series.key}
                                                                        name={series.label}
                                                                        stroke={series.color}
                                                                        strokeWidth={2}
                                                                        dot={false}
                                                                        connectNulls={false}
                                                                    />
                                                                )
                                                            })}
                                                        </LineChart>
                                                    </ChartContainer>
                                                </div>
                                                <aside className="md:w-44 md:shrink-0 md:border-l md:pl-3">
                                                    <p className="mb-2 text-xs font-medium text-muted-foreground">Legend</p>
                                                    <div className="flex flex-col gap-2">
                                                        {lineModel.series.map((series) => {
                                                            const isVisible = seriesVisibility[series.key] ?? true

                                                            return (
                                                                <label key={series.key} className="flex items-center gap-2 text-sm">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isVisible}
                                                                        onChange={() => onToggleLineSeriesVisibility(chart.Id, series.key)}
                                                                    />
                                                                    <span className="size-2.5 rounded-full" style={{ backgroundColor: series.color }} />
                                                                    <span className="truncate" title={series.label}>
                                                                        {series.label}
                                                                    </span>
                                                                </label>
                                                            )
                                                        })}
                                                    </div>
                                                </aside>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No numeric data available for the line chart.</p>
                                        )}
                                    </CardContent>
                                </Card>
                            )
                        }

                        const chartData = barChartDataById.get(chart.Id) ?? []

                        return (
                            <Card key={chart.Id} className="gap-3 py-4">
                                <CardHeader className="flex flex-row items-start justify-between gap-3 px-4">
                                    <div className="space-y-1">
                                        <CardTitle>{chart.Field ?? ''}</CardTitle>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button type="button" size="icon-sm" variant="outline" onClick={() => onOpenEditChartDialog(chart)} aria-label="Edit chart">
                                            <Pencil />
                                        </Button>
                                        <Button type="button" size="icon-sm" variant="outline" onClick={() => onDeleteChart(chart.Id)} aria-label="Delete chart">
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
                                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                                    {chartData.map((entry, index) => (
                                                        <Cell key={`${entry.value}-${index}`} fill={getChartBarColor(index)} />
                                                    ))}
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
                        <DialogTitle>{chartDialogTitle}</DialogTitle>
                        <DialogDescription>{chartDialogDescription}</DialogDescription>
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
