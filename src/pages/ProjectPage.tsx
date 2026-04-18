import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Columns3, FileSpreadsheet, RotateCcw, Pencil, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { dataService } from '@/services/dataService'
import { projectService } from '@/services/projectService'
import type { Project } from '@/entities/project'
import type { SortDirection } from '@/entities/sortDirection'

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

export default function ProjectPage() {
    const { id = '' } = useParams()
    const [project, setProject] = useState<Project | undefined>()
    const [rows, setRows] = useState<Record<string, string>[]>([])
    const [totalRows, setTotalRows] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0])
    const [sortField, setSortField] = useState('')
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
    const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({})
    const [filterInputs, setFilterInputs] = useState<Record<string, string>>({})
    const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [sqlPreview, setSqlPreview] = useState('')
    const [selectedRow, setSelectedRow] = useState<Record<string, string> | null>(null)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [isColumnsDialogOpen, setIsColumnsDialogOpen] = useState(false)
    const [pendingVisibleFieldMap, setPendingVisibleFieldMap] = useState<Record<string, boolean>>({})
    const [editProjectName, setEditProjectName] = useState('')
    const [editProjectDescription, setEditProjectDescription] = useState('')
    const [isLoadingRows, setIsLoadingRows] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const [refreshKey, setRefreshKey] = useState(0)
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
            setEditProjectName(loadedProject?.Name ?? '')
            setEditProjectDescription(loadedProject?.Description ?? '')
        }

        void loadProject()

        return () => {
            isCancelled = true
        }
    }, [id])

    const loadData = useCallback(async (isCancelled?: () => boolean) => {
        const projectId = project?.Id
        if (!projectId) {
            return
        }

        setIsLoadingRows(true)
        setErrorMessage('')

        try {
            const result = await dataService.search(projectId, {
                page,
                pageSize,
                sortField: sortField || undefined,
                sortDirection,
                filterValues: appliedFilters,
            })

            if (isCancelled?.()) {
                return
            }

            setRows(result.rows)
            setTotalRows(result.total)
            setSqlPreview(result.sql)
            setSelectedRow(null)
        } catch (error) {
            if (isCancelled?.()) {
                return
            }

            setErrorMessage(error instanceof Error ? error.message : 'Unable to load data from IndexedDB.')
        } finally {
            if (!isCancelled?.()) {
                setIsLoadingRows(false)
            }
        }
    }, [appliedFilters, page, pageSize, project?.Id, sortDirection, sortField])

    useEffect(() => {
        let isCancelled = false
        void loadData(() => isCancelled)
        return () => {
            isCancelled = true
        }
    }, [loadData, refreshKey])

    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))

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
            const importResult = await dataService.importCsv(project.Id, csvText)
            const updatedProject = await projectService.setFieldMeta(project.Id, importResult.fields ?? [], importResult.fields ?? [])
            if (updatedProject) {
                setProject(updatedProject)
            }

            setSortField('')
            setAppliedFilters({})
            setFilterInputs({})
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

        setEditProjectName(project.Name)
        setEditProjectDescription(project.Description)
        setIsEditDialogOpen(true)
    }

    const onCancelEditProject = () => {
        setIsEditDialogOpen(false)
        setEditProjectName(project?.Name ?? '')
        setEditProjectDescription(project?.Description ?? '')
    }

    const onSaveEditProject = async () => {
        if (!project) {
            return
        }

        const updatedProject = await projectService.updateProject(project.Id, {
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

    useEffect(() => {
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current)
        }

        filterDebounceRef.current = setTimeout(() => {
            const normalizedFilters: Record<string, string> = {}

            for (const field of project?.VisibleFields ?? []) {
                const value = filterInputs[field]?.trim() ?? ''
                if (value) {
                    normalizedFilters[field] = value
                }
            }

            setAppliedFilters(normalizedFilters)
            setPage(1)
        }, 600)

        return () => {
            if (filterDebounceRef.current) {
                clearTimeout(filterDebounceRef.current)
            }
        }
    }, [filterInputs, project?.VisibleFields])

    const onApplyFilters = () => {
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current)
        }

        const normalizedFilters: Record<string, string> = {}

        for (const field of project?.VisibleFields ?? []) {
            const value = filterInputs[field]?.trim() ?? ''
            if (value) {
                normalizedFilters[field] = value
            }
        }

        setAppliedFilters(normalizedFilters)
        setPage(1)
    }

    const onResetFilters = () => {
        setAppliedFilters({})
        setFilterInputs({})
        setPage(1)
    }

    const onOpenColumnsDialog = () => {
        const nextMap: Record<string, boolean> = {}
        const selectedFieldSet = new Set(project?.VisibleFields ?? [])

        for (const field of project?.Fields ?? []) {
            nextMap[field] = selectedFieldSet.has(field)
        }

        setPendingVisibleFieldMap(nextMap)
        setIsColumnsDialogOpen(true)
    }

    const onTogglePendingVisibleField = (field: string) => {
        setPendingVisibleFieldMap((previous) => ({
            ...previous,
            [field]: !previous[field],
        }))
    }

    const selectedPendingFields = (project?.Fields ?? []).filter((field) => pendingVisibleFieldMap[field])

    const onApplyVisibleFields = async () => {
        if (!project) {
            return
        }

        const updatedProject = await projectService.setFieldMeta(project.Id, project.Fields, selectedPendingFields)
        if (!updatedProject) {
            return
        }

        setProject(updatedProject)

        const visibleFieldSet = new Set(updatedProject.VisibleFields)
        setAppliedFilters((previous) => {
            const nextFilters: Record<string, string> = {}
            for (const [field, value] of Object.entries(previous)) {
                if (visibleFieldSet.has(field)) {
                    nextFilters[field] = value
                }
            }

            return nextFilters
        })
        setFilterInputs((previous) => {
            const nextInputs: Record<string, string> = {}
            for (const [field, value] of Object.entries(previous)) {
                if (visibleFieldSet.has(field)) {
                    nextInputs[field] = value
                }
            }

            return nextInputs
        })

        if (sortField && !visibleFieldSet.has(sortField)) {
            setSortField('')
            setSortDirection('asc')
        }

        setPage(1)
        setIsColumnsDialogOpen(false)
    }

    return (
        <main className="flex min-h-screen w-full flex-col gap-4 p-6">
            {project ? (
                <section className="flex flex-col gap-4">
                    <header className="flex items-center gap-2">
                        <div className="flex flex-col gap-1">
                            <h1 className="text-2xl font-semibold">{project.Name}</h1>
                            {project.Description ? <p className="text-sm text-muted-foreground">{project.Description}</p> : null}
                        </div>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit project" onClick={onOpenEditDialog}>
                            <Pencil />
                        </Button>
                    </header>

                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onResetFilters}
                            disabled={project.Fields.length === 0}
                            aria-label="Reset all filters"
                        >
                            <RotateCcw />
                            <span>Reset filter</span>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onOpenColumnsDialog}
                            disabled={project.Fields.length === 0}
                            aria-label="Select visible columns"
                        >
                            <Columns3 />
                            <span>Columns</span>
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting} aria-label="Import data">
                            <FileSpreadsheet />
                            <span>Import</span>
                        </Button>
                        <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImportCsv} />
                    </div>

                    {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

                    <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="overflow-x-auto rounded-md border">
                                <Table className="table-auto">
                                    <TableHeader>
                                        <TableRow>
                                            {project.VisibleFields.map((field) => (
                                                <TableHead key={field} className="px-3 py-2">
                                                    <div className="flex flex-col gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => onSortByField(field)}
                                                            className="inline-flex max-w-56 items-center gap-2 text-left"
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
                                                        <Input
                                                            value={filterInputs[field] ?? ''}
                                                            onChange={(event) => {
                                                                const nextValue = event.target.value
                                                                setFilterInputs((previous) => ({
                                                                    ...previous,
                                                                    [field]: nextValue,
                                                                }))
                                                            }}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') {
                                                                    onApplyFilters()
                                                                }
                                                            }}
                                                            enterKeyHint="search"
                                                            placeholder="Filter..."
                                                            className="h-8"
                                                        />
                                                    </div>
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoadingRows ? (
                                            <TableRow>
                                                <TableCell colSpan={Math.max(project.VisibleFields.length, 1)} className="px-3 py-4 text-center text-muted-foreground">
                                                    Loading...
                                                </TableCell>
                                            </TableRow>
                                        ) : rows.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={Math.max(project.VisibleFields.length, 1)} className="px-3 py-4 text-center text-muted-foreground">
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
                                                        {project.VisibleFields.map((field) => (
                                                            <TableCell key={`${rowIndex}-${field}`} className="px-3 py-2 align-top whitespace-normal">
                                                                <div
                                                                    className="w-fit max-w-56 overflow-hidden text-ellipsis whitespace-nowrap"
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
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">Page size</span>
                                        <Combobox
                                            value={String(pageSize)}
                                            onValueChange={(value) => {
                                                const nextPageSize = Number((value as string) ?? PAGE_SIZE_OPTIONS[0])
                                                if (!PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number])) {
                                                    return
                                                }

                                                setPageSize(nextPageSize)
                                                setPage(1)
                                            }}
                                        >
                                            <ComboboxInput className="w-24" readOnly />
                                            <ComboboxContent>
                                                <ComboboxEmpty>No options</ComboboxEmpty>
                                                <ComboboxList>
                                                    {PAGE_SIZE_OPTIONS.map((option) => (
                                                        <ComboboxItem key={option} value={String(option)}>
                                                            {option}
                                                        </ComboboxItem>
                                                    ))}
                                                </ComboboxList>
                                            </ComboboxContent>
                                        </Combobox>
                                    </div>
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
                                {project.Fields.map((field) => (
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
                    <form onSubmit={(event) => {
                        event.preventDefault()
                        onSaveEditProject()
                    }}>
                        <DialogHeader>
                            <DialogTitle>Edit project</DialogTitle>
                            <DialogDescription>Update project information.</DialogDescription>
                        </DialogHeader>

                        <Input
                            placeholder="Project name"
                            value={editProjectName}
                            onChange={(event) => setEditProjectName(event.target.value)}
                            autoFocus
                        />

                        <Textarea placeholder="Description" value={editProjectDescription} onChange={(event) => setEditProjectDescription(event.target.value)} />

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onCancelEditProject}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!editProjectName.trim()}>
                                Save
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog modal={false} open={isColumnsDialogOpen} onOpenChange={setIsColumnsDialogOpen}>
                <DialogContent>
                    <form onSubmit={(event) => {
                        event.preventDefault()
                        onApplyVisibleFields()
                    }}>
                        <DialogHeader>
                            <DialogTitle>Visible columns</DialogTitle>
                            <DialogDescription>Select columns to display in the table.</DialogDescription>
                        </DialogHeader>

                        <div className="max-h-72 space-y-2 overflow-auto pr-1">
                            {(project?.Fields.length ?? 0) === 0 ? (
                                <p className="text-sm text-muted-foreground">No columns available.</p>
                            ) : (
                                (project?.Fields ?? []).map((field) => (
                                    <label key={field} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={pendingVisibleFieldMap[field] ?? false}
                                            onChange={() => onTogglePendingVisibleField(field)}
                                        />
                                        <span className="truncate" title={field}>
                                            {field}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsColumnsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={selectedPendingFields.length === 0}>
                                Apply
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </main>
    )
}
