import type { ComponentShotScenarioObject } from '@lioneltay/component-shot'
import { ProductCard } from '../../src/components/ProductCard'
import type { DemoShotProviderOptions } from '../setup'

const scenario: ComponentShotScenarioObject<DemoShotProviderOptions> = {
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
}

export default scenario
