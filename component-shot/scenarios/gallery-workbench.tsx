const scenarios = [
	{
		name: 'rfp-progress-early',
		path: 'component-shot/scenarios/rfp-progress-early.tsx',
		pinned: true,
		progress: 68,
		state: 'Starting...',
		type: 'loading',
	},
	{
		name: 'rfp-progress',
		path: 'component-shot/scenarios/rfp-progress.tsx',
		pinned: false,
		progress: 64,
		state: 'Draft firm questions...',
		type: 'steps',
	},
	{
		name: 'rfp-result',
		path: 'component-shot/scenarios/rfp-result.tsx',
		pinned: false,
		progress: 100,
		state: 'RFP-1042 - 42s',
		type: 'result',
	},
	{
		name: 'rfp-loading-v2',
		path: 'component-shot/scenarios/rfp-loading-v2.tsx',
		pinned: false,
		progress: 72,
		state: 'Drafting firm questions...',
		type: 'steps',
	},
	{
		name: 'rfp-result-compact',
		path: 'component-shot/scenarios/rfp-result-compact.tsx',
		pinned: true,
		progress: 100,
		state: 'REQ-537856 - 21s',
		type: 'result',
	},
	{
		name: 'rfp-progress-redesign',
		path: 'component-shot/scenarios/rfp-progress-redesign.tsx',
		pinned: false,
		progress: 54,
		state: 'Reading matter brief...',
		type: 'checklist',
	},
]

const PinIcon = () => (
	<svg aria-hidden="true" viewBox="0 0 20 20">
		<path d="M7 3h6l-1 5 3 3v2H5v-2l3-3-1-5Z" />
		<path d="M10 13v4" />
	</svg>
)

const TrashIcon = () => (
	<svg aria-hidden="true" viewBox="0 0 20 20">
		<path d="M4 6h12" />
		<path d="M8 6V4h4v2" />
		<path d="M6 6l1 10h6l1-10" />
		<path d="M9 9v4" />
		<path d="M11 9v4" />
	</svg>
)

const OpenIcon = () => (
	<svg aria-hidden="true" viewBox="0 0 20 20">
		<path d="M8 5H5v10h10v-3" />
		<path d="M11 5h4v4" />
		<path d="M10 10l5-5" />
	</svg>
)

