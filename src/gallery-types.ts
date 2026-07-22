import type { ComponentShotViewport } from './runtime/types.js'

export type ComponentShotGalleryScenarioView = {
	artifactKey: string
	historyCount: number
	id: string
	latestUrl?: string
	name: string
	previewEndpoint: string
	relativePath: string
	routeId: string
}

export type ComponentShotGalleryPageModel = {
	editable: boolean
	scenarioDirLabel: string
	scenarios: ComponentShotGalleryScenarioView[]
	viewportLimits: {
		height: { max: number; min: number }
		width: { max: number; min: number }
	}
}

export type ComponentShotGalleryDiagnostic = {
	message: string
	severity: 'error' | 'info' | 'warning'
	stage: string
}

export type ComponentShotGalleryHistoryItem = {
	filename: string
	updatedAt: number | string
	url: string
}

export type ComponentShotGalleryMetadata = {
	description?: string
	tags?: string[]
	title?: string
	viewport?: Partial<ComponentShotViewport>
}

export type ComponentShotGalleryCaptureResult = {
	diagnostics?: ComponentShotGalleryDiagnostic[]
	historyCount?: number
	latestUrl?: string
	outputPath?: string
}

export type ComponentShotGalleryServices = {
	capture: (
		scenario: ComponentShotGalleryScenarioView,
		request: { output?: string; viewport: ComponentShotViewport },
	) => Promise<ComponentShotGalleryCaptureResult>
	confirmDelete: (scenario: ComponentShotGalleryScenarioView) => boolean
	deleteScenario: (scenario: ComponentShotGalleryScenarioView) => Promise<void>
	getHistory: (
		scenario: ComponentShotGalleryScenarioView,
	) => Promise<ComponentShotGalleryHistoryItem[]>
	getPreview: (
		scenario: ComponentShotGalleryScenarioView,
	) => Promise<{ scenarioId?: string; url: string }>
	listScenarios: () => Promise<ComponentShotGalleryScenarioView[]>
	navigateHome: () => void
	reloadPage: () => void
	subscribe: (handlers: {
		onDisconnect: () => void
		onHistory: () => void
		onSource: () => void
	}) => () => void
}
