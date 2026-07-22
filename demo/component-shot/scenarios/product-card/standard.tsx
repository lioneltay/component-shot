import { ProductCard } from '../../../src/components/ProductCard'
import { scenario } from '../../setup'

export default scenario({
  title: 'Standard product card',
  tags: ['card', 'commerce'],
  viewport: { width: 720, height: 560 },
  render: () => (
    <ProductCard
      ctaLabel="Add to cart"
      description="A practical starter kit for small product teams."
      name="UI Starter"
      price="$29"
    />
  ),
  rootStyle: { display: 'block', width: 380 },
})
