import {
	ComponentShotGalleryWorkbench,
	createStaticComponentShotGalleryServices,
} from '../../../src/gallery-app'
import {
	createGalleryWorkbenchPreviewUrl,
	galleryWorkbenchModel,
	galleryWorkbenchScenarios,
} from '../gallery-workbench'

const services = createStaticComponentShotGalleryServices({
	getPreview: async (scenario) => ({ url: createGalleryWorkbenchPreviewUrl(scenario) }),
	listScenarios: async () => galleryWorkbenchScenarios,
})

const waitForLivePreview = async () => {
	const deadline = Date.now() + 5_000
	while (!document.querySelector<HTMLElement>('[data-render-state]')?.hidden) {
		if (Date.now() > deadline) throw new Error('Gallery live preview did not become ready')
		await new Promise((resolve) => window.setTimeout(resolve, 16))
	}
	await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
	await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

export default {
	beforeScreenshot: waitForLivePreview,
	capture: { fullPage: true },
	description: 'A selected React scenario in the production gallery canvas and inspector.',
	id: 'gallery-workbench-live',
	render: () => (
		<ComponentShotGalleryWorkbench
			initialSelectedRouteId="product-card"
			initialView="live"
			model={galleryWorkbenchModel}
			persistState={false}
			services={services}
		/>
	),
	rootStyle: { height: '100vh', width: '100vw' },
	tags: ['gallery', 'workbench', 'live'],
	title: 'Gallery workbench live',
	viewport: { height: 900, width: 1600 },
}
