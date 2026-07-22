import { ProductCard } from '../../../src/components/ProductCard'
import { scenario } from '../../setup'

export default scenario({
  title: 'Product card with long content',
  description: 'Stress state for wrapping and constrained layouts.',
  tags: ['card', 'edge-case', 'content'],
  viewport: { width: 720, height: 640 },
  providerOptions: { accent: '#0f766e', surface: '#f4f7f6' },
  render: () => (
    <ProductCard
      badge="Limited availability"
      ctaLabel="Request access for this workspace"
      description="A deliberately long description that verifies wrapping, vertical rhythm, and action sizing when product copy cannot be shortened."
      name="Enterprise collaboration and governance toolkit"
      price="$1,249"
    />
  ),
  rootStyle: { display: 'block', width: 380 },
})
