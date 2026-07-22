import { createRoot } from 'react-dom/client'
import { ComponentShotGalleryWorkbench } from './gallery-app.js'
import type { ComponentShotGalleryPageModel } from './gallery-types.js'

declare global {
	interface Window {
		__COMPONENT_SHOT_GALLERY_MODEL__?: ComponentShotGalleryPageModel
	}
}

const root = document.getElementById('root')
const model = window.__COMPONENT_SHOT_GALLERY_MODEL__

if (!root || !model) {
	throw new Error('Component Shot gallery bootstrap data is missing')
}

createRoot(root).render(<ComponentShotGalleryWorkbench model={model} />)
