import {
	type FormEvent,
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'

import { addPreviewCacheBuster, clampViewport } from './gallery-preview.js'
import { componentShotGalleryStyles } from './gallery-styles.js'
import { LiveScenarioThumbnail } from './gallery-thumbnail.js'
import {
	ViewportDimensionInput,
	ViewportResizeHandles,
} from './gallery-viewport-resizer.js'
import type {
	ComponentShotGalleryCaptureResult,
	ComponentShotGalleryDiagnostic,
	ComponentShotGalleryHistoryItem,
	ComponentShotGalleryMetadata,
	ComponentShotGalleryPageModel,
	ComponentShotGalleryScenarioView,
	ComponentShotGalleryServices,
} from './gallery-types.js'
import type { ComponentShotViewport } from './runtime/types.js'

type GalleryView = 'history' | 'live' | 'overview'
type InspectorView = 'details' | 'diagnostics'
type OverviewFilter = 'all' | 'saved' | 'unsaved'
type StatusState = 'busy' | 'error' | 'ready'

export type ComponentShotGalleryWorkbenchProps = {
	initialSelectedRouteId?: string
	initialView?: GalleryView
	model: ComponentShotGalleryPageModel
	persistState?: boolean
	services?: ComponentShotGalleryServices
}

const isGalleryView = (value: string | null | undefined): value is GalleryView =>
	value === 'live' || value === 'history' || value === 'overview'

const readJson = async <T,>(response: Response): Promise<T> => {
	const data = (await response.json().catch(() => ({}))) as T & {
		error?: { message?: string }
	}
	if (!response.ok) {
		throw new Error(data.error?.message ?? `Request failed with status ${response.status}`)
	}
	return data
}

export const createBrowserComponentShotGalleryServices = (): ComponentShotGalleryServices => ({
	capture: async (scenario, request) => {
		const action = request.output ? 'export' : 'capture'
		return readJson<ComponentShotGalleryCaptureResult>(
			await fetch(`/api/scenarios/${encodeURIComponent(scenario.routeId)}/${action}`, {
				body: JSON.stringify(request),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			}),
		)
	},
	confirmDelete: (scenario) =>
		window.confirm(`Delete scenario "${scenario.name}"?\n${scenario.relativePath}`),
	deleteScenario: async (scenario) => {
		await readJson(
			await fetch(`/api/scenarios/${encodeURIComponent(scenario.routeId)}`, { method: 'DELETE' }),
		)
	},
	getHistory: async (scenario) => {
		const data = await readJson<{ history?: ComponentShotGalleryHistoryItem[] }>(
			await fetch(`/api/scenarios/${encodeURIComponent(scenario.routeId)}/history`),
		)
		return data.history ?? []
	},
	getPreview: async (scenario) => readJson(await fetch(scenario.previewEndpoint)),
	listScenarios: async () => {
		const data = await readJson<{ scenarios?: ComponentShotGalleryScenarioView[] }>(
			await fetch('/api/scenarios'),
		)
		return data.scenarios ?? []
	},
	navigateHome: () => {
		window.location.href = '/'
	},
	reloadPage: () => window.location.reload(),
	subscribe: (handlers) => {
		const events = new EventSource('/api/events')
		events.addEventListener('source', handlers.onSource)
		events.addEventListener('history', handlers.onHistory)
		events.onerror = handlers.onDisconnect
		return () => events.close()
	},
})

export const createStaticComponentShotGalleryServices = (
	overrides: Partial<ComponentShotGalleryServices> = {},
): ComponentShotGalleryServices => ({
	capture: async () => ({}),
	confirmDelete: () => false,
	deleteScenario: async () => undefined,
	getHistory: async () => [],
	getPreview: async (scenario) => ({ url: scenario.latestUrl ?? 'about:blank' }),
	listScenarios: async () => [],
	navigateHome: () => undefined,
	reloadPage: () => undefined,
	subscribe: () => () => undefined,
	...overrides,
})

const browserServices = createBrowserComponentShotGalleryServices()

const toDiagnostic = (
	error: unknown,
	stage: string,
	severity: ComponentShotGalleryDiagnostic['severity'] = 'error',
): ComponentShotGalleryDiagnostic => ({
	message: error instanceof Error ? error.message : String(error),
	severity,
	stage,
})

const getInitialView = (preferred: GalleryView | undefined, persistState: boolean): GalleryView => {
	if (preferred) return preferred
	if (persistState && typeof window !== 'undefined') {
		const value = new URL(window.location.href).searchParams.get('view')
		if (isGalleryView(value)) return value
	}
	return 'live'
}

const getInitialSelection = ({
	preferred,
	persistState,
	scenarios,
}: {
	preferred?: string
	persistState: boolean
	scenarios: ComponentShotGalleryScenarioView[]
}) => {
	if (preferred && scenarios.some((scenario) => scenario.routeId === preferred)) return preferred
	if (persistState && typeof window !== 'undefined') {
		const query = new URL(window.location.href).searchParams.get('scenario')
		const stored = window.localStorage.getItem('component-shot:selected')
		const candidate = query ?? stored
		if (candidate && scenarios.some((scenario) => scenario.routeId === candidate)) return candidate
	}
	return scenarios[0]?.routeId
}

const getInitialViewport = (persistState: boolean): ComponentShotViewport => {
	if (!persistState || typeof window === 'undefined') return { height: 900, width: 1440 }
	return {
		height: Number(window.localStorage.getItem('component-shot:viewport-height')) || 900,
		width: Number(window.localStorage.getItem('component-shot:viewport-width')) || 1440,
	}
}

const panelStorageKeys = {
	inspector: 'component-shot:inspector-collapsed',
	scenarios: 'component-shot:scenarios-collapsed',
} as const

const getInitialPanelCollapsed = (
	panel: keyof typeof panelStorageKeys,
	persistState: boolean,
) =>
	persistState &&
	typeof window !== 'undefined' &&
	window.localStorage.getItem(panelStorageKeys[panel]) === 'true'

const formatHistoryDate = (value: number | string) => {
	const date = new Date(value)
	return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString()
}

export const ComponentShotGalleryWorkbench = ({
	initialSelectedRouteId,
	initialView,
	model,
	persistState = true,
	services = browserServices,
}: ComponentShotGalleryWorkbenchProps) => {
	const [scenarios, setScenarios] = useState(() => model.scenarios.map((scenario) => ({ ...scenario })))
	const [selectedRouteId, setSelectedRouteId] = useState(() =>
		getInitialSelection({
			persistState,
			preferred: initialSelectedRouteId,
			scenarios: model.scenarios,
		}),
	)
	const [activeView, setActiveView] = useState<GalleryView>(() =>
		getInitialView(initialView, persistState),
	)
	const [activeInspector, setActiveInspector] = useState<InspectorView>('details')
	const [query, setQuery] = useState('')
	const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>('all')
	const [openScenarioMenu, setOpenScenarioMenu] = useState<string>()
	const [scenariosCollapsed, setScenariosCollapsed] = useState(() =>
		getInitialPanelCollapsed('scenarios', persistState),
	)
	const [inspectorCollapsed, setInspectorCollapsed] = useState(() =>
		getInitialPanelCollapsed('inspector', persistState),
	)
	const [viewport, setViewport] = useState(() =>
		clampViewport(getInitialViewport(persistState), model.viewportLimits),
	)
	const [zoom, setZoom] = useState('fit')
	const [canvasBackground, setCanvasBackground] = useState('neutral')
	const [canvasSize, setCanvasSize] = useState({ height: 1, width: 1 })
	const [status, setStatus] = useState<{ label: string; state: StatusState }>({
		label: 'Ready',
		state: 'ready',
	})
	const [metadata, setMetadata] = useState<ComponentShotGalleryMetadata>({})
	const [diagnostics, setDiagnostics] = useState<ComponentShotGalleryDiagnostic[]>([])
	const [history, setHistory] = useState<ComponentShotGalleryHistoryItem[]>([])
	const [historyLoading, setHistoryLoading] = useState(false)
	const [previewUrl, setPreviewUrl] = useState<string>()
	const [renderMessage, setRenderMessage] = useState('Select a scenario')
	const [captureBusy, setCaptureBusy] = useState(false)
	const [toast, setToast] = useState<string>()
	const [exportOpen, setExportOpen] = useState(false)
	const [exportPath, setExportPath] = useState('')
	const canvasRef = useRef<HTMLDivElement>(null)
	const frameRef = useRef<HTMLIFrameElement>(null)
	const dialogRef = useRef<HTMLDialogElement>(null)
	const previewToken = useRef(0)
	const historyToken = useRef(0)
	const readyToken = useRef(0)
	const previewTimeout = useRef<number>()
	const viewportCustomized = useRef(
		persistState &&
			typeof window !== 'undefined' &&
			window.localStorage.getItem('component-shot:viewport-customized') === 'true',
	)

	const selectedScenario = useMemo(
		() => scenarios.find((scenario) => scenario.routeId === selectedRouteId),
		[scenarios, selectedRouteId],
	)
	const selectedScenarioRef = useRef(selectedScenario)
	const activeViewRef = useRef(activeView)
	selectedScenarioRef.current = selectedScenario
	activeViewRef.current = activeView

	const scenarioViewport = useMemo(() => {
		const width = Number(metadata.viewport?.width)
		const height = Number(metadata.viewport?.height)
		if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined
		return clampViewport({ height, width }, model.viewportLimits)
	}, [metadata.viewport, model.viewportLimits])

	const viewportPreset = useMemo(() => {
		const value = `${viewport.width}x${viewport.height}`
		if (scenarioViewport && value === `${scenarioViewport.width}x${scenarioViewport.height}`) {
			return 'scenario'
		}
		return ['1440x900', '1024x768', '768x1024', '390x844'].includes(value) ? value : 'custom'
	}, [scenarioViewport, viewport])

	const searchedScenarios = useMemo(() => {
		const normalized = query.trim().toLowerCase()
		if (!normalized) return scenarios
		return scenarios.filter((scenario) =>
			`${scenario.name} ${scenario.relativePath} ${scenario.id}`.toLowerCase().includes(normalized),
		)
	}, [query, scenarios])

	const overviewScenarios = useMemo(
		() =>
			searchedScenarios.filter((scenario) => {
				if (overviewFilter === 'saved') return Boolean(scenario.latestUrl)
				if (overviewFilter === 'unsaved') return !scenario.latestUrl
				return true
			}),
		[overviewFilter, searchedScenarios],
	)

	const capturedCount = useMemo(
		() => scenarios.filter((scenario) => Boolean(scenario.latestUrl)).length,
		[scenarios],
	)

	const addDiagnostic = useCallback((entry: ComponentShotGalleryDiagnostic) => {
		setDiagnostics((current) => [...current, entry])
	}, [])

	const showToast = useCallback((message: string) => {
		setToast(message)
	}, [])

	const cancelPreviewTimeout = useCallback(() => {
		if (previewTimeout.current === undefined) return
		window.clearTimeout(previewTimeout.current)
		previewTimeout.current = undefined
	}, [])

	useEffect(() => {
		if (!toast) return
		const timer = window.setTimeout(() => setToast(undefined), 3200)
		return () => window.clearTimeout(timer)
	}, [toast])

	useEffect(() => {
		if (!openScenarioMenu) return
		const closeOnPointerDown = (event: PointerEvent) => {
			if (event.target instanceof Element && event.target.closest('[data-scenario-actions-root]')) return
			setOpenScenarioMenu(undefined)
		}
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpenScenarioMenu(undefined)
		}
		document.addEventListener('pointerdown', closeOnPointerDown)
		document.addEventListener('keydown', closeOnEscape)
		return () => {
			document.removeEventListener('pointerdown', closeOnPointerDown)
			document.removeEventListener('keydown', closeOnEscape)
		}
	}, [openScenarioMenu])

	useEffect(() => {
		const dialog = dialogRef.current
		if (!dialog) return
		if (exportOpen && !dialog.open) dialog.showModal()
		if (!exportOpen && dialog.open) dialog.close()
	}, [exportOpen])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const update = () => setCanvasSize({ height: canvas.clientHeight, width: canvas.clientWidth })
		update()
		const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
		observer?.observe(canvas)
		window.addEventListener('resize', update)
		return () => {
			observer?.disconnect()
			window.removeEventListener('resize', update)
		}
	}, [activeView])

	useEffect(() => {
		if (!persistState || typeof window === 'undefined') return
		window.localStorage.setItem('component-shot:viewport-width', String(viewport.width))
		window.localStorage.setItem('component-shot:viewport-height', String(viewport.height))
	}, [persistState, viewport])

	useEffect(() => {
		if (!persistState || typeof window === 'undefined') return
		if (inspectorCollapsed) window.localStorage.setItem(panelStorageKeys.inspector, 'true')
		else window.localStorage.removeItem(panelStorageKeys.inspector)
		if (scenariosCollapsed) window.localStorage.setItem(panelStorageKeys.scenarios, 'true')
		else window.localStorage.removeItem(panelStorageKeys.scenarios)
	}, [inspectorCollapsed, persistState, scenariosCollapsed])

	useEffect(() => {
		if (!persistState || typeof window === 'undefined') return
		if (selectedRouteId) window.localStorage.setItem('component-shot:selected', selectedRouteId)
		const url = new URL(window.location.href)
		if (selectedRouteId) url.searchParams.set('scenario', selectedRouteId)
		url.searchParams.set('view', activeView)
		window.history.replaceState(null, '', url)
	}, [activeView, persistState, selectedRouteId])

	useEffect(() => {
		if (selectedRouteId && scenarios.some((scenario) => scenario.routeId === selectedRouteId)) return
		setSelectedRouteId(scenarios[0]?.routeId)
	}, [scenarios, selectedRouteId])

	const loadHistory = useCallback(async () => {
		const scenario = selectedScenarioRef.current
		const token = ++historyToken.current
		setHistory([])
		if (!scenario) return
		setHistoryLoading(true)
		try {
			const nextHistory = await services.getHistory(scenario)
			if (token === historyToken.current) setHistory(nextHistory)
		} catch (error) {
			if (token === historyToken.current) addDiagnostic(toDiagnostic(error, 'artifact'))
		} finally {
			if (token === historyToken.current) setHistoryLoading(false)
		}
	}, [addDiagnostic, services])

	const loadPreview = useCallback(async () => {
		const scenario = selectedScenarioRef.current
		const token = ++previewToken.current
		cancelPreviewTimeout()
		readyToken.current = 0
		setDiagnostics([])
		setMetadata({})
		setPreviewUrl(undefined)
		if (!scenario) {
			setRenderMessage('No scenario selected')
			return
		}
		setRenderMessage(`Building ${scenario.name}...`)
		setStatus({ label: 'Building', state: 'busy' })
		try {
			const preview = await services.getPreview(scenario)
			if (token !== previewToken.current) return
			setPreviewUrl(addPreviewCacheBuster(preview.url))
			previewTimeout.current = window.setTimeout(() => {
				if (token !== previewToken.current || readyToken.current === token) return
				previewTimeout.current = undefined
				addDiagnostic(
					toDiagnostic(
						'Render readiness timed out. Check provider hooks and browser console.',
						'render',
						'warning',
					),
				)
				setRenderMessage('Render did not become ready')
				setStatus({ label: 'Render timeout', state: 'error' })
			}, 15_000)
		} catch (error) {
			if (token !== previewToken.current) return
			addDiagnostic(toDiagnostic(error, 'build'))
			setRenderMessage(error instanceof Error ? error.message : String(error))
			setStatus({ label: 'Build failed', state: 'error' })
			setActiveInspector('diagnostics')
		}
	}, [addDiagnostic, cancelPreviewTimeout, services])

	useEffect(() => {
		if (activeView === 'live') {
			void loadPreview()
			return
		}
		cancelPreviewTimeout()
	}, [activeView, cancelPreviewTimeout, loadPreview, selectedRouteId])

	useEffect(() => {
		if (activeView === 'history') void loadHistory()
	}, [activeView, loadHistory, selectedRouteId])

	useEffect(
		() => () => {
			previewToken.current += 1
			cancelPreviewTimeout()
		},
		[cancelPreviewTimeout],
	)

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (
				event.source !== frameRef.current?.contentWindow ||
				!event.data ||
				typeof event.data !== 'object'
			) {
				return
			}
			const data = event.data as {
				message?: string
				metadata?: ComponentShotGalleryMetadata
				type?: string
			}
			if (data.type === 'component-shot:ready') {
				readyToken.current = previewToken.current
				cancelPreviewTimeout()
				const nextMetadata = data.metadata ?? {}
				setMetadata(nextMetadata)
				if (nextMetadata.viewport && !viewportCustomized.current) {
					setViewport((current) =>
						clampViewport(
							{
								height: Number(nextMetadata.viewport?.height) || current.height,
								width: Number(nextMetadata.viewport?.width) || current.width,
							},
							model.viewportLimits,
						),
					)
				}
				setRenderMessage('')
				setStatus({ label: 'Ready', state: 'ready' })
			}
			if (data.type === 'component-shot:error') {
				cancelPreviewTimeout()
				const message = data.message ?? 'Scenario render failed'
				addDiagnostic(toDiagnostic(message, 'render'))
				setRenderMessage(message)
				setStatus({ label: 'Render failed', state: 'error' })
				setActiveInspector('diagnostics')
			}
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [addDiagnostic, cancelPreviewTimeout, model.viewportLimits])

	const refreshScenarios = useCallback(async () => {
		try {
			const updated = await services.listScenarios()
			setScenarios(updated.map((scenario) => ({ ...scenario })))
		} catch (error) {
			addDiagnostic(toDiagnostic(error, 'discover'))
		}
	}, [addDiagnostic, services])

	useEffect(
		() =>
			services.subscribe({
				onDisconnect: () => setStatus({ label: 'Disconnected', state: 'error' }),
				onHistory: () => {
					void refreshScenarios()
					if (activeViewRef.current === 'history') void loadHistory()
				},
				onSource: () => {
					setStatus({ label: 'Source changed', state: 'busy' })
					window.setTimeout(services.reloadPage, 120)
				},
			}),
		[loadHistory, refreshScenarios, services],
	)

	const selectScenario = (routeId: string, view?: GalleryView) => {
		if (!scenarios.some((scenario) => scenario.routeId === routeId)) return
		setSelectedRouteId(routeId)
		if (view) setActiveView(view)
	}

	const captureSelected = async (output?: string) => {
		if (!selectedScenario) return
		setCaptureBusy(true)
		setStatus({ label: output ? 'Exporting' : 'Capturing', state: 'busy' })
		try {
			const result = await services.capture(selectedScenario, { output, viewport })
			setDiagnostics(result.diagnostics ?? [])
			if (!output) {
				setScenarios((current) =>
					current.map((scenario) =>
						scenario.routeId === selectedScenario.routeId
							? {
								...scenario,
								historyCount: result.historyCount ?? scenario.historyCount,
								latestUrl: result.latestUrl ?? scenario.latestUrl,
							}
							: scenario,
					),
				)
			}
			setStatus({ label: 'Ready', state: 'ready' })
			showToast(output ? `Exported ${result.outputPath ?? output}` : 'Saved capture')
			await loadHistory()
		} catch (error) {
			addDiagnostic(toDiagnostic(error, 'capture'))
			setStatus({ label: 'Capture failed', state: 'error' })
			setActiveInspector('diagnostics')
		} finally {
			setCaptureBusy(false)
		}
	}

	const deleteScenario = async (scenario: ComponentShotGalleryScenarioView) => {
		if (!services.confirmDelete(scenario)) return
		try {
			await services.deleteScenario(scenario)
			services.navigateHome()
		} catch (error) {
			showToast(error instanceof Error ? error.message : String(error))
		}
	}

	const deleteSelected = async () => {
		if (selectedScenario) await deleteScenario(selectedScenario)
	}

	const updateCustomViewport = useCallback((nextViewport: ComponentShotViewport) => {
		viewportCustomized.current = true
		if (persistState && typeof window !== 'undefined') {
			window.localStorage.setItem('component-shot:viewport-customized', 'true')
		}
		setViewport(clampViewport(nextViewport, model.viewportLimits))
	}, [model.viewportLimits, persistState])

	const onViewportChange = (dimension: keyof ComponentShotViewport, value: number) =>
		updateCustomViewport({ ...viewport, [dimension]: value })

	const onPresetChange = (value: string) => {
		if (value === 'custom') return
		if (value === 'scenario') {
			if (!scenarioViewport) return
			viewportCustomized.current = false
			if (persistState) window.localStorage.removeItem('component-shot:viewport-customized')
			setViewport(scenarioViewport)
			return
		}
		const [width, height] = value.split('x').map(Number)
		updateCustomViewport({ height, width })
	}

	const scale = useMemo(() => {
		if (zoom !== 'fit') return Number(zoom)
		return Math.min(
			1,
			Math.max(1, canvasSize.width - 48) / viewport.width,
			Math.max(1, canvasSize.height - 48) / viewport.height,
		)
	}, [canvasSize, viewport, zoom])

	const detailRows = selectedScenario
		? [
				{ label: 'Name', value: metadata.title ?? selectedScenario.name },
				...(metadata.description
					? [{ className: 'description', label: 'Description', value: metadata.description }]
					: []),
				{ label: 'Scenario ID', value: selectedScenario.id },
				{ label: 'Source', value: selectedScenario.relativePath },
				{ label: 'Artifact key', value: selectedScenario.artifactKey },
				{ label: 'Viewport', value: `${viewport.width} x ${viewport.height}` },
				{ label: 'History', value: String(selectedScenario.historyCount) },
				{
					label: 'Tags',
					value: metadata.tags?.length ? metadata.tags.join(', ') : 'None',
				},
			]
		: []

	const submitExport = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const output = exportPath.trim()
		if (!output) return
		setExportOpen(false)
		void captureSelected(output)
	}

	const cancelDialog = (event: ReactMouseEvent<HTMLButtonElement>) => {
		event.preventDefault()
		setExportOpen(false)
	}

	return (
		<>
			<style>{componentShotGalleryStyles}</style>
			<div className="component-shot-app" data-gallery-status={status.state}>
				<span aria-live="polite" className="sr-only">{status.label}</span>
				{status.state !== 'ready' && (
					<div aria-hidden="true" className="operation-status">
						<span className="status-dot" data-state={status.state} data-status-dot />
						<span data-status-text>{status.label}</span>
					</div>
				)}
				<div
					className="workspace"
					data-inspector-collapsed={inspectorCollapsed}
					data-scenarios-collapsed={scenariosCollapsed}
					data-view={activeView}
				>
					<aside
						aria-label="Scenarios"
						className="scenario-browser"
						data-collapsed={scenariosCollapsed}
					>
						<div className="panel-heading">
							<h2>Scenarios</h2>
							<div className="panel-heading-actions">
								<span className="count" data-scenario-count>
									{searchedScenarios.length === scenarios.length
										? scenarios.length
										: `${searchedScenarios.length}/${scenarios.length}`}
								</span>
								<button
									aria-expanded={!scenariosCollapsed}
									aria-label={scenariosCollapsed ? 'Expand scenarios panel' : 'Collapse scenarios panel'}
									className="panel-collapse"
									data-panel-collapse="scenarios"
									onClick={() => setScenariosCollapsed((current) => !current)}
									title={scenariosCollapsed ? 'Expand scenarios panel' : 'Collapse scenarios panel'}
									type="button"
								>
									<span
										aria-hidden="true"
										className="panel-collapse-icon"
										data-direction={scenariosCollapsed ? 'right' : 'left'}
									/>
								</button>
							</div>
						</div>
						<button
							aria-current={activeView === 'overview'}
							aria-label="Overview"
							className="scenario-overview-row"
							data-view="overview"
							onClick={() => setActiveView('overview')}
							title="Overview"
							type="button"
						>
							<span aria-hidden="true" className="overview-nav-mark" />
							<span>Overview</span>
						</button>
						<span aria-hidden="true" className="collapsed-panel-label">Scenarios</span>
						<div className="search">
							<input
								aria-label="Search scenarios"
								data-search
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search scenarios"
								type="search"
								value={query}
							/>
						</div>
						<div className="scenario-list" data-scenario-list>
							{searchedScenarios.map((scenario) => (
								<div
									aria-current={activeView !== 'overview' && scenario.routeId === selectedRouteId}
									className="scenario-row"
									data-route-id={scenario.routeId}
									key={scenario.routeId}
								>
									<button
										className="scenario-row-main"
										onClick={() => selectScenario(
											scenario.routeId,
											activeView === 'history' ? 'history' : 'live',
										)}
										title={scenario.relativePath}
										type="button"
									>
										<span className="scenario-row-copy">
											<strong>{scenario.name}</strong>
											<small>{scenario.relativePath}</small>
										</span>
										<span
											className="history-badge"
											title={`${scenario.historyCount} saved ${scenario.historyCount === 1 ? 'screenshot' : 'screenshots'}`}
										>
											{scenario.historyCount}
										</span>
									</button>
									<div className="scenario-actions" data-scenario-actions-root>
										<button
											aria-expanded={openScenarioMenu === scenario.routeId}
											aria-haspopup="menu"
											aria-label={`Actions for ${scenario.name}`}
											className="scenario-actions-trigger"
											onClick={() => setOpenScenarioMenu((current) =>
												current === scenario.routeId ? undefined : scenario.routeId,
											)}
											title={`Actions for ${scenario.name}`}
											type="button"
										>
											<span aria-hidden="true">...</span>
										</button>
										{openScenarioMenu === scenario.routeId && (
											<div className="scenario-actions-menu" role="menu">
												<button
													className="scenario-action-danger"
													disabled={!model.editable}
													onClick={() => {
														setOpenScenarioMenu(undefined)
														void deleteScenario(scenario)
													}}
													role="menuitem"
													type="button"
												>
													Delete scenario
												</button>
											</div>
										)}
									</div>
								</div>
							))}
							{searchedScenarios.length === 0 && (
								<div className="empty-list">
									{scenarios.length ? 'No matching scenarios' : 'No scenarios found'}
								</div>
							)}
						</div>
					</aside>

					<main className="stage">
						{activeView !== 'overview' && (
							<div
								className="canvas-toolbar"
								data-detail-toolbar
								data-live-toolbar={activeView === 'live' ? true : undefined}
							>
								<div className="toolbar-primary">
									<div aria-label="Scenario detail view" className="detail-tabs" role="tablist">
										{(['live', 'history'] as const).map((view) => (
											<button
												aria-selected={activeView === view}
												className="detail-tab"
												data-view={view}
												key={view}
												onClick={() => setActiveView(view)}
												role="tab"
												type="button"
											>
												{view === 'live' ? 'Live' : 'History'}
											</button>
										))}
									</div>
									{activeView === 'live' && (
										<div className="toolbar-controls">
											<label className="control">
												<span>Viewport</span>
												<select
													aria-label="Viewport preset"
													data-viewport-preset
													onChange={(event) => onPresetChange(event.target.value)}
													value={viewportPreset}
												>
													<option disabled={!scenarioViewport} value="scenario">Scenario</option>
													<option value="1440x900">Desktop</option>
													<option value="1024x768">Laptop</option>
													<option value="768x1024">Tablet</option>
													<option value="390x844">Mobile</option>
													<option value="custom">Custom</option>
												</select>
											</label>
											<label className="control">
												<span>W</span>
												<ViewportDimensionInput
													dataAttribute="width"
													label="Viewport width"
													max={model.viewportLimits.width.max}
													min={model.viewportLimits.width.min}
													onCommit={(value) => onViewportChange('width', value)}
													value={viewport.width}
												/>
											</label>
											<label className="control">
												<span>H</span>
												<ViewportDimensionInput
													dataAttribute="height"
													label="Viewport height"
													max={model.viewportLimits.height.max}
													min={model.viewportLimits.height.min}
													onCommit={(value) => onViewportChange('height', value)}
													value={viewport.height}
												/>
											</label>
											<label className="control">
												<span>Zoom</span>
												<select aria-label="Canvas zoom" data-zoom onChange={(event) => setZoom(event.target.value)} value={zoom}>
													<option value="fit">Fit</option>
													<option value="1">100%</option>
													<option value="0.75">75%</option>
													<option value="0.5">50%</option>
												</select>
											</label>
											<label className="control">
												<span>Canvas</span>
												<select
													aria-label="Canvas background"
													data-background
													onChange={(event) => setCanvasBackground(event.target.value)}
													value={canvasBackground}
												>
													<option value="neutral">Neutral</option>
													<option value="white">White</option>
													<option value="dark">Dark</option>
												</select>
											</label>
										</div>
									)}
								</div>
								{activeView === 'live' && (
									<div className="toolbar-actions">
										<button className="command" data-reload onClick={() => void loadPreview()} type="button">Reload</button>
										<button
											className="command primary"
											data-capture
											disabled={!model.editable || captureBusy}
											onClick={() => void captureSelected()}
											title={model.editable ? undefined : 'Gallery is read-only'}
											type="button"
										>
											Capture
										</button>
										<button
											className="command"
											data-export
											disabled={!model.editable || captureBusy}
											onClick={() => {
												if (!selectedScenario) return
												setExportPath(`docs/images/${selectedScenario.artifactKey.replaceAll('/', '-')}.png`)
												setExportOpen(true)
											}}
											title={model.editable ? undefined : 'Gallery is read-only'}
											type="button"
										>
											Export
										</button>
									</div>
								)}
							</div>
						)}

						<section className="stage-view" data-stage-view="live" hidden={activeView !== 'live'}>
							<div className="canvas-area" data-background={canvasBackground} data-canvas ref={canvasRef}>
								<div
									className="viewport-scaler"
									data-viewport-scaler
									style={{ height: Math.max(1, viewport.height * scale), width: Math.max(1, viewport.width * scale) }}
								>
									<div
										className="viewport-shell"
										data-viewport-shell
										style={{
											height: viewport.height,
											transform: scale === 1 ? undefined : `scale(${scale})`,
											width: viewport.width,
										}}
									>
										<iframe data-preview-frame ref={frameRef} src={previewUrl} title="Selected Component Shot scenario" />
										<div className="render-state" data-render-state hidden={!renderMessage}>{renderMessage}</div>
									</div>
									<ViewportResizeHandles
										onResize={updateCustomViewport}
										scale={scale}
										viewport={viewport}
									/>
								</div>
							</div>
						</section>

						<section className="stage-view history-view" data-stage-view="history" hidden={activeView !== 'history'}>
							<div className="history-grid" data-history-grid>
								{history.map((shot) => (
									<a className="shot" href={shot.url} key={`${shot.filename}-${shot.updatedAt}`} rel="noreferrer" target="_blank">
										<img alt={shot.filename} loading="lazy" src={shot.url} />
										<span>{formatHistoryDate(shot.updatedAt)}</span>
									</a>
								))}
								{historyLoading && <div className="empty-state">Loading history...</div>}
								{!historyLoading && history.length === 0 && <div className="empty-state">No saved history for this scenario.</div>}
							</div>
						</section>

						<section className="stage-view overview-view" data-stage-view="overview" hidden={activeView !== 'overview'}>
							{activeView === 'overview' && (
								<>
									<div className="overview-header">
										<div className="overview-heading">
											<strong>Live scenario overview</strong>
											<span>{scenarios.length} scenarios, {capturedCount} with saved screenshots</span>
										</div>
										<div aria-label="Saved screenshot status" className="overview-filter" role="group">
											{(['all', 'saved', 'unsaved'] as const).map((filter) => (
												<button
													aria-pressed={overviewFilter === filter}
													className="filter-tab"
													key={filter}
													onClick={() => setOverviewFilter(filter)}
													type="button"
												>
													{filter[0].toUpperCase() + filter.slice(1)}
												</button>
											))}
										</div>
									</div>
									<div className="overview-scroll">
										<div className="overview-grid" data-overview-grid>
											{overviewScenarios.map((scenario) => (
												<article
													className="overview-item"
													key={scenario.routeId}
												>
													<LiveScenarioThumbnail
														scenario={scenario}
														services={services}
														viewportLimits={model.viewportLimits}
													/>
													<span className="overview-meta">
														<span className="overview-copy">
															<strong>{scenario.name}</strong>
															<span>{scenario.relativePath}</span>
														</span>
														<span
															className="overview-count"
															title={`${scenario.historyCount} saved ${scenario.historyCount === 1 ? 'screenshot' : 'screenshots'}`}
														>
															{scenario.historyCount} saved
														</span>
													</span>
													<button
														aria-label={`Open ${scenario.name} in Live view`}
														className="overview-open"
														onClick={() => selectScenario(scenario.routeId, 'live')}
														title={scenario.relativePath}
														type="button"
													/>
												</article>
											))}
											{overviewScenarios.length === 0 && <div className="empty-state">No matching scenarios.</div>}
										</div>
									</div>
								</>
							)}
						</section>
					</main>

					<aside
						aria-label="Scenario inspector"
						className="inspector"
						data-collapsed={inspectorCollapsed}
					>
						<div className="panel-heading">
							<h2>Inspector</h2>
							<div className="panel-heading-actions">
								<span className="count" data-selected-label>{selectedScenario?.name ?? 'None'}</span>
								<button
									aria-expanded={!inspectorCollapsed}
									aria-label={inspectorCollapsed ? 'Expand inspector panel' : 'Collapse inspector panel'}
									className="panel-collapse"
									data-panel-collapse="inspector"
									onClick={() => setInspectorCollapsed((current) => !current)}
									title={inspectorCollapsed ? 'Expand inspector panel' : 'Collapse inspector panel'}
									type="button"
								>
									<span
										aria-hidden="true"
										className="panel-collapse-icon"
										data-direction={inspectorCollapsed ? 'left' : 'right'}
									/>
								</button>
							</div>
						</div>
						<span aria-hidden="true" className="collapsed-panel-label">Inspector</span>
						<div aria-label="Inspector section" className="inspector-tabs" role="tablist">
							{(['details', 'diagnostics'] as const).map((tab) => (
								<button
									aria-selected={activeInspector === tab}
									className="inspector-tab"
									data-inspector-tab={tab}
									key={tab}
									onClick={() => setActiveInspector(tab)}
									role="tab"
									type="button"
								>
									{tab === 'details' ? 'Details' : `Diagnostics${diagnostics.length ? ` (${diagnostics.length})` : ''}`}
								</button>
							))}
						</div>
						<section className="inspector-panel" data-inspector-panel="details" hidden={activeInspector !== 'details'}>
							<dl className="detail-list" data-details>
								{detailRows.map((row) => (
									<div className={`detail-row ${row.className ?? ''}`} key={row.label}>
										<dt>{row.label}</dt>
										<dd>{row.value}</dd>
									</div>
								))}
							</dl>
							<div className="inspector-actions">
								{previewUrl && <a className="command" data-open-preview href={previewUrl} rel="noreferrer" target="_blank">Open</a>}
								{model.editable && <button className="command danger" data-delete onClick={() => void deleteSelected()} type="button">Delete</button>}
							</div>
						</section>
						<section className="inspector-panel" data-inspector-panel="diagnostics" hidden={activeInspector !== 'diagnostics'}>
							<div className="diagnostics" data-diagnostics>
								{diagnostics.map((entry, index) => (
									<div className="diagnostic" data-severity={entry.severity} key={`${entry.stage}-${index}`}>
										<strong>{entry.stage} / {entry.severity}</strong>
										<div>{entry.message}</div>
									</div>
								))}
								{diagnostics.length === 0 && <div className="empty-state">No diagnostics for this render.</div>}
							</div>
						</section>
					</aside>
				</div>
			</div>

			<dialog className="export-dialog" data-export-dialog onClose={() => setExportOpen(false)} ref={dialogRef}>
				<form data-export-form onSubmit={submitExport}>
					<div className="dialog-heading"><h2>Export PNG</h2></div>
					<div className="dialog-body">
						<label htmlFor="export-path">Project-relative output path</label>
						<input id="export-path" name="output" onChange={(event) => setExportPath(event.target.value)} required value={exportPath} />
					</div>
					<div className="dialog-actions">
						<button className="command" onClick={cancelDialog} type="button">Cancel</button>
						<button className="command primary" data-export-confirm type="submit">Export</button>
					</div>
				</form>
			</dialog>
			{toast && <div className="toast" data-toast>{toast}</div>}
		</>
	)
}
