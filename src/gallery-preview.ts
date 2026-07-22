import type { ComponentShotGalleryPageModel } from './gallery-types.js'
import type { ComponentShotViewport } from './runtime/types.js'

export const addPreviewCacheBuster = (value: string) => {
	const url = new URL(value, window.location.href)
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return value
	url.searchParams.set('gallery', String(Date.now()))
	return url.href
}

export const clampViewport = (
	viewport: ComponentShotViewport,
	limits: ComponentShotGalleryPageModel['viewportLimits'],
): ComponentShotViewport => ({
	height: Math.max(limits.height.min, Math.min(limits.height.max, Math.round(viewport.height))),
	width: Math.max(limits.width.min, Math.min(limits.width.max, Math.round(viewport.width))),
})
