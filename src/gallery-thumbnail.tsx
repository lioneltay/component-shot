import { useEffect, useRef, useState } from 'react'
import { addPreviewCacheBuster, clampViewport } from './gallery-preview.js'
import type {
	ComponentShotGalleryMetadata,
	ComponentShotGalleryPageModel,
	ComponentShotGalleryScenarioView,
	ComponentShotGalleryServices,
} from './gallery-types.js'
import type { ComponentShotViewport } from './runtime/types.js'

type ThumbnailBounds = ComponentShotViewport & { x: number; y: number }
type ThumbnailState = 'building' | 'error' | 'idle' | 'ready'

const defaultThumbnailViewport: ComponentShotViewport = { height: 900, width: 1440 }
const defaultThumbnailBounds: ThumbnailBounds = { ...defaultThumbnailViewport, x: 0, y: 0 }

const readThumbnailBounds = (value: unknown): ThumbnailBounds | undefined => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
	const candidate = value as Record<string, unknown>
	const bounds = {
		height: Number(candidate.height),
		width: Number(candidate.width),
		x: Number(candidate.x),
		y: Number(candidate.y),
	}
	return Object.values(bounds).every(Number.isFinite) && bounds.width > 0 && bounds.height > 0
		? bounds
		: undefined
}

export const LiveScenarioThumbnail = ({
	scenario,
	services,
	viewportLimits,
}: {
	scenario: ComponentShotGalleryScenarioView
	services: ComponentShotGalleryServices
	viewportLimits: ComponentShotGalleryPageModel['viewportLimits']
}) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const frameRef = useRef<HTMLIFrameElement>(null)
	const scenarioRef = useRef(scenario)
	scenarioRef.current = scenario
	const [requested, setRequested] = useState(false)
	const [source, setSource] = useState<string>()
	const [state, setState] = useState<ThumbnailState>('idle')
	const [error, setError] = useState<string>()
	const [viewport, setViewport] = useState(defaultThumbnailViewport)
	const [bounds, setBounds] = useState(defaultThumbnailBounds)
	const [containerSize, setContainerSize] = useState({ height: 1, width: 1 })

	useEffect(() => {
		const container = containerRef.current
		if (!container) return
		if (typeof IntersectionObserver === 'undefined') {
			setRequested(true)
			return
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return
				setRequested(true)
				observer.disconnect()
			},
			{ rootMargin: '240px' },
		)
		observer.observe(container)
		return () => observer.disconnect()
	}, [])

	useEffect(() => {
		if (!requested) return
		const container = containerRef.current
		if (!container) return
		const update = () =>
			setContainerSize({ height: container.clientHeight, width: container.clientWidth })
		update()
		const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
		observer?.observe(container)
		return () => observer?.disconnect()
	}, [requested])

	useEffect(() => {
		if (!requested) return
		let active = true
		setState('building')
		setError(undefined)
		void services
			.getPreview(scenarioRef.current)
			.then((preview) => {
				if (active) setSource(addPreviewCacheBuster(preview.url))
			})
			.catch((previewError: unknown) => {
				if (!active) return
				setError(previewError instanceof Error ? previewError.message : String(previewError))
				setState('error')
			})
		return () => {
			active = false
		}
	}, [requested, scenario.routeId, services])

	useEffect(() => {
		if (state !== 'building') return
		const timer = window.setTimeout(() => {
			setError('Live preview timed out')
			setState('error')
		}, 15_000)
		return () => window.clearTimeout(timer)
	}, [state])

	useEffect(() => {
		if (!requested) return
		let readyFirstFrame: number | undefined
		let readySecondFrame: number | undefined
		let requestFirstFrame: number | undefined
		let requestSecondFrame: number | undefined
		let readyScheduled = false
		let expectedViewport: ComponentShotViewport | undefined
		const scheduleReady = () => {
			if (readyScheduled) return
			readyScheduled = true
			readyFirstFrame = window.requestAnimationFrame(() => {
				readySecondFrame = window.requestAnimationFrame(() => setState('ready'))
			})
		}
		const requestLayout = () => {
			if (requestFirstFrame !== undefined) window.cancelAnimationFrame(requestFirstFrame)
			if (requestSecondFrame !== undefined) window.cancelAnimationFrame(requestSecondFrame)
			requestFirstFrame = window.requestAnimationFrame(() => {
				requestSecondFrame = window.requestAnimationFrame(() =>
					frameRef.current?.contentWindow?.postMessage(
						{ type: 'component-shot:request-layout' },
						'*',
					),
				)
			})
		}
		const onMessage = (event: MessageEvent) => {
			if (
				event.source !== frameRef.current?.contentWindow ||
				!event.data ||
				typeof event.data !== 'object'
			) {
				return
			}
			const data = event.data as {
				bounds?: unknown
				frameViewport?: Partial<ComponentShotViewport>
				message?: string
				metadata?: ComponentShotGalleryMetadata
				type?: string
			}
			if (data.type === 'component-shot:ready') {
				const width = Number(data.metadata?.viewport?.width)
				const height = Number(data.metadata?.viewport?.height)
				const frameWidth = Number(data.frameViewport?.width)
				const frameHeight = Number(data.frameViewport?.height)
				const nextBounds = readThumbnailBounds(data.bounds)
				if (nextBounds) setBounds(nextBounds)
				if (Number.isFinite(width) && Number.isFinite(height)) {
					const nextViewport = clampViewport({ height, width }, viewportLimits)
					expectedViewport = nextViewport
					setViewport(nextViewport)
					if (
						Number.isFinite(frameWidth) &&
						Number.isFinite(frameHeight) &&
						(nextViewport.width !== frameWidth || nextViewport.height !== frameHeight)
					) {
						requestLayout()
						return
					}
				}
				scheduleReady()
			}
			if (data.type === 'component-shot:layout') {
				const frameWidth = Number(data.frameViewport?.width)
				const frameHeight = Number(data.frameViewport?.height)
				if (
					expectedViewport &&
					(frameWidth !== expectedViewport.width || frameHeight !== expectedViewport.height)
				) {
					requestLayout()
					return
				}
				const nextBounds = readThumbnailBounds(data.bounds)
				if (nextBounds) setBounds(nextBounds)
				scheduleReady()
			}
			if (data.type === 'component-shot:error') {
				setError(data.message ?? 'Scenario render failed')
				setState('error')
			}
		}
		window.addEventListener('message', onMessage)
		return () => {
			window.removeEventListener('message', onMessage)
			if (readyFirstFrame !== undefined) window.cancelAnimationFrame(readyFirstFrame)
			if (readySecondFrame !== undefined) window.cancelAnimationFrame(readySecondFrame)
			if (requestFirstFrame !== undefined) window.cancelAnimationFrame(requestFirstFrame)
			if (requestSecondFrame !== undefined) window.cancelAnimationFrame(requestSecondFrame)
		}
	}, [requested, viewportLimits])

	const scale = Math.min(
		containerSize.width / bounds.width,
		containerSize.height / bounds.height,
	)
	const renderedWidth = bounds.width * scale
	const renderedHeight = bounds.height * scale
	const status =
		state === 'ready'
			? 'Live'
			: state === 'building'
				? 'Loading live'
				: state === 'error'
					? scenario.latestUrl
						? 'Saved fallback'
						: 'Preview failed'
					: scenario.latestUrl
						? 'Saved'
						: 'Queued'

	return (
		<div
			className="overview-preview"
			data-overview-preview-state={state}
			ref={containerRef}
		>
			{scenario.latestUrl && (
				<img
					alt=""
					aria-hidden="true"
					className="overview-preview-fallback"
					src={scenario.latestUrl}
				/>
			)}
			{source && (
				<iframe
					aria-hidden="true"
					className="overview-preview-frame"
					ref={frameRef}
					src={source}
					style={{
						height: viewport.height,
						left: (containerSize.width - renderedWidth) / 2 - bounds.x * scale,
						top: (containerSize.height - renderedHeight) / 2 - bounds.y * scale,
						transform: `scale(${scale})`,
						width: viewport.width,
					}}
					tabIndex={-1}
					title={`${scenario.name} live preview`}
				/>
			)}
			{!scenario.latestUrl && state !== 'ready' && (
				<div className="overview-preview-empty">
					{state === 'error' ? 'Preview unavailable' : 'Preparing preview'}
				</div>
			)}
			<span className="overview-preview-status" data-state={state} title={error}>
				{status}
			</span>
		</div>
	)
}
