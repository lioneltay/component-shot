import { ProductCard } from '../../../src/components/ProductCard'
import { scenario } from '../../setup'

export default scenario({
  title: 'Featured product card on mobile',
  tags: ['card', 'commerce', 'mobile'],
  viewport: { width: 390, height: 844 },
  providerOptions: { accent: '#2563eb', surface: '#f8fbff' },
  render: () => (
    <ProductCard
      badge="Popular"
      ctaLabel="Add kit"
      description="Reusable capture defaults for focused interface reviews."
      featured
      name="Shot Runner"
      price="$49"
    />
  ),
  rootStyle: { display: 'block', width: '100%' },
})
