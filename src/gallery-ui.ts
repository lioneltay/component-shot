import type { ComponentShotGalleryPageModel } from './gallery-types.js'

const escapeHtml = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const toInlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

export const createGalleryErrorHtml = ({ message, title }: { message: string; title: string }) => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${escapeHtml(title)}</title>
		<style>
			html,body{margin:0;min-height:100%;background:#fff;color:#172033;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
			main{padding:24px}h1{font-size:1rem;margin:0 0 12px;color:#9f1239}pre{margin:0;white-space:pre-wrap;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
		</style>
	</head>
	<body><main><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(message)}</pre></main></body>
</html>`

export const createGalleryHtml = (model: ComponentShotGalleryPageModel) => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Component Shot</title>
	</head>
	<body>
		<div id="root"></div>
		<script>window.__COMPONENT_SHOT_GALLERY_MODEL__=${toInlineJson(model)}</script>
		<script src="/assets/gallery-client.js"></script>
	</body>
</html>`
