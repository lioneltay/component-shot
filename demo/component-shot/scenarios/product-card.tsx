import { ProductCard } from '../../src/components/ProductCard'
import { scenario } from '../setup'

export default scenario({
  title: 'Featured product card',
  description: 'Default purchasable product with a promotional badge.',
  tags: ['card', 'commerce', 'default'],
  viewport: { width: 720, height: 560 },
  providerOptions: {
    accent: '#2563eb',
    surface: '#f8fbff',
  },
  render: () => (
    <ProductCard
      badge="Popular"
      ctaLabel="Add kit"
      description="Reusable capture defaults, tuned for design review and regression checks."
      featured
      name="Shot Runner"
      price="$49"
    />
  ),
  rootStyle: {
    display: 'block',
    width: 380,
  },
})
