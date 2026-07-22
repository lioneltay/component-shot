export const componentShotGalleryStyles = String.raw`
	:root {
		--cs-bg: #e8edf2;
		--cs-canvas: #dde4ea;
		--cs-panel: #ffffff;
		--cs-panel-muted: #f6f8fa;
		--cs-border: #c7d0dc;
		--cs-border-strong: #aab6c5;
		--cs-text: #111827;
		--cs-muted: #526173;
		--cs-subtle: #718096;
		--cs-accent: #0f766e;
		--cs-accent-strong: #0b625b;
		--cs-focus: #2563eb;
		--cs-selection: #e8f0ff;
		--cs-selection-text: #173f8a;
		--cs-danger: #9f1239;
		color: var(--cs-text);
		background: var(--cs-bg);
		font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		font-synthesis: none;
	}

	* { box-sizing: border-box; }
	[hidden] { display: none !important; }
	html, body, #root { width: 100%; min-width: 320px; min-height: 100%; margin: 0; }
	body { overflow: hidden; padding: 0 !important; }
	button, input, select { font: inherit; }
	button, select { cursor: pointer; }
	button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {
		outline: 3px solid rgb(37 99 235 / 24%);
		outline-offset: 1px;
	}

	.component-shot-app {
		position: relative;
		height: 100vh;
		height: 100dvh;
		color: var(--cs-text);
		background: var(--cs-bg);
	}
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; padding: 0; margin: -1px; border: 0; clip: rect(0, 0, 0, 0); white-space: nowrap; }

	.detail-tabs, .inspector-tabs, .overview-filter {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--cs-border);
		border-radius: 6px;
		background: #fff;
	}
	.detail-tab, .inspector-tab, .filter-tab {
		min-height: 34px;
		padding: 0 13px;
		border: 0;
		border-right: 1px solid var(--cs-border);
		background: transparent;
		color: var(--cs-muted);
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0;
	}
	.detail-tab:last-child, .inspector-tab:last-child, .filter-tab:last-child { border-right: 0; }
	.detail-tab[aria-selected='true'], .inspector-tab[aria-selected='true'], .filter-tab[aria-pressed='true'] {
		background: var(--cs-selection);
		color: var(--cs-selection-text);
	}

	.operation-status {
		position: fixed;
		top: 8px;
		right: 10px;
		z-index: 30;
		max-width: min(320px, calc(100vw - 20px));
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 9px;
		border: 1px solid var(--cs-border-strong);
		border-radius: 5px;
		background: #fff;
		box-shadow: 0 8px 24px rgb(15 23 42 / 18%);
		color: var(--cs-muted);
		font-size: 0.74rem;
		font-weight: 800;
	}
	.operation-status [data-status-text] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; }
	.status-dot[data-state='busy'] { background: #d97706; }
	.status-dot[data-state='error'] { background: #dc2626; }

	.workspace {
		--scenario-panel-width: 264px;
		--inspector-panel-width: 304px;
		min-width: 0;
		min-height: 0;
		height: 100%;
		display: grid;
		grid-template-columns: var(--scenario-panel-width) minmax(360px, 1fr) var(--inspector-panel-width);
	}
	.workspace[data-scenarios-collapsed='true'] { --scenario-panel-width: 44px; }
	.workspace[data-inspector-collapsed='true'] { --inspector-panel-width: 44px; }
	.workspace[data-view='overview'] { grid-template-columns: var(--scenario-panel-width) minmax(0, 1fr); }
	.workspace[data-view='overview'] .inspector { display: none; }

	.scenario-browser, .inspector {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--cs-panel);
	}
	.scenario-browser { border-right: 1px solid var(--cs-border); }
	.inspector { border-left: 1px solid var(--cs-border); }
	.panel-heading {
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 11px;
		border-bottom: 1px solid var(--cs-border);
	}
	.panel-heading h2 { margin: 0; font-size: 0.82rem; letter-spacing: 0; }
	.panel-heading-actions { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
	.panel-heading-actions .count { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.count { color: var(--cs-subtle); font-size: 0.7rem; font-weight: 800; }
	.panel-collapse {
		width: 28px;
		height: 28px;
		flex: 0 0 28px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid var(--cs-border);
		border-radius: 4px;
		background: #fff;
		color: var(--cs-muted);
	}
	.panel-collapse:hover { border-color: var(--cs-border-strong); background: var(--cs-panel-muted); color: var(--cs-text); }
	.panel-collapse-icon { width: 8px; height: 8px; border-top: 2px solid currentColor; border-right: 2px solid currentColor; }
	.panel-collapse-icon[data-direction='left'] { transform: rotate(-135deg); }
	.panel-collapse-icon[data-direction='right'] { transform: rotate(45deg); }
	.collapsed-panel-label { display: none; }
	.scenario-overview-row {
		width: calc(100% - 12px);
		height: 36px;
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 6px;
		padding: 0 9px;
		border: 1px solid transparent;
		border-radius: 5px;
		background: transparent;
		color: var(--cs-text);
		font-size: 0.76rem;
		font-weight: 800;
		text-align: left;
	}
	.scenario-overview-row:hover { background: var(--cs-panel-muted); }
	.scenario-overview-row[aria-current='true'] { border-color: #9db8ec; background: #edf3ff; color: var(--cs-selection-text); }
	.overview-nav-mark { width: 5px; height: 5px; flex: 0 0 5px; border-radius: 1px; background: currentColor; box-shadow: 7px 0 currentColor, 0 7px currentColor, 7px 7px currentColor; transform: translateY(-3px); }

	.search { padding: 10px; border-bottom: 1px solid var(--cs-border); }
	.search input {
		width: 100%;
		height: 34px;
		padding: 0 10px;
		border: 1px solid var(--cs-border);
		border-radius: 5px;
		background: #fff;
		color: var(--cs-text);
		font-size: 0.78rem;
	}

	.scenario-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 6px; }
	.scenario-row {
		position: relative;
		width: 100%;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 28px;
		gap: 2px;
		align-items: center;
		margin: 0 0 2px;
		padding: 2px;
		border: 1px solid transparent;
		border-radius: 5px;
		background: transparent;
		color: var(--cs-text);
		text-align: left;
	}
	.scenario-row:hover { background: var(--cs-panel-muted); }
	.scenario-row[aria-current='true'] { border-color: #9db8ec; background: #edf3ff; }
	.scenario-row-main { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 4px 6px 6px; border: 0; background: transparent; color: inherit; text-align: left; }
	.scenario-row-copy { min-width: 0; }
	.scenario-row strong { display: block; overflow: hidden; font-size: 0.78rem; text-overflow: ellipsis; white-space: nowrap; }
	.scenario-row small { display: block; margin-top: 3px; overflow: hidden; color: var(--cs-subtle); font: 0.64rem/1.25 ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }
	.scenario-actions { position: relative; }
	.scenario-actions-trigger { width: 28px; height: 28px; display: grid; place-items: center; padding: 0 0 7px; border: 0; border-radius: 4px; background: transparent; color: var(--cs-subtle); font-size: 0.9rem; font-weight: 900; letter-spacing: 1px; line-height: 1; }
	.scenario-actions-trigger:hover, .scenario-actions-trigger[aria-expanded='true'] { background: #e2e8f0; color: var(--cs-text); }
	.scenario-actions-menu { position: absolute; top: 31px; right: 0; z-index: 12; min-width: 150px; padding: 4px; border: 1px solid var(--cs-border-strong); border-radius: 5px; background: #fff; box-shadow: 0 10px 28px rgb(15 23 42 / 20%); }
	.scenario-actions-menu button { width: 100%; min-height: 32px; padding: 0 9px; border: 0; border-radius: 3px; background: transparent; font-size: 0.72rem; font-weight: 800; text-align: left; }
	.scenario-actions-menu button:hover { background: #fff1f2; }
	.scenario-actions-menu button:disabled { cursor: not-allowed; opacity: 0.45; }
	.scenario-action-danger { color: var(--cs-danger); }
	.history-badge { min-width: 24px; padding: 2px 6px; border-radius: 10px; background: #e2e8f0; color: #475569; font-size: 0.65rem; font-weight: 800; text-align: center; }
	.empty-list { padding: 22px 12px; color: var(--cs-muted); font-size: 0.78rem; text-align: center; }

	.stage { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--cs-bg); }
	.canvas-toolbar {
		min-height: 48px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-bottom: 1px solid var(--cs-border);
		background: #f8fafc;
	}
	.toolbar-primary { min-width: 0; display: flex; align-items: center; gap: 8px; }
	.detail-tabs { flex: 0 0 auto; }
	.detail-tab { min-height: 32px; padding: 0 10px; font-size: 0.7rem; }
	.toolbar-controls, .toolbar-actions { min-width: 0; display: flex; align-items: center; gap: 6px; }
	.toolbar-controls { overflow-x: auto; }
	.toolbar-actions { justify-content: flex-end; }
	.control { height: 32px; display: inline-flex; align-items: center; border: 1px solid var(--cs-border); border-radius: 5px; background: #fff; }
	.control span { padding: 0 7px; color: var(--cs-muted); font-size: 0.68rem; font-weight: 800; }
	.control input, .control select { height: 30px; border: 0; border-left: 1px solid var(--cs-border); background: transparent; color: var(--cs-text); font-size: 0.72rem; }
	.control input { width: 62px; padding: 0 6px; }
	.control select { min-width: 82px; padding: 0 24px 0 7px; }
	.command {
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 10px;
		border: 1px solid var(--cs-border);
		border-radius: 5px;
		background: #fff;
		color: var(--cs-text);
		font-size: 0.72rem;
		font-weight: 800;
		line-height: 1;
		text-decoration: none;
		white-space: nowrap;
	}
	.command.primary { border-color: var(--cs-accent-strong); background: var(--cs-accent); color: #fff; }
	.command.danger { border-color: #e7b6c0; color: var(--cs-danger); }
	.command:disabled { cursor: not-allowed; opacity: 0.55; }
	.stage-view { flex: 1 1 auto; min-height: 0; }
	.canvas-area {
		position: relative;
		height: 100%;
		overflow: auto;
		display: grid;
		place-items: center;
		padding: 24px;
		background: var(--cs-canvas);
	}
	.canvas-area[data-background='white'] { background: #fff; }
	.canvas-area[data-background='dark'] { background: #303844; }
	.viewport-scaler { position: relative; flex: 0 0 auto; }
	.viewport-shell {
		position: absolute;
		left: 0;
		top: 0;
		overflow: hidden;
		transform-origin: top left;
		border: 1px solid #94a3b8;
		background: #fff;
		box-shadow: 0 12px 30px rgb(15 23 42 / 14%);
	}
	.viewport-shell iframe { width: 100%; height: 100%; display: block; border: 0; background: #fff; }
	.viewport-resize-handle {
		position: absolute;
		z-index: 5;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid #94a3b8;
		border-radius: 4px;
		background: #fff;
		box-shadow: 0 2px 7px rgb(15 23 42 / 16%);
		color: #526173;
		touch-action: none;
	}
	.viewport-resize-handle:hover, .viewport-resize-handle[data-active='true'] { border-color: var(--cs-focus); background: #edf3ff; color: var(--cs-focus); }
	.viewport-resize-width { top: 50%; right: -19px; width: 14px; height: 44px; cursor: ew-resize; transform: translateY(-50%); }
	.viewport-resize-height { bottom: -19px; left: 50%; width: 44px; height: 14px; cursor: ns-resize; transform: translateX(-50%); }
	.viewport-resize-both { right: -19px; bottom: -19px; width: 18px; height: 18px; cursor: nwse-resize; }
	.viewport-resize-width::after { width: 4px; height: 20px; content: ''; border-right: 1px solid currentColor; border-left: 1px solid currentColor; }
	.viewport-resize-height::after { width: 20px; height: 4px; content: ''; border-top: 1px solid currentColor; border-bottom: 1px solid currentColor; }
	.viewport-resize-both::after { width: 7px; height: 7px; content: ''; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; }
	.render-state {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgb(255 255 255 / 94%);
		color: var(--cs-muted);
		font-size: 0.82rem;
		font-weight: 800;
		text-align: center;
	}

	.history-view { height: 100%; overflow: auto; padding: 14px; }
	.history-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; align-items: start; }
	.shot {
		width: 100%;
		max-width: 360px;
		display: grid;
		overflow: hidden;
		border: 1px solid var(--cs-border);
		border-radius: 6px;
		background: #fff;
		color: var(--cs-text);
		text-decoration: none;
	}
	.shot img { width: 100%; aspect-ratio: 16 / 10; object-fit: contain; border-bottom: 1px solid var(--cs-border); background: #f8fafc; }
	.shot span { padding: 9px 10px; color: var(--cs-muted); font-size: 0.7rem; font-weight: 750; }

	.overview-view { height: 100%; min-height: 0; display: flex; flex-direction: column; }
	.overview-header {
		min-height: 58px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--cs-border);
		background: #f8fafc;
	}
	.overview-heading { min-width: 0; }
	.overview-heading strong { display: block; font-size: 0.82rem; }
	.overview-heading span { display: block; margin-top: 3px; color: var(--cs-muted); font-size: 0.68rem; }
	.overview-filter { flex: 0 0 auto; }
	.filter-tab { min-height: 30px; padding: 0 10px; font-size: 0.68rem; }
	.overview-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px; }
	.overview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; align-items: start; }
	.overview-item {
		position: relative;
		width: 100%;
		min-width: 0;
		display: grid;
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--cs-border);
		border-radius: 6px;
		background: #fff;
		color: var(--cs-text);
		text-align: left;
	}
	.overview-item:hover { border-color: #92a2b7; box-shadow: 0 3px 12px rgb(15 23 42 / 8%); }
	.overview-preview { position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden; border-bottom: 1px solid var(--cs-border); background: #f5f7f9; }
	.overview-preview-fallback { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: contain; background: #f8fafc; }
	.overview-preview-frame { position: absolute; z-index: 1; display: block; border: 0; opacity: 0; pointer-events: none; transform-origin: top left; }
	.overview-preview[data-overview-preview-state='ready'] .overview-preview-frame { opacity: 1; }
	.overview-preview[data-overview-preview-state='ready'] .overview-preview-fallback { opacity: 0; }
	.overview-preview-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--cs-subtle); font-size: 0.72rem; font-weight: 800; }
	.overview-preview-status { position: absolute; top: 8px; left: 8px; z-index: 2; padding: 3px 6px; border: 1px solid #b8c3d0; border-radius: 4px; background: rgb(255 255 255 / 92%); color: #526173; font-size: 0.6rem; font-weight: 900; line-height: 1; text-transform: uppercase; pointer-events: none; }
	.overview-preview-status[data-state='ready'] { border-color: #8bc3b9; background: #e7f5f1; color: #0f6259; }
	.overview-preview-status[data-state='building'] { border-color: #e7c77d; background: #fffbeb; color: #854d0e; }
	.overview-preview-status[data-state='error'] { border-color: #e7b6c0; background: #fff1f2; color: #9f1239; }
	.overview-meta { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px; }
	.overview-copy { min-width: 0; }
	.overview-copy strong { display: block; overflow: hidden; color: var(--cs-text); font-size: 0.78rem; text-overflow: ellipsis; white-space: nowrap; }
	.overview-copy span { display: block; margin-top: 3px; overflow: hidden; color: var(--cs-muted); font: 0.64rem/1.25 ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }
	.overview-count { min-width: 54px; padding: 3px 7px; border-radius: 10px; background: #e7edf3; color: #475569; font-size: 0.65rem; font-weight: 850; text-align: center; white-space: nowrap; }
	.overview-open { position: absolute; inset: 0; z-index: 3; padding: 0; border: 0; border-radius: 6px; background: transparent; }
	.overview-open:focus-visible { outline: 2px solid #2563eb; outline-offset: -3px; }
	.empty-state { height: 100%; min-height: 160px; display: grid; place-items: center; padding: 32px; color: var(--cs-muted); font-size: 0.82rem; text-align: center; }

	.inspector-tabs { margin: 8px 10px; }
	.inspector-panel { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px; }
	.detail-list { margin: 0; }
	.detail-row { padding: 9px 0; border-bottom: 1px solid #e2e8f0; }
	.detail-row dt { margin: 0 0 4px; color: var(--cs-subtle); font-size: 0.64rem; font-weight: 900; text-transform: uppercase; }
	.detail-row dd { margin: 0; overflow-wrap: anywhere; color: var(--cs-text); font: 0.73rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
	.detail-row.description dd { font-family: inherit; }
	.inspector-actions { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 12px; }
	.diagnostics { display: grid; gap: 7px; }
	.diagnostic { padding: 9px; border-left: 3px solid #64748b; background: #f8fafc; color: #334155; font-size: 0.72rem; line-height: 1.4; }
	.diagnostic[data-severity='error'] { border-color: #dc2626; background: #fff1f2; color: #881337; }
	.diagnostic[data-severity='warning'] { border-color: #d97706; background: #fffbeb; color: #854d0e; }
	.diagnostic strong { display: block; margin-bottom: 3px; font-size: 0.65rem; text-transform: uppercase; }

	dialog.export-dialog { width: min(520px, calc(100% - 28px)); padding: 0; border: 1px solid var(--cs-border-strong); border-radius: 7px; background: #fff; color: var(--cs-text); box-shadow: 0 22px 60px rgb(15 23 42 / 28%); }
	dialog.export-dialog::backdrop { background: rgb(15 23 42 / 38%); }
	.dialog-heading { padding: 14px 16px; border-bottom: 1px solid var(--cs-border); }
	.dialog-heading h2 { margin: 0; font-size: 0.95rem; }
	.dialog-body { padding: 16px; }
	.dialog-body label { display: block; margin-bottom: 6px; color: var(--cs-muted); font-size: 0.72rem; font-weight: 800; }
	.dialog-body input { width: 100%; height: 38px; padding: 0 10px; border: 1px solid var(--cs-border); border-radius: 5px; }
	.dialog-actions { display: flex; justify-content: flex-end; gap: 7px; padding: 12px 16px; border-top: 1px solid var(--cs-border); }
	.toast { position: fixed; right: 14px; bottom: 14px; z-index: 20; max-width: 420px; padding: 10px 12px; border: 1px solid var(--cs-border-strong); border-radius: 6px; background: #fff; box-shadow: 0 12px 30px rgb(15 23 42 / 20%); color: var(--cs-text); font-size: 0.76rem; font-weight: 750; }

	@media (min-width: 781px) {
		.scenario-browser[data-collapsed='true'] > :not(.panel-heading):not(.collapsed-panel-label):not(.scenario-overview-row),
		.inspector[data-collapsed='true'] > :not(.panel-heading):not(.collapsed-panel-label) { display: none !important; }
		.scenario-browser[data-collapsed='true'] .panel-heading,
		.inspector[data-collapsed='true'] .panel-heading { justify-content: center; padding: 8px 5px; }
		.scenario-browser[data-collapsed='true'] .panel-heading h2,
		.scenario-browser[data-collapsed='true'] .panel-heading .count,
		.inspector[data-collapsed='true'] .panel-heading h2,
		.inspector[data-collapsed='true'] .panel-heading .count { display: none; }
		.scenario-browser[data-collapsed='true'] .panel-heading-actions,
		.inspector[data-collapsed='true'] .panel-heading-actions { justify-content: center; }
		.scenario-browser[data-collapsed='true'] > .scenario-overview-row {
			width: 32px;
			height: 32px;
			flex: 0 0 32px;
			display: grid;
			place-items: center;
			margin: 8px 6px 0;
			padding: 0;
		}
		.scenario-browser[data-collapsed='true'] > .scenario-overview-row > span:last-child { display: none; }
		.scenario-browser[data-collapsed='true'] > .scenario-overview-row .overview-nav-mark { transform: translate(-3px, -3px); }
		.scenario-browser[data-collapsed='true'] > .collapsed-panel-label,
		.inspector[data-collapsed='true'] > .collapsed-panel-label {
			flex: 1 1 auto;
			display: flex;
			align-items: center;
			padding-top: 14px;
			color: var(--cs-subtle);
			font-size: 0.68rem;
			font-weight: 800;
			letter-spacing: 0;
			text-transform: uppercase;
			writing-mode: vertical-rl;
		}
	}

	@media (max-width: 1120px) {
		.workspace { --scenario-panel-width: 220px; --inspector-panel-width: 260px; }
		.overview-grid { grid-template-columns: repeat(auto-fit, minmax(228px, 1fr)); }
	}

	@media (max-width: 780px) {
		body { overflow: auto; }
		.component-shot-app { height: auto; min-height: 100dvh; display: block; }
		.workspace, .workspace[data-view='overview'] { height: auto; display: block; }
		.scenario-browser { height: 220px; border-right: 0; border-bottom: 1px solid var(--cs-border); }
		.stage { height: 72vh; min-height: 520px; }
		.workspace[data-view='overview'] .stage { height: auto; min-height: 620px; }
		.inspector { min-height: 320px; border-top: 1px solid var(--cs-border); border-left: 0; }
		.panel-collapse { display: none; }
		.canvas-toolbar { grid-template-columns: minmax(0, 1fr); }
		.toolbar-primary { flex-wrap: wrap; }
		.toolbar-controls { flex-wrap: wrap; overflow: visible; }
		.toolbar-actions { justify-content: flex-start; }
		.overview-header { align-items: flex-start; flex-direction: column; }
		.overview-scroll { min-height: 520px; }
		.overview-grid { grid-template-columns: 1fr; }
		.overview-item, .shot { max-width: none; }
	}
`