const styles = `
	.gallery-fixture {
		min-height: 980px;
		padding: 0 14px 18px;
		background: #e9eef3;
		color: #111827;
		font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	}

	.app-shell {
		width: 100%;
		margin: 0 auto;
	}

	.gallery-header {
		display: grid;
		grid-template-columns: minmax(280px, 1fr) auto;
		align-items: center;
		gap: 14px;
		margin: 0 -14px 12px;
		padding: 9px 14px;
		border-bottom: 1px solid #cbd5e1;
		background: rgb(233 238 243 / 94%);
	}

	.title-lockup {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 9px;
	}

	.brand-mark {
		width: 30px;
		height: 30px;
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid #233044;
		border-radius: 6px;
		background: #101b2d;
		color: #ffffff;
		font-size: 0.64rem;
		font-weight: 900;
		line-height: 1;
	}

	.eyebrow {
		margin: 0 0 2px;
		color: #0f766e;
		font-size: 0.62rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	.gallery-fixture h1,
	.gallery-fixture h2,
	.gallery-fixture p {
		margin-top: 0;
	}

	.gallery-fixture h1 {
		margin-bottom: 0;
		color: #111827;
		font-size: 1.02rem;
		line-height: 1.1;
	}

	.workspace-path {
		margin: 3px 0 0;
		color: #526173;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
		font-size: 0.72rem;
		line-height: 1.25;
	}

	.summary {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		color: #526173;
		font-weight: 700;
		flex-wrap: wrap;
	}

	.search-control {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.search-control span {
		position: absolute;
		left: 9px;
		color: #718096;
		font-size: 0.72rem;
		font-weight: 800;
	}

	.search-control input {
		width: 260px;
		min-height: 32px;
		padding: 0 10px 0 58px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background: #ffffff;
		color: #111827;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 650;
	}

	.layout-control {
		display: inline-flex;
		align-items: center;
		overflow: hidden;
		min-height: 32px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background: #ffffff;
		color: #526173;
		font-size: 0.74rem;
		font-weight: 800;
	}

	.layout-control span {
		padding: 0 8px;
	}

	.layout-control select {
		min-height: 30px;
		padding: 0 26px 0 8px;
		border: 0;
		border-left: 1px solid #cbd5e1;
		background: #f6f8fb;
		color: #111827;
		font: inherit;
	}

	.summary-count,
	.summary a,
	.summary button {
		min-height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		font-size: 0.76rem;
		font-weight: 800;
	}

	.summary-count {
		padding: 0 9px;
		border: 1px solid #cbd5e1;
		border-radius: 999px;
		background: #dde6ef;
		color: #35465a;
		white-space: nowrap;
	}

	.summary a,
	.summary button {
		padding: 0 10px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #111827;
		font: inherit;
		text-decoration: none;
	}

	.summary .danger-button {
		border-color: #e4b8c0;
		color: #a11d33;
	}

	.scenario-grid {
		--auto-card-min: clamp(460px, 30vw, 640px);
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(var(--auto-card-min), 100%), 1fr));
		align-items: start;
		gap: 10px;
	}

	.scenario-card {
		display: grid;
		overflow: hidden;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background: #ffffff;
		box-shadow: 0 1px 2px rgb(15 23 42 / 5%);
	}

	.scenario-card[data-pinned="true"] {
		border-color: #6eaa9d;
		box-shadow: inset 0 2px 0 #6eaa9d, 0 1px 2px rgb(15 23 42 / 6%);
	}

	.render-frame {
		height: 280px;
		overflow: hidden;
		border-bottom: 1px solid #cbd5e1;
		background: #fbfcfe;
	}

	.preview-stage {
		height: 100%;
		display: grid;
		place-items: start center;
		padding: 28px 24px;
		background: #fbfcfe;
	}

	.preview-panel {
		width: 540px;
		min-height: 138px;
		border: 1px solid #c8ced8;
		border-radius: 4px;
		background: #ffffff;
	}

	.preview-panel--accent {
		border-color: #7c6fe0;
		box-shadow: inset 2px 0 0 #7c6fe0;
	}

	.preview-head {
		display: grid;
		grid-template-columns: 32px 1fr;
		gap: 12px;
		align-items: center;
		padding: 20px 22px 14px;
	}

	.preview-icon {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: #dceff6;
		color: #2b6f85;
		font-size: 0.76rem;
		font-weight: 900;
	}

	.preview-title {
		margin: 0 0 4px;
		color: #111827;
		font-size: 0.98rem;
		font-weight: 850;
	}

	.preview-subtitle {
		margin: 0;
		color: #526173;
		font-size: 0.84rem;
		font-weight: 650;
	}

	.progress-track {
		height: 5px;
		margin: 0 22px 20px;
		overflow: hidden;
		border-radius: 999px;
		background: #b9d1db;
	}

	.progress-value {
		height: 100%;
		background: #2e7086;
	}

	.step-list {
		display: grid;
		gap: 10px;
		padding: 0 32px 26px;
		color: #111827;
		font-size: 0.9rem;
		font-weight: 760;
	}

	.step-muted {
		color: #667586;
		font-weight: 650;
	}

	.result-body {
		padding: 0 22px 22px;
	}

	.result-kicker {
		margin: 0 0 8px;
		color: #47704f;
		font-size: 0.76rem;
		font-weight: 850;
		text-transform: uppercase;
	}

	.result-title {
		margin: 0;
		color: #111827;
		font-size: 1rem;
		font-weight: 850;
		line-height: 1.25;
	}

	.scenario-card__body {
		display: grid;
		align-items: center;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 10px;
		min-height: 58px;
		padding: 9px 10px 9px 12px;
	}

	.scenario-card h2 {
		margin-bottom: 3px;
		color: #111827;
		font-size: 0.92rem;
		line-height: 1.15;
	}

	.path {
		margin-bottom: 0;
		color: #526173;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
		font-size: 0.7rem;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}

	.scenario-card__actions {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.scenario-action {
		width: 30px;
		height: 30px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid #cbd5e1;
		border-radius: 5px;
		background: #ffffff;
		color: #314156;
	}

	.scenario-action svg {
		width: 15px;
		height: 15px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.8;
	}

	.pin-button[aria-pressed="true"] {
		border-color: #6eaa9d;
		background: #e7f5f1;
		color: #0f5f56;
	}

	.delete-scenario {
		border-color: #e4b8c0;
		background: #fff8fa;
		color: #a11d33;
	}

	.open-render {
		border-color: #101b2d;
		background: #101b2d;
		color: #ffffff;
	}
`

