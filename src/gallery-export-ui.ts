import { randomBytes } from 'node:crypto'

export type ComponentShotStaticGalleryViewport = {
	height: number
	width: number
}

export type ComponentShotStaticGalleryImage = {
	dataUrl: string
	viewport: ComponentShotStaticGalleryViewport
}

export type ComponentShotStaticGalleryHistoryItem = {
	dataUrl: string
	filename: string
	updatedAt: Date | number | string
}

export type ComponentShotStaticGalleryMetadata = {
	description?: string
	tags?: readonly string[]
	title?: string
}

export type ComponentShotStaticGalleryDiagnostic = {
	message: string
	severity: 'error' | 'info' | 'warning'
	stage: string
}

export type ComponentShotStaticGalleryCaptureError = {
	id?: string
	message: string
	name?: string
	stage?: string
}

export type ComponentShotStaticGalleryScenario = {
	artifactKey: string
	diagnostics?: readonly ComponentShotStaticGalleryDiagnostic[]
	error?: ComponentShotStaticGalleryCaptureError | string
	history: readonly ComponentShotStaticGalleryHistoryItem[]
	id: string
	image?: ComponentShotStaticGalleryImage
	metadata?: ComponentShotStaticGalleryMetadata
	name: string
	relativePath: string
	routeId: string
}

export type ComponentShotStaticGalleryInput = {
	exportedAt: Date | number | string
	scenarios: readonly ComponentShotStaticGalleryScenario[]
	title?: string
}

type ScenarioStatus = 'captured' | 'failed' | 'missing'

type RenderableScenario = {
	currentDataUrl?: string
	errorSummary?: string
	history: readonly ComponentShotStaticGalleryHistoryItem[]
	index: number
	scenario: ComponentShotStaticGalleryScenario
	status: ScenarioStatus
	title: string
	viewport?: ComponentShotStaticGalleryViewport
}

const defaultGalleryTitle = 'Component Shot gallery'

const htmlEscapePattern = /[&<>"']/g
const htmlEscapes: Record<string, string> = {
	'"': '&quot;',
	'&': '&amp;',
	"'": '&#39;',
	'<': '&lt;',
	'>': '&gt;',
}

const escapeHtml = (value: unknown) =>
	String(value ?? '')
		.replace(/\u0000/g, '\uFFFD')
		.replace(htmlEscapePattern, (character) => htmlEscapes[character])

const cleanText = (value: unknown) => String(value ?? '').trim()

const captureErrorMessage = (
	error: ComponentShotStaticGalleryCaptureError | string | undefined,
) => cleanText(typeof error === 'string' ? error : error?.message)

const isPngDataUrl = (value: unknown): value is string =>
	typeof value === 'string' &&
	/^data:image\/png;base64,[a-z0-9+/]+={0,2}$/i.test(value)

const normalizeViewport = (
	viewport: ComponentShotStaticGalleryViewport | undefined,
): ComponentShotStaticGalleryViewport | undefined => {
	const rawHeight = Number(viewport?.height)
	const rawWidth = Number(viewport?.width)
	if (!Number.isFinite(rawHeight) || !Number.isFinite(rawWidth)) {
		return undefined
	}
	const height = Math.round(rawHeight)
	const width = Math.round(rawWidth)
	return height >= 1 && width >= 1 ? { height, width } : undefined
}

const formatDate = (value: Date | number | string) => {
	const date = value instanceof Date ? value : new Date(value)
	const original =
		value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : String(value)
	if (Number.isNaN(date.getTime())) {
		return {
			dateTime: '',
			label: cleanText(original) || 'Unknown date',
		}
	}
	const dateTime = date.toISOString()
	const label = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		hour: '2-digit',
		hour12: false,
		minute: '2-digit',
		month: 'short',
		timeZone: 'UTC',
		year: 'numeric',
	}).format(date)
	return { dateTime, label: `${label} UTC` }
}

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
	`${count} ${count === 1 ? singular : plural}`

const toRenderableScenario = (
	scenario: ComponentShotStaticGalleryScenario,
	index: number,
): RenderableScenario => {
	const currentDataUrl = isPngDataUrl(scenario.image?.dataUrl)
		? scenario.image.dataUrl
		: undefined
	const explicitError = captureErrorMessage(scenario.error)
	const invalidImageError =
		scenario.image && !currentDataUrl
			? 'The captured image was not a valid embedded PNG.'
			: undefined
	const errorSummary = explicitError || invalidImageError || undefined
	const status: ScenarioStatus = errorSummary
		? 'failed'
		: currentDataUrl
			? 'captured'
			: 'missing'

	return {
		currentDataUrl,
		errorSummary,
		history: scenario.history,
		index,
		scenario,
		status,
		title: cleanText(scenario.metadata?.title) || cleanText(scenario.name) || `Scenario ${index + 1}`,
		viewport: normalizeViewport(scenario.image?.viewport),
	}
}

const renderViewport = (viewport: ComponentShotStaticGalleryViewport | undefined) =>
	viewport
		? `<span class="meta-item" data-gallery-viewport data-viewport-height="${viewport.height}" data-viewport-width="${viewport.width}">
			<span aria-hidden="true" class="meta-icon">↔</span>
			${viewport.width} × ${viewport.height}
		</span>`
		: ''

const renderTags = (tags: readonly string[] | undefined, className = 'tag-list') => {
	const normalizedTags = (tags ?? []).map(cleanText).filter(Boolean)
	if (normalizedTags.length === 0) return ''
	return `<ul aria-label="Tags" class="${className}" data-gallery-tags>
		${normalizedTags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}
	</ul>`
}

const renderSnapshot = ({
	className,
	dataUrl,
	title,
	viewport,
}: {
	className: string
	dataUrl?: string
	title: string
	viewport?: ComponentShotStaticGalleryViewport
}) => {
	if (!dataUrl) return ''
	const dimensions = viewport ? ` height="${viewport.height}" width="${viewport.width}"` : ''
	return `<img
		alt="Snapshot of ${escapeHtml(title)}"
		class="${className}"
		data-gallery-image
		decoding="async"
		loading="lazy"
		src="${dataUrl}"${dimensions}
	/>`
}

