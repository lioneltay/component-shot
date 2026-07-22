import productCardCapture from '../fixtures/gallery-product-card.png'
import {
	ComponentShotGalleryWorkbench,
	createStaticComponentShotGalleryServices,
} from '../../src/gallery-app'
import type { ComponentShotGalleryScenarioView } from '../../src/gallery-types'

const scenario = (
	id: string,
	name: string,
	relativePath: string,
	historyCount: number,
	latestUrl?: string,
): ComponentShotGalleryScenarioView => ({
	artifactKey: id,
	historyCount,
	id,
	latestUrl,
	name,
	previewEndpoint: `/api/scenarios/${id}/preview`,
	relativePath,
	routeId: id,
})

export const galleryWorkbenchScenarios = [
	scenario(
		'product-card',
		'product-card',
		'component-shot/scenarios/product-card.tsx',
		6,
		productCardCapture,
	),
	scenario(
		'checkout-payment-failed',
		'payment-failed',
		'component-shot/scenarios/checkout/payment-failed.tsx',
		3,
		productCardCapture,
	),
	scenario(
		'dashboard-overview',
		'dashboard-overview',
		'component-shot/scenarios/dashboard/overview.tsx',
		2,
		productCardCapture,
	),
	scenario(
		'account-permission-denied',
		'permission-denied',
		'component-shot/scenarios/account/permission-denied.tsx',
		0,
	),
	scenario(
		'checkout-loading',
		'checkout-loading',
		'component-shot/scenarios/checkout/loading.tsx',
		0,
	),
	scenario(
		'dashboard-empty',
		'empty-dashboard',
		'component-shot/scenarios/dashboard/empty.tsx',
		0,
	),
	scenario(
		'invoice-long-content',
		'long-invoice',
		'component-shot/scenarios/invoice/long-content.tsx',
		0,
	),
	scenario(
		'navigation-mobile',
		'mobile-navigation',
		'component-shot/scenarios/navigation/mobile.tsx',
		0,
	),
]

export const galleryWorkbenchImages = {
	historyA: productCardCapture,
	historyB: productCardCapture,
	latest: productCardCapture,
}

export const galleryWorkbenchModel = {
	editable: true,
	scenarioDirLabel: 'component-shot/scenarios',
	scenarios: galleryWorkbenchScenarios,
	viewportLimits: {
		height: { max: 4096, min: 100 },
		width: { max: 4096, min: 100 },
	},
}

const fixtureStates: Record<string, { body: string; eyebrow: string; title: string }> = {
	'account-permission-denied': {
		body: 'Your account does not have access to billing settings.',
		eyebrow: 'Access',
		title: 'Permission required',
	},
	'checkout-loading': {
		body: 'Confirming inventory and delivery options.',
		eyebrow: 'Checkout',
		title: 'Preparing your order',
	},
	'checkout-payment-failed': {
		body: 'The card was declined. Choose another payment method.',
		eyebrow: 'Payment',
		title: 'Payment unsuccessful',
	},
	'dashboard-empty': {
		body: 'There is no activity in this workspace yet.',
		eyebrow: 'Dashboard',
		title: 'Nothing to review',
	},
	'dashboard-overview': {
		body: '12 active projects with three reviews due today.',
		eyebrow: 'Workspace',
		title: 'Project overview',
	},
	'invoice-long-content': {
		body: 'Professional services, implementation support, onboarding, and regional tax adjustments.',
		eyebrow: 'Invoice',
		title: 'INV-2026-00482',
	},
	'navigation-mobile': {
		body: 'Home, projects, activity, and account settings.',
		eyebrow: 'Navigation',
		title: 'Mobile menu',
	},
	'product-card': {
		body: 'Reusable capture defaults, tuned for design review and regression checks.',
		eyebrow: 'Popular',
		title: 'Shot Runner',
	},
}

export const createGalleryWorkbenchPreviewUrl = (
	scenario: ComponentShotGalleryScenarioView,
) => {
	const state = fixtureStates[scenario.id] ?? {
		body: 'Deterministic component state ready for review.',
		eyebrow: 'Scenario',
		title: scenario.name,
	}
	const viewport = scenario.id === 'navigation-mobile'
		? { height: 844, width: 390 }
		: { height: 560, width: 720 }
	const metadata = JSON.stringify({
		tags: ['gallery-fixture', scenario.id],
		title: state.title,
		viewport,
	})
	const html = `<!doctype html>
<html><head><style>
*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;place-items:center;padding:24px;background:#f4f7fb;color:#152033;font-family:system-ui,sans-serif}
.panel{width:min(380px,100%);padding:26px;border:1px solid #bed0ed;border-radius:8px;background:#fff;box-shadow:0 14px 36px rgba(15,23,42,.08)}
.eyebrow{display:inline-block;margin:0 0 16px;padding:4px 8px;border-radius:12px;background:#f7cf48;font-size:12px;font-weight:800;text-transform:uppercase}
h1{margin:0 0 10px;font-size:24px;letter-spacing:0}p{margin:0;color:#526173;font-size:15px;line-height:1.55}.bar{height:8px;margin-top:24px;border-radius:4px;background:#2563eb}
</style></head><body><article class="panel" data-component-shot-root><span class="eyebrow">${state.eyebrow}</span><h1>${state.title}</h1><p>${state.body}</p><div class="bar"></div></article><script>
const report=(type)=>{const rect=document.querySelector('[data-component-shot-root]').getBoundingClientRect();parent.postMessage({type:'component-shot:'+type,metadata:type==='ready'?${metadata}:undefined,bounds:{height:rect.height,width:rect.width,x:rect.x,y:rect.y},frameViewport:{height:innerHeight,width:innerWidth}},'*')};
let frame;const schedule=()=>{if(frame!==undefined)return;frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{frame=undefined;report('layout')})})};report('ready');addEventListener('resize',schedule);addEventListener('message',(event)=>{if(event.data?.type==='component-shot:request-layout')report('layout')});
</script></body></html>`
	return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export const galleryWorkbenchServices = createStaticComponentShotGalleryServices({
	getPreview: async (scenario) => ({ url: createGalleryWorkbenchPreviewUrl(scenario) }),
	listScenarios: async () => galleryWorkbenchScenarios,
})

export default {
	beforeScreenshot: async () => {
		const deadline = Date.now() + 10_000
		const previews = document.querySelectorAll<HTMLElement>('[data-overview-preview-state]')
		for (const preview of previews) {
			preview.scrollIntoView({ block: 'nearest' })
			while (preview.dataset.overviewPreviewState !== 'ready') {
				if (Date.now() > deadline) throw new Error('Gallery overview previews did not become ready')
				await new Promise((resolve) => window.setTimeout(resolve, 16))
			}
		}
		document.querySelector<HTMLElement>('.overview-scroll')?.scrollTo({ top: 0 })
		window.scrollTo({ top: 0 })
		await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)))
	},
	capture: { fullPage: true },
	description: 'The production gallery workbench rendered with deterministic scenario data.',
	id: 'gallery-workbench',
	render: () => (
		<ComponentShotGalleryWorkbench
			initialSelectedRouteId="product-card"
			initialView="overview"
			model={galleryWorkbenchModel}
			persistState={false}
			services={galleryWorkbenchServices}
		/>
	),
	rootStyle: {
		height: '100vh',
		width: '100vw',
	},
	tags: ['gallery', 'workbench', 'overview'],
	title: 'Gallery workbench overview',
	viewport: { height: 900, width: 1600 },
}
