import {
	ComponentShotGalleryWorkbench,
	createStaticComponentShotGalleryServices,
} from '../../../src/gallery-app'
import {
	galleryWorkbenchImages,
	galleryWorkbenchModel,
	galleryWorkbenchScenarios,
} from '../gallery-workbench'

const history = [
	{ filename: 'latest.png', updatedAt: '2026-07-12T09:42:00.000Z', url: galleryWorkbenchImages.latest },
	{ filename: 'iteration-06.png', updatedAt: '2026-07-12T09:37:00.000Z', url: galleryWorkbenchImages.historyB },
	{ filename: 'iteration-05.png', updatedAt: '2026-07-12T09:31:00.000Z', url: galleryWorkbenchImages.historyA },
	{ filename: 'iteration-04.png', updatedAt: '2026-07-12T09:20:00.000Z', url: galleryWorkbenchImages.latest },
	{ filename: 'iteration-03.png', updatedAt: '2026-07-12T09:12:00.000Z', url: galleryWorkbenchImages.historyB },
	{ filename: 'iteration-02.png', updatedAt: '2026-07-12T09:04:00.000Z', url: galleryWorkbenchImages.historyA },
]

const services = createStaticComponentShotGalleryServices({
	getHistory: async () => history,
	listScenarios: async () => galleryWorkbenchScenarios,
})

const waitForHistory = async () => {
	const deadline = Date.now() + 5_000
	while (document.querySelectorAll('.shot').length < history.length) {
		if (Date.now() > deadline) throw new Error('Gallery history did not become ready')
		await new Promise((resolve) => window.setTimeout(resolve, 16))
	}
	await Promise.all(
		[...document.querySelectorAll<HTMLImageElement>('.shot img')].map((image) =>
			image.complete ? image.decode().catch(() => undefined) : image.decode(),
		),
	)
	await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
	await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

export default {
	beforeScreenshot: waitForHistory,
	capture: { fullPage: true },
	description: 'Saved captures for a selected scenario in the production gallery workbench.',
	id: 'gallery-workbench-history',
	render: () => (
		<ComponentShotGalleryWorkbench
			initialSelectedRouteId="product-card"
			initialView="history"
			model={galleryWorkbenchModel}
			persistState={false}
			services={services}
		/>
	),
	rootStyle: { height: '100vh', width: '100vw' },
	tags: ['gallery', 'workbench', 'history'],
	title: 'Gallery workbench history',
	viewport: { height: 900, width: 1600 },
}