const renderCardPreview = (item: RenderableScenario, dialogId: string) => {
	const { currentDataUrl, errorSummary, status, title, viewport } = item
	if (currentDataUrl) {
		return `<button
			aria-controls="${dialogId}"
			aria-label="View details for ${escapeHtml(title)}"
			class="card-preview has-image"
			data-gallery-open
			type="button"
		>
			${renderSnapshot({ className: 'card-image', dataUrl: currentDataUrl, title, viewport })}
			<span aria-hidden="true" class="preview-hint">View details</span>
		</button>`
	}

	const isError = status === 'failed'
	return `<button
		aria-controls="${dialogId}"
		aria-label="View details for ${escapeHtml(title)}"
		class="card-preview empty-preview"
		data-gallery-open
		type="button"
	>
		<span aria-hidden="true" class="empty-preview-mark">${isError ? '!' : '○'}</span>
		<strong>${isError ? 'Capture failed' : 'No snapshot'}</strong>
		<span>${escapeHtml(errorSummary ?? 'This scenario did not include a captured image.')}</span>
	</button>`
}

const renderCard = (item: RenderableScenario) => {
	const { errorSummary, index, scenario, status, title, viewport } = item
	const dialogId = `component-shot-static-dialog-${index + 1}`
	const description = cleanText(scenario.metadata?.description)
	const name = cleanText(scenario.name)
	const statusLabel =
		status === 'captured' ? 'Captured' : status === 'failed' ? 'Capture failed' : 'Not captured'
	const searchableText = [
		scenario.id,
		scenario.routeId,
		scenario.artifactKey,
		name,
		title,
		scenario.relativePath,
		description,
		...(scenario.metadata?.tags ?? []),
		errorSummary,
		...(scenario.diagnostics ?? []).flatMap((diagnostic) => [
			diagnostic.message,
			diagnostic.stage,
			diagnostic.severity,
		]),
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase()

	return `<article
		class="gallery-card"
		data-artifact-key="${escapeHtml(scenario.artifactKey)}"
		data-gallery-card
		data-route-id="${escapeHtml(scenario.routeId)}"
		data-scenario-id="${escapeHtml(scenario.id)}"
		data-search="${escapeHtml(searchableText)}"
		data-status="${status}"
	>
		${renderCardPreview(item, dialogId)}
		<div class="card-body">
			<div class="card-heading">
				<div class="card-title-copy">
					${name && name !== title ? `<span class="scenario-name">${escapeHtml(name)}</span>` : ''}
					<h2>${escapeHtml(title)}</h2>
				</div>
				<span class="status-badge" data-gallery-status="${status}">
					<span aria-hidden="true" class="status-dot"></span>
					${statusLabel}
				</span>
			</div>
			${description ? `<p class="card-description">${escapeHtml(description)}</p>` : ''}
			${errorSummary ? `<p class="card-error"><strong>Issue:</strong> ${escapeHtml(errorSummary)}</p>` : ''}
			${renderTags(scenario.metadata?.tags)}
			<div class="card-footer">
				<div class="card-meta">
					<span class="meta-item path" title="${escapeHtml(scenario.relativePath)}">
						<span aria-hidden="true" class="meta-icon">⌁</span>
						${escapeHtml(scenario.relativePath)}
					</span>
					${renderViewport(viewport)}
				</div>
				<button
					aria-controls="${dialogId}"
					class="details-button"
					data-gallery-open
					type="button"
				>
					Details <span aria-hidden="true">↗</span>
				</button>
			</div>
		</div>
	</article>`
}

const renderDiagnostics = (item: RenderableScenario) => {
	const diagnostics = item.scenario.diagnostics ?? []
	if (!item.scenario.error && diagnostics.length === 0 && !item.errorSummary) return ''
	const errorMessage = captureErrorMessage(item.scenario.error)
	const errorStage =
		typeof item.scenario.error === 'string' ? '' : cleanText(item.scenario.error?.stage)
	return `<section aria-labelledby="dialog-diagnostics-${item.index + 1}" class="dialog-section">
		<div class="section-heading">
			<h3 id="dialog-diagnostics-${item.index + 1}">Capture details</h3>
		</div>
		${
			item.scenario.error
				? `<div class="capture-error" data-gallery-error>
					<strong>Capture failed${errorStage ? ` · ${escapeHtml(errorStage)}` : ''}</strong>
					<p>${escapeHtml(errorMessage)}</p>
				</div>`
				: ''
		}
		${
			!item.scenario.error && item.errorSummary && diagnostics.length === 0
				? `<div class="capture-error" data-gallery-error>
					<strong>Snapshot unavailable</strong>
					<p>${escapeHtml(item.errorSummary)}</p>
				</div>`
				: ''
		}
		${
			diagnostics.length > 0
				? `<ul class="diagnostic-list" data-gallery-diagnostics>
					${diagnostics
						.map((diagnostic) => {
							const severity =
								diagnostic.severity === 'error' || diagnostic.severity === 'warning'
									? diagnostic.severity
									: 'info'
							return `<li data-gallery-diagnostic data-severity="${severity}">
								<span aria-hidden="true" class="diagnostic-mark">${
									severity === 'error' ? '!' : severity === 'warning' ? '△' : 'i'
								}</span>
								<span>
									<strong>${escapeHtml(cleanText(diagnostic.stage) || severity)}</strong>
									<span>${escapeHtml(diagnostic.message)}</span>
								</span>
							</li>`
						})
						.join('')}
				</ul>`
				: ''
		}
	</section>`
}

const renderHistory = (item: RenderableScenario) => {
	const { history } = item
	if (history.length === 0) return ''
	return `<section aria-labelledby="dialog-history-${item.index + 1}" class="dialog-section">
		<div class="section-heading">
			<h3 id="dialog-history-${item.index + 1}">History</h3>
			<span>${pluralize(history.length, 'snapshot')}</span>
		</div>
		<div class="history-grid" data-gallery-history>
			${history
				.map((entry) => {
					const date = formatDate(entry.updatedAt)
					const filename = cleanText(entry.filename) || 'Saved snapshot'
					const dataUrl = isPngDataUrl(entry.dataUrl) ? entry.dataUrl : undefined
					return `<figure class="history-item" data-gallery-history-item>
						<div class="history-preview">
							${
								dataUrl
									? `<img
										alt="${escapeHtml(filename)}"
										decoding="async"
										loading="lazy"
										src="${dataUrl}"
									/>`
									: `<span class="history-unavailable">Invalid embedded PNG</span>`
							}
						</div>
						<figcaption>
							<strong title="${escapeHtml(filename)}">${escapeHtml(filename)}</strong>
							<time${date.dateTime ? ` datetime="${escapeHtml(date.dateTime)}"` : ''}>${escapeHtml(date.label)}</time>
						</figcaption>
					</figure>`
				})
				.join('')}
		</div>
	</section>`
}

const renderDialogSnapshot = (item: RenderableScenario) => {
	if (item.currentDataUrl) {
		const snapshotId = `component-shot-static-snapshot-${item.index + 1}`
		return `<div class="dialog-snapshot-frame">
			<div class="snapshot-toolbar">
				<div>
					<strong>Screenshot</strong>
					<span>Fit to width · scroll when needed</span>
				</div>
				<button
					aria-controls="${snapshotId}"
					class="snapshot-scale-button"
					data-gallery-image-scale
					type="button"
				>
					View at 100%
				</button>
			</div>
			<div
				aria-label="Screenshot viewport"
				class="dialog-snapshot"
				data-gallery-current-snapshot
				data-image-mode="fit"
				id="${snapshotId}"
				role="region"
				tabindex="0"
			>
				<img
					alt="Snapshot of ${escapeHtml(item.title)}"
					class="dialog-image"
					data-gallery-dialog-image
					decoding="async"
				/>
			</div>
		</div>`
	}
	return `<div class="dialog-snapshot dialog-snapshot-empty" data-gallery-current-snapshot>
		<span aria-hidden="true">${item.status === 'failed' ? '!' : '○'}</span>
		<strong>${item.status === 'failed' ? 'Capture failed' : 'No current snapshot'}</strong>
		<p>${escapeHtml(item.errorSummary ?? 'No image was included for this scenario.')}</p>
	</div>`
}

const renderDialog = (item: RenderableScenario) => {
	const { index, scenario, title, viewport } = item
	const dialogId = `component-shot-static-dialog-${index + 1}`
	const titleId = `component-shot-static-dialog-title-${index + 1}`
	const description = cleanText(scenario.metadata?.description)
	const name = cleanText(scenario.name)

	return `<dialog
		aria-labelledby="${titleId}"
		class="gallery-dialog"
		data-gallery-dialog
		data-route-id="${escapeHtml(scenario.routeId)}"
		id="${dialogId}"
	>
		<div class="dialog-shell">
			<header class="dialog-header">
				<div>
					<span class="dialog-eyebrow">${escapeHtml(name || 'Scenario')}</span>
					<h2 id="${titleId}">${escapeHtml(title)}</h2>
				</div>
				<button aria-label="Close details" class="dialog-close" data-gallery-close type="button">
					<span aria-hidden="true">×</span>
				</button>
			</header>
			<div class="dialog-scroll">
				<div class="dialog-layout">
					<div class="dialog-main">
						${renderDialogSnapshot(item)}
						${renderHistory(item)}
					</div>
					<aside aria-label="Scenario metadata" class="dialog-sidebar">
						<section class="dialog-section scenario-summary">
							<h3>Scenario</h3>
							${description ? `<p>${escapeHtml(description)}</p>` : ''}
							${renderTags(scenario.metadata?.tags, 'tag-list dialog-tags')}
							<dl>
								<div>
									<dt>Source</dt>
									<dd title="${escapeHtml(scenario.relativePath)}">${escapeHtml(scenario.relativePath)}</dd>
								</div>
								${
									viewport
										? `<div>
											<dt>Viewport</dt>
											<dd data-gallery-viewport data-viewport-height="${viewport.height}" data-viewport-width="${viewport.width}">
												${viewport.width} × ${viewport.height}
											</dd>
										</div>`
										: ''
								}
								<div>
									<dt>Scenario ID</dt>
									<dd>${escapeHtml(scenario.id)}</dd>
								</div>
								<div>
									<dt>Artifact</dt>
									<dd>${escapeHtml(scenario.artifactKey)}</dd>
								</div>
							</dl>
						</section>
						${renderDiagnostics(item)}
					</aside>
				</div>
			</div>
		</div>
	</dialog>`
}

const staticGalleryStyles = String.raw`
	:root {
		--bg: #f2f4f7;
		--card: #ffffff;
		--canvas: #e9edf2;
		--text: #17202a;
		--muted: #667281;
		--subtle: #667281;
		--line: #d9dee6;
		--line-strong: #c7ced8;
		--accent: #176b5d;
		--accent-soft: #e5f2ee;
		--danger: #a43a44;
		--danger-soft: #fff0f1;
		--warning: #9a6700;
		--shadow: 0 1px 2px rgb(21 31 43 / 7%), 0 12px 30px rgb(21 31 43 / 6%);
		color: var(--text);
		background: var(--bg);
		font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		font-synthesis: none;
	}

	* { box-sizing: border-box; }
	html { min-width: 320px; min-height: 100%; background: var(--bg); }
	body { min-width: 320px; min-height: 100%; margin: 0; color: var(--text); background: var(--bg); }
	button, input { font: inherit; }
	button { color: inherit; }
	[hidden] { display: none !important; }
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		padding: 0;
		margin: -1px;
		border: 0;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	button:focus-visible, input:focus-visible, .dialog-snapshot:focus-visible {
		outline: 3px solid #0f766e;
		outline-offset: 2px;
		box-shadow: 0 0 0 2px #fff;
	}

	.static-gallery { min-height: 100vh; }
	.static-gallery[data-gallery-fallback-active]::after {
		content: "";
		position: fixed;
		z-index: 999;
		inset: 0;
		background: rgb(10 23 31 / 66%);
		backdrop-filter: blur(3px);
	}
	.gallery-hero {
		color: #f7fbfa;
		background:
			radial-gradient(circle at 82% -20%, rgb(116 190 174 / 34%), transparent 36rem),
			linear-gradient(135deg, #123a34 0%, #164b43 46%, #113d49 100%);
	}
	.hero-inner {
		width: min(1480px, 100%);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 32px;
		align-items: end;
		padding: 38px clamp(18px, 4vw, 56px) 34px;
		margin: 0 auto;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		margin-bottom: 22px;
		color: #cce3dd;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.brand-mark {
		position: relative;
		width: 18px;
		height: 18px;
		display: inline-block;
		border: 1px solid rgb(204 227 221 / 66%);
		border-radius: 5px;
	}
	.brand-mark::before, .brand-mark::after {
		position: absolute;
		width: 4px;
		height: 4px;
		border-radius: 1px;
		background: #d8ece7;
		content: "";
	}
	.brand-mark::before { top: 4px; left: 4px; box-shadow: 6px 0 #d8ece7, 0 6px #d8ece7; }
	.brand-mark::after { right: 4px; bottom: 4px; background: #75c3b3; }
	.hero-copy h1 {
		max-width: 840px;
		margin: 0;
		color: #fff;
		font-size: clamp(2rem, 4.2vw, 4.1rem);
		font-weight: 680;
		letter-spacing: -0.045em;
		line-height: 0.98;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}
	.export-meta {
		margin: 15px 0 0;
		color: #b8d3cd;
		font-size: 0.8rem;
		line-height: 1.5;
	}
	.hero-stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(78px, 1fr));
		gap: 1px;
		overflow: hidden;
		border: 1px solid rgb(218 238 233 / 20%);
		border-radius: 12px;
		background: rgb(218 238 233 / 18%);
	}
	.hero-stat {
		min-width: 94px;
		padding: 16px 17px;
		background: rgb(8 40 35 / 38%);
	}
	.hero-stat strong, .hero-stat span { display: block; }
	.hero-stat strong { color: #fff; font-size: 1.45rem; line-height: 1; }
	.hero-stat span {
		margin-top: 7px;
		color: #b8d3cd;
		font-size: 0.67rem;
		font-weight: 750;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.gallery-tools {
		position: sticky;
		top: 0;
		z-index: 10;
		border-bottom: 1px solid var(--line);
		background: rgb(249 250 251 / 92%);
		backdrop-filter: blur(14px);
	}
	.tools-inner {
		width: min(1480px, 100%);
		display: flex;
		gap: 18px;
		align-items: center;
		justify-content: space-between;
		padding: 13px clamp(18px, 4vw, 56px);
		margin: 0 auto;
	}
	.search-wrap {
		position: relative;
		width: min(500px, 100%);
	}
	.search-wrap::before {
		position: absolute;
		top: 50%;
		left: 13px;
		color: var(--subtle);
		font-size: 1rem;
		content: "⌕";
		transform: translateY(-52%);
		pointer-events: none;
	}
	.gallery-search {
		width: 100%;
		height: 42px;
		padding: 0 14px 0 38px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		color: var(--text);
		background: #fff;
		box-shadow: 0 1px 1px rgb(21 31 43 / 4%);
		font-size: 0.86rem;
	}
	.gallery-search::placeholder { color: #667281; }
	.result-count {
		flex: 0 0 auto;
		color: var(--muted);
		font-size: 0.76rem;
		font-weight: 700;
	}

	.gallery-main {
		width: min(1480px, 100%);
		padding: clamp(22px, 3.5vw, 48px) clamp(18px, 4vw, 56px) 64px;
		margin: 0 auto;
	}
	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
		gap: clamp(17px, 2vw, 25px);
		align-items: start;
	}
	.gallery-card {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 13px;
		background: var(--card);
		box-shadow: var(--shadow);
		transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
	}
	.gallery-card:hover {
		border-color: var(--line-strong);
		box-shadow: 0 2px 3px rgb(21 31 43 / 7%), 0 18px 38px rgb(21 31 43 / 10%);
		transform: translateY(-2px);
	}
	.gallery-card[data-status="failed"] { border-color: #e6c3c6; }
	.card-preview {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 10;
		min-height: 190px;
		display: grid;
		place-items: center;
		overflow: hidden;
		padding: 0;
		border: 0;
		border-bottom: 1px solid var(--line);
		background-color: var(--canvas);
		background-image:
			linear-gradient(45deg, rgb(151 162 177 / 11%) 25%, transparent 25%),
			linear-gradient(-45deg, rgb(151 162 177 / 11%) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, rgb(151 162 177 / 11%) 75%),
			linear-gradient(-45deg, transparent 75%, rgb(151 162 177 / 11%) 75%);
		background-position: 0 0, 0 7px, 7px -7px, -7px 0;
		background-size: 14px 14px;
		cursor: zoom-in;
	}
	.card-image {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
	}
	.preview-hint {
		position: absolute;
		right: 10px;
		bottom: 10px;
		padding: 6px 9px;
		border: 1px solid rgb(255 255 255 / 55%);
		border-radius: 6px;
		color: #fff;
		background: rgb(18 32 42 / 78%);
		box-shadow: 0 3px 12px rgb(0 0 0 / 14%);
		font-size: 0.67rem;
		font-weight: 800;
		opacity: 0;
		transform: translateY(3px);
		transition: opacity 150ms ease, transform 150ms ease;
	}
	.card-preview:hover .preview-hint, .card-preview:focus-visible .preview-hint {
		opacity: 1;
		transform: none;
	}
	.empty-preview {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 26px;
		color: var(--muted);
		background: #f1f3f6;
		text-align: center;
		cursor: pointer;
	}
	.gallery-card[data-status="failed"] .empty-preview {
		color: #7b333a;
		background: repeating-linear-gradient(-45deg, #fff5f5, #fff5f5 10px, #fffafa 10px, #fffafa 20px);
	}
	.empty-preview-mark {
		width: 39px;
		height: 39px;
		display: grid;
		place-items: center;
		margin-bottom: 5px;
		border: 1px solid #bdc5d0;
		border-radius: 50%;
		color: var(--subtle);
		background: rgb(255 255 255 / 70%);
		font-size: 1.1rem;
		font-weight: 800;
	}
	.gallery-card[data-status="failed"] .empty-preview-mark {
		border-color: #d99ba1;
		color: var(--danger);
	}
	.empty-preview strong { color: var(--text); font-size: 0.92rem; }
	.empty-preview > span:last-child {
		max-width: 290px;
		display: -webkit-box;
		overflow: hidden;
		font-size: 0.74rem;
		line-height: 1.45;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}
	.card-body { padding: 18px 19px 16px; }
	.card-heading {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		justify-content: space-between;
	}
	.card-title-copy { min-width: 0; }
	.scenario-name, .dialog-eyebrow {
		display: block;
		margin-bottom: 4px;
		color: var(--accent);
		font-size: 0.64rem;
		font-weight: 800;
		letter-spacing: 0.075em;
		overflow-wrap: anywhere;
		text-transform: uppercase;
	}
	.card-heading h2 {
		margin: 0;
		font-size: 1.08rem;
		letter-spacing: -0.018em;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.status-badge {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 7px;
		border-radius: 999px;
		color: #38655c;
		background: var(--accent-soft);
		font-size: 0.62rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #318c7c; }
	.status-badge[data-gallery-status="failed"] { color: var(--danger); background: var(--danger-soft); }
	.status-badge[data-gallery-status="failed"] .status-dot { background: #c14c57; }
	.status-badge[data-gallery-status="missing"] { color: #667281; background: #edf0f3; }
	.status-badge[data-gallery-status="missing"] .status-dot { background: #909aa6; }
	.card-description {
		display: -webkit-box;
		overflow: hidden;
		margin: 11px 0 0;
		color: var(--muted);
		font-size: 0.77rem;
		line-height: 1.5;
		overflow-wrap: anywhere;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
	}
	.card-error {
		padding: 8px 10px;
		margin: 11px 0 0;
		border-left: 3px solid #d37179;
		border-radius: 3px;
		color: #7f353c;
		background: #fff4f4;
		font-size: 0.72rem;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		padding: 0;
		margin: 12px 0 0;
		list-style: none;
	}
	.tag-list li {
		padding: 4px 7px;
		border: 1px solid #dce2e8;
		border-radius: 5px;
		color: #5b6674;
		background: #f8f9fb;
		font-size: 0.63rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.card-footer {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		justify-content: space-between;
		padding-top: 14px;
		margin-top: 15px;
		border-top: 1px solid #e7eaf0;
	}
	.card-meta { min-width: 0; display: grid; gap: 5px; }
	.meta-item {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		font-size: 0.66rem;
		line-height: 1.25;
	}
	.meta-item.path {
		overflow: hidden;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta-icon { flex: 0 0 auto; color: var(--subtle); font-family: sans-serif; }
	.details-button {
		flex: 0 0 auto;
		display: inline-flex;
		gap: 5px;
		align-items: center;
		padding: 6px 0;
		border: 0;
		color: var(--accent);
		background: transparent;
		font-size: 0.69rem;
		font-weight: 850;
		cursor: pointer;
	}
	.details-button:hover { color: #0f4e44; text-decoration: underline; text-underline-offset: 3px; }
	.empty-results {
		max-width: 580px;
		padding: 52px 24px;
		margin: 24px auto;
		border: 1px dashed var(--line-strong);
		border-radius: 12px;
		color: var(--muted);
		background: rgb(255 255 255 / 60%);
		text-align: center;
	}
	.empty-results strong { display: block; margin-bottom: 7px; color: var(--text); font-size: 1rem; }
	.empty-results span { font-size: 0.79rem; line-height: 1.5; }

	.gallery-dialog {
		position: fixed;
		z-index: 1000;
		inset: 0;
		width: calc(100vw - 32px);
		height: calc(100vh - 32px);
		height: calc(100dvh - 32px);
		max-width: none;
		max-height: none;
		overflow: hidden;
		padding: 0;
		border: 1px solid #aeb7c2;
		border-radius: 14px;
		color: var(--text);
		background: #f7f8fa;
		box-shadow: 0 32px 90px rgb(9 20 29 / 35%);
		margin: auto;
	}
	.gallery-dialog::backdrop { background: rgb(10 23 31 / 66%); backdrop-filter: blur(3px); }
	.gallery-dialog[open] { animation: dialog-in 150ms ease-out; }
	.dialog-shell {
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	.dialog-header {
		flex: 0 0 auto;
		display: flex;
		gap: 20px;
		align-items: center;
		justify-content: space-between;
		padding: 17px 20px;
		border-bottom: 1px solid var(--line);
		background: rgb(255 255 255 / 96%);
	}
	.dialog-header > div { min-width: 0; }
	.dialog-header h2 {
		margin: 0;
		font-size: 1.15rem;
		letter-spacing: -0.02em;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.dialog-eyebrow { margin-bottom: 3px; }
	.dialog-close {
		width: 34px;
		height: 34px;
		flex: 0 0 34px;
		display: grid;
		place-items: center;
		padding: 0 0 3px;
		border: 1px solid var(--line);
		border-radius: 8px;
		color: #5f6a78;
		background: #fff;
		font-size: 1.35rem;
		line-height: 1;
		cursor: pointer;
	}
	.dialog-close:hover { border-color: #aeb7c2; color: var(--text); background: #f3f5f7; }
	.dialog-scroll {
		min-height: 0;
		flex: 1 1 auto;
		overflow: auto;
		overscroll-behavior: contain;
	}
	.dialog-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) clamp(280px, 20vw, 340px);
		gap: 20px;
		align-items: start;
		padding: 20px;
	}
	.dialog-main { min-width: 0; display: grid; gap: 20px; }
	.dialog-snapshot-frame { min-width: 0; }
	.snapshot-toolbar {
		display: flex;
		gap: 16px;
		align-items: center;
		justify-content: space-between;
		padding: 9px 10px 9px 13px;
		border: 1px solid var(--line-strong);
		border-bottom: 0;
		border-radius: 10px 10px 0 0;
		background: #fff;
	}
	.snapshot-toolbar > div { min-width: 0; }
	.snapshot-toolbar strong, .snapshot-toolbar span { display: block; }
	.snapshot-toolbar strong {
		color: var(--text);
		font-size: 0.7rem;
		letter-spacing: 0.015em;
	}
	.snapshot-toolbar span {
		margin-top: 2px;
		color: var(--subtle);
		font-size: 0.62rem;
		line-height: 1.35;
	}
	.snapshot-scale-button {
		min-height: 40px;
		flex: 0 0 auto;
		padding: 7px 11px;
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		color: #285f56;
		background: #f8faf9;
		font-size: 0.72rem;
		font-weight: 800;
		cursor: pointer;
	}
	.snapshot-scale-button:hover { border-color: #8caaa4; color: #174d44; background: #edf6f3; }
	.dialog-snapshot {
		max-height: min(68vh, 760px);
		max-height: min(68dvh, 760px);
		min-height: 260px;
		display: flex;
		flex-direction: column;
		overflow: auto;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background-color: #e7ebf0;
		background-image:
			linear-gradient(45deg, rgb(125 138 154 / 12%) 25%, transparent 25%),
			linear-gradient(-45deg, rgb(125 138 154 / 12%) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, rgb(125 138 154 / 12%) 75%),
			linear-gradient(-45deg, transparent 75%, rgb(125 138 154 / 12%) 75%);
		background-position: 0 0, 0 8px, 8px -8px, -8px 0;
		background-size: 16px 16px;
		overscroll-behavior-x: contain;
		overscroll-behavior-y: auto;
		scrollbar-gutter: stable;
		-webkit-overflow-scrolling: touch;
	}
	.dialog-snapshot-frame .dialog-snapshot { border-radius: 0 0 10px 10px; }
	.dialog-snapshot-frame .dialog-snapshot {
		height: calc(100vh - 205px);
		height: calc(100dvh - 205px);
		max-height: none;
	}
	.dialog-image {
		width: 100%;
		height: auto;
		flex: none;
		display: block;
		margin: auto;
		max-width: none;
	}
	.dialog-snapshot[data-image-mode="actual"] .dialog-image { width: auto; }
	.dialog-snapshot-empty {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 36px;
		color: var(--muted);
		background: #eef1f4;
		text-align: center;
	}
	.dialog-snapshot-empty > span {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		margin-bottom: 3px;
		border: 1px solid var(--line-strong);
		border-radius: 50%;
		color: var(--danger);
		background: #fff;
		font-size: 1.25rem;
		font-weight: 800;
	}
	.dialog-snapshot-empty strong { color: var(--text); }
	.dialog-snapshot-empty p { max-width: 520px; margin: 0; font-size: 0.78rem; line-height: 1.5; }
	.dialog-sidebar { min-width: 0; display: grid; gap: 14px; }
	.dialog-section {
		min-width: 0;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: #fff;
	}
	.dialog-section h3 { margin: 0; font-size: 0.76rem; letter-spacing: 0.015em; }
	.scenario-summary > p {
		margin: 11px 0 0;
		color: var(--muted);
		font-size: 0.76rem;
		line-height: 1.55;
		white-space: pre-line;
	}
	.dialog-tags { margin-top: 12px; }
	.scenario-summary dl { display: grid; gap: 0; margin: 14px 0 0; }
	.scenario-summary dl > div { padding: 10px 0; border-top: 1px solid #e8ebef; }
	.scenario-summary dt {
		margin-bottom: 4px;
		color: var(--subtle);
		font-size: 0.59rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.scenario-summary dd {
		overflow: hidden;
		margin: 0;
		color: #4d5865;
		font: 0.68rem/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		overflow-wrap: anywhere;
	}
	.section-heading {
		display: flex;
		gap: 12px;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 13px;
	}
	.section-heading > span { color: var(--subtle); font-size: 0.65rem; font-weight: 700; }
	.capture-error {
		padding: 11px;
		border: 1px solid #ecc8cb;
		border-radius: 7px;
		color: #7e333a;
		background: var(--danger-soft);
	}
	.capture-error strong { font-size: 0.72rem; }
	.capture-error p { margin: 5px 0 0; font-size: 0.68rem; line-height: 1.5; overflow-wrap: anywhere; }
	.diagnostic-list { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }
	.capture-error + .diagnostic-list { margin-top: 10px; }
	.diagnostic-list li {
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr);
		gap: 8px;
		padding: 8px;
		border-radius: 7px;
		color: #53606e;
		background: #f3f5f7;
	}
	.diagnostic-list li[data-severity="error"] { color: #7e333a; background: var(--danger-soft); }
	.diagnostic-list li[data-severity="warning"] { color: #765418; background: #fff7df; }
	.diagnostic-mark {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: #fff;
		background: #7c8794;
		font-size: 0.65rem;
		font-weight: 900;
	}
	[data-severity="error"] .diagnostic-mark { background: #bf4f58; }
	[data-severity="warning"] .diagnostic-mark { background: #b47c16; }
	.diagnostic-list li > span:last-child { min-width: 0; }
	.diagnostic-list strong {
		display: block;
		margin-bottom: 2px;
		font-size: 0.62rem;
		text-transform: capitalize;
	}
	.diagnostic-list strong + span { display: block; font-size: 0.67rem; line-height: 1.45; overflow-wrap: anywhere; }
	.history-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 11px;
	}
	.history-item {
		min-width: 0;
		overflow: hidden;
		margin: 0;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: #f8f9fa;
	}
	.history-preview {
		aspect-ratio: 16 / 10;
		display: grid;
		place-items: center;
		overflow: hidden;
		border-bottom: 1px solid var(--line);
		background: var(--canvas);
	}
	.history-preview img { width: 100%; height: 100%; display: block; object-fit: contain; }
	.history-unavailable { padding: 12px; color: var(--danger); font-size: 0.68rem; text-align: center; }
	.history-item figcaption { min-width: 0; padding: 8px 9px 9px; }
	.history-item figcaption strong, .history-item figcaption time {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.history-item figcaption strong { font: 0.64rem/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
	.history-item figcaption time { margin-top: 4px; color: var(--subtle); font-size: 0.59rem; }

	@keyframes dialog-in {
		from { opacity: 0; transform: translateY(8px) scale(0.99); }
		to { opacity: 1; transform: none; }
	}
	@media (max-width: 820px) {
		.hero-inner { grid-template-columns: 1fr; gap: 24px; }
		.hero-stats { width: min(390px, 100%); }
		.dialog-layout { grid-template-columns: 1fr; }
		.dialog-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (max-width: 560px) {
		.hero-inner { padding: 28px 18px 24px; }
		.brand { margin-bottom: 17px; }
		.hero-copy h1 { font-size: clamp(2rem, 12vw, 2.8rem); line-height: 1; }
		.hero-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.hero-stat { min-width: 0; padding: 13px 10px; }
		.hero-stat strong { font-size: 1.2rem; }
		.hero-stat span { font-size: 0.58rem; }
		.tools-inner {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			justify-content: stretch;
			gap: 7px;
			padding: 10px 18px;
		}
		.search-wrap { width: 100%; }
		.result-count { padding-left: 2px; }
		.gallery-main { padding: 20px 12px 40px; }
		.gallery-grid { gap: 15px; }
		.gallery-card:hover { transform: none; }
		.card-body { padding: 16px; }
		.card-heading { display: grid; gap: 8px; }
		.status-badge { justify-self: start; }
		.gallery-dialog {
			top: 8px;
			bottom: auto;
			width: calc(100% - 16px);
			height: fit-content;
			max-height: calc(100vh - 16px);
			max-height: calc(100dvh - 16px);
			border-radius: 10px;
			margin-block: 0;
		}
		.dialog-shell {
			height: auto;
			max-height: calc(100vh - 18px);
			max-height: calc(100dvh - 18px);
		}
		.dialog-header { padding: 14px; }
		.dialog-layout { gap: 12px; padding: 10px; }
		.dialog-sidebar { grid-template-columns: 1fr; }
		.dialog-snapshot-frame .dialog-snapshot {
			height: auto;
			max-height: 58vh;
			max-height: 58dvh;
			min-height: 190px;
		}
		.dialog-main { gap: 12px; }
		.dialog-section { padding: 13px; }
		.history-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
	}
	@media (prefers-reduced-motion: reduce) {
		*, *::before, *::after {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}
	@media print {
		.gallery-tools, .details-button, .preview-hint, .gallery-dialog { display: none !important; }
		.gallery-hero { color: #111; background: #fff; }
		.hero-copy h1, .hero-stat strong { color: #111; }
		.export-meta, .brand, .hero-stat span { color: #555; }
		.hero-stats { border-color: #ccc; background: #ccc; }
		.hero-stat { background: #fff; }
		.gallery-main { width: 100%; padding: 20px 0; }
		.gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
		.gallery-card { break-inside: avoid; box-shadow: none; }
	}
`

const staticGalleryScript = String.raw`
	(() => {
		const root = document.querySelector('[data-static-gallery]')
		if (!root) return

		const search = root.querySelector('[data-gallery-search]')
		const cards = Array.from(root.querySelectorAll('[data-gallery-card]'))
		const count = root.querySelector('[data-gallery-count]')
		const empty = root.querySelector('[data-gallery-empty]')
		const returnFocus = new WeakMap()
		const scaleRestorations = new WeakMap()

		const restoreDialogFocus = (dialog) => {
			const focusTarget = returnFocus.get(dialog)
			if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus()
			returnFocus.delete(dialog)
		}

		const clearFallbackState = (dialog) => {
			dialog.removeAttribute('aria-modal')
			dialog.removeAttribute('data-gallery-fallback-open')
			if (!root.querySelector('[data-gallery-fallback-open]')) {
				root.removeAttribute('data-gallery-fallback-active')
			}
		}

		const closeDialog = (dialog) => {
			if (typeof dialog.close === 'function') {
				dialog.close()
				clearFallbackState(dialog)
				restoreDialogFocus(dialog)
			} else {
				dialog.removeAttribute('open')
				clearFallbackState(dialog)
				restoreDialogFocus(dialog)
			}
		}

		const updateSearch = () => {
			const query = search ? search.value.trim().toLowerCase() : ''
			const terms = query ? query.split(/\s+/) : []
			let visible = 0
			for (const card of cards) {
				const searchable = card.getAttribute('data-search') || ''
				const matches = terms.every((term) => searchable.includes(term))
				card.hidden = !matches
				if (matches) visible += 1
			}
			if (count) {
				count.textContent = query
					? visible + ' of ' + cards.length + (cards.length === 1 ? ' scenario' : ' scenarios')
					: cards.length + (cards.length === 1 ? ' scenario' : ' scenarios')
			}
			if (empty) empty.hidden = visible !== 0
		}

		if (search) search.addEventListener('input', updateSearch)

		root.addEventListener('click', (event) => {
			if (!(event.target instanceof Element)) return
			if (event.target === root && root.hasAttribute('data-gallery-fallback-active')) {
				const dialog = root.querySelector('[data-gallery-fallback-open]')
				if (dialog) closeDialog(dialog)
				return
			}
			const scaleButton = event.target.closest('[data-gallery-image-scale]')
			if (scaleButton) {
				const snapshotId = scaleButton.getAttribute('aria-controls')
				const snapshot = snapshotId ? document.getElementById(snapshotId) : null
				if (
					snapshot &&
					root.contains(snapshot) &&
					snapshot.matches('[data-gallery-current-snapshot]')
				) {
					const pendingRestoration = scaleRestorations.get(snapshot)
					if (pendingRestoration) cancelAnimationFrame(pendingRestoration.frame)
					const centerX =
						pendingRestoration?.centerX ??
						(snapshot.scrollLeft + snapshot.clientWidth / 2) / snapshot.scrollWidth
					const centerY =
						pendingRestoration?.centerY ??
						(snapshot.scrollTop + snapshot.clientHeight / 2) / snapshot.scrollHeight
					const useActualSize = snapshot.getAttribute('data-image-mode') !== 'actual'
					snapshot.setAttribute('data-image-mode', useActualSize ? 'actual' : 'fit')
					scaleButton.textContent = useActualSize ? 'Fit to width' : 'View at 100%'
					const restoration = { centerX, centerY, frame: 0 }
					restoration.frame = requestAnimationFrame(() => {
						snapshot.scrollLeft = centerX * snapshot.scrollWidth - snapshot.clientWidth / 2
						snapshot.scrollTop = centerY * snapshot.scrollHeight - snapshot.clientHeight / 2
						if (scaleRestorations.get(snapshot) === restoration) {
							scaleRestorations.delete(snapshot)
						}
					})
					scaleRestorations.set(snapshot, restoration)
				}
				return
			}
			const opener = event.target.closest('[data-gallery-open]')
			if (opener) {
				const id = opener.getAttribute('aria-controls')
				const dialog = id ? document.getElementById(id) : null
				if (dialog && dialog.matches('[data-gallery-dialog]')) {
					const card = opener.closest('[data-gallery-card]')
					const sourceImage = card ? card.querySelector('[data-gallery-image]') : null
					const dialogImage = dialog.querySelector('[data-gallery-dialog-image]')
					if (sourceImage && dialogImage && !dialogImage.getAttribute('src')) {
						const source = sourceImage.getAttribute('src')
						if (source) dialogImage.setAttribute('src', source)
					}
					returnFocus.set(dialog, opener)
					if (typeof dialog.showModal === 'function') dialog.showModal()
					else {
						root.setAttribute('data-gallery-fallback-active', '')
						dialog.setAttribute('aria-modal', 'true')
						dialog.setAttribute('data-gallery-fallback-open', '')
						dialog.setAttribute('open', '')
						const focusTarget = dialog.querySelector('[data-gallery-close]')
						if (focusTarget && typeof focusTarget.focus === 'function') {
							focusTarget.focus()
							requestAnimationFrame(() => {
								if (dialog.hasAttribute('data-gallery-fallback-open')) {
									focusTarget.focus()
								}
							})
						}
					}
				}
				return
			}

			const closer = event.target.closest('[data-gallery-close]')
			if (!closer) return
			const dialog = closer.closest('[data-gallery-dialog]')
			if (!dialog) return
			closeDialog(dialog)
		})

		document.addEventListener('keydown', (event) => {
			const dialog = root.querySelector('[data-gallery-fallback-open]')
			if (!dialog) return
			if (event.key === 'Escape') {
				event.preventDefault()
				closeDialog(dialog)
				return
			}
			if (event.key !== 'Tab') return
			const focusable = Array.from(
				dialog.querySelectorAll(
					'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
				),
			).filter((element) => element.getClientRects().length > 0)
			if (focusable.length === 0) return
			const first = focusable[0]
			const last = focusable[focusable.length - 1]
			const active = document.activeElement
			if (event.shiftKey && (active === first || !dialog.contains(active))) {
				event.preventDefault()
				last.focus()
			} else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
				event.preventDefault()
				first.focus()
			}
		})

		for (const dialog of root.querySelectorAll('[data-gallery-dialog]')) {
			dialog.addEventListener('click', (event) => {
				if (event.target !== dialog) return
				closeDialog(dialog)
			})
			dialog.addEventListener('close', () => {
				if (dialog.hasAttribute('open')) return
				clearFallbackState(dialog)
				restoreDialogFocus(dialog)
			})
		}
	})()
`

export const createStaticGalleryHtml = ({
	exportedAt,
	scenarios,
	title: titleInput,
}: ComponentShotStaticGalleryInput) => {
	const title = cleanText(titleInput) || defaultGalleryTitle
	const items = scenarios.map(toRenderableScenario)
	const capturedCount = items.filter((item) => item.status === 'captured').length
	const errorCount = items.filter((item) => item.status === 'failed').length
	const missingCount = items.length - capturedCount - errorCount
	const exportedDate = formatDate(exportedAt)
	const nonce = randomBytes(18).toString('base64')
	const scenarioLabel = pluralize(items.length, 'scenario')

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta
			http-equiv="Content-Security-Policy"
			content="default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-src 'none'; img-src data:; media-src 'none'; object-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; worker-src 'none'"
		/>
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="light" />
		<meta name="referrer" content="no-referrer" />
		<title>${escapeHtml(title)}</title>
		<style nonce="${nonce}">${staticGalleryStyles}</style>
	</head>
	<body>
		<div class="static-gallery" data-static-gallery>
			<header class="gallery-hero">
				<div class="hero-inner">
					<div class="hero-copy">
						<div class="brand"><span aria-hidden="true" class="brand-mark"></span> Component Shot</div>
						<h1>${escapeHtml(title)}</h1>
						<p class="export-meta">
							Static gallery · ${scenarioLabel} · Exported
							<time${exportedDate.dateTime ? ` datetime="${escapeHtml(exportedDate.dateTime)}"` : ''}>${escapeHtml(exportedDate.label)}</time>
						</p>
					</div>
					<div aria-label="Gallery summary" class="hero-stats">
						<div class="hero-stat"><strong>${items.length}</strong><span>Total</span></div>
						<div class="hero-stat"><strong>${capturedCount}</strong><span>Captured</span></div>
						<div class="hero-stat"><strong>${errorCount}</strong><span>Failed</span></div>
					</div>
				</div>
			</header>

			<div class="gallery-tools">
				<div class="tools-inner">
					<label class="search-wrap">
						<span class="sr-only">Search scenarios</span>
						<input
							autocomplete="off"
							class="gallery-search"
							data-gallery-search
							placeholder="Search titles, paths, tags, or diagnostics…"
							type="search"
						/>
					</label>
					<span aria-live="polite" class="result-count" data-gallery-count>${scenarioLabel}</span>
				</div>
			</div>

			<main class="gallery-main">
				<div class="gallery-grid" data-gallery-grid>
					${items.map(renderCard).join('')}
				</div>
				<div class="empty-results" data-gallery-empty${items.length === 0 ? '' : ' hidden'}>
					<strong>${items.length === 0 ? 'No scenarios were exported' : 'No matching scenarios'}</strong>
					<span>${
						items.length === 0
							? 'Capture a scenario and export the gallery again.'
							: 'Try a title, source path, tag, or diagnostic message.'
					}</span>
				</div>
			</main>

			${items.map(renderDialog).join('')}
			<span hidden data-gallery-missing-count="${missingCount}"></span>
		</div>
		<script nonce="${nonce}">${staticGalleryScript}</script>
	</body>
</html>`
}
