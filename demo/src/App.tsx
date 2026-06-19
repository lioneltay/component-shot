import { ProductCard } from './components/ProductCard'

const items = [
  {
    badge: 'Starter',
    description: 'A compact kit for validating UI states before they land in the app.',
    name: 'Scenario Kit',
    price: '$29',
  },
  {
    badge: 'Popular',
    description: 'Reusable capture defaults, tuned for design review and regression checks.',
    featured: true,
    name: 'Shot Runner',
    price: '$49',
  },
]

export function App() {
  return (
    <main className="app-shell">
      <section className="toolbar" aria-label="Catalog filters">
        <div>
          <p className="eyebrow">Launch shelf</p>
          <h1>Interface test kits</h1>
        </div>
        <div className="segmented-control" aria-label="Billing period">
          <button className="is-active" type="button">
            Monthly
          </button>
          <button type="button">Annual</button>
        </div>
      </section>

      <section className="product-grid" aria-label="Products">
        {items.map((item) => (
          <ProductCard key={item.name} {...item} ctaLabel="Add kit" />
        ))}
      </section>
    </main>
  )
}