const Preview = ({ scenario }: { scenario: (typeof scenarios)[number] }) => (
	<div className="preview-stage">
		<div className={`preview-panel${scenario.type === 'result' ? ' preview-panel--accent' : ''}`}>
			<div className="preview-head">
				<div className="preview-icon">{scenario.type === 'result' ? 'OK' : 'P'}</div>
				<div>
					<p className="preview-title">
						{scenario.type === 'result' ? 'RFP draft created' : 'Generating RFP draft'}
					</p>
					<p className="preview-subtitle">{scenario.state}</p>
				</div>
			</div>
			{scenario.type !== 'result' ? (
				<>
					<div className="progress-track">
						<div className="progress-value" style={{ width: `${scenario.progress}%` }} />
					</div>
					{scenario.type !== 'loading' ? (
						<div className="step-list">
							<div>Scope</div>
							<div>Draft</div>
							<div className="step-muted">Review</div>
							<div className="step-muted">Save</div>
						</div>
					) : null}
				</>
			) : (
				<div className="result-body">
					<p className="result-kicker">RFP draft created</p>
					<p className="result-title">Series B financing - outside counsel for lead investor negotiation</p>
				</div>
			)}
		</div>
	</div>
)

const GalleryWorkbench = () => (
	<div className="gallery-fixture">
		<style>{styles}</style>
		<main className="app-shell">
			<header className="gallery-header">
				<div className="title-lockup">
					<div className="brand-mark" aria-hidden="true">
						CS
					</div>
					<div>
						<p className="eyebrow">Component Shot</p>
						<h1>Scenario Gallery</h1>
						<p className="workspace-path">component-shot/scenarios</p>
					</div>
				</div>
				<div className="summary" aria-label="Gallery controls">
					<label className="search-control">
						<span>Search</span>
						<input defaultValue="" type="search" />
					</label>
					<label className="layout-control">
						<span>Columns</span>
						<select aria-label="Gallery columns" defaultValue="auto">
							<option value="auto">Auto</option>
							<option value="2">2</option>
							<option value="3">3</option>
							<option value="4">4</option>
						</select>
					</label>
					<span className="summary-count">6 scenarios</span>
					<button className="danger-button" type="button">
						Clear all
					</button>
					<a href="/api/scenarios">JSON</a>
				</div>
			</header>
			<section className="scenario-grid" aria-label="Scenarios">
				{scenarios.map((scenario) => (
					<article className="scenario-card" data-pinned={String(scenario.pinned)} key={scenario.name}>
						<div className="render-frame">
							<Preview scenario={scenario} />
						</div>
						<div className="scenario-card__body">
							<div>
								<h2>{scenario.name}</h2>
								<p className="path">{scenario.path}</p>
							</div>
							<div className="scenario-card__actions" aria-label="Scenario actions">
								<button
									aria-label={scenario.pinned ? 'Unpin scenario' : 'Pin scenario'}
									aria-pressed={scenario.pinned}
									className="scenario-action pin-button"
									type="button"
								>
									<PinIcon />
								</button>
								<button aria-label="Delete scenario" className="scenario-action delete-scenario" type="button">
									<TrashIcon />
								</button>
								<a aria-label="Open scenario" className="scenario-action open-render" href="/scenario/example/">
									<OpenIcon />
								</a>
							</div>
						</div>
					</article>
				))}
			</section>
		</main>
	</div>
)

export default {
	render: () => <GalleryWorkbench />,
	rootStyle: {
		display: 'block',
		width: 1720,
	},
}
