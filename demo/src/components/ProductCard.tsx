export type ProductCardProps = {
  badge?: string
  ctaLabel: string
  description: string
  featured?: boolean
  name: string
  price: string
}

export function ProductCard({
  badge,
  ctaLabel,
  description,
  featured = false,
  name,
  price,
}: ProductCardProps) {
  return (
    <article className={featured ? 'product-card product-card--featured' : 'product-card'}>
      <div className="product-card__header">
        <div>
          {badge ? <span className="product-card__badge">{badge}</span> : null}
          <h2>{name}</h2>
        </div>
        <p className="product-card__price">{price}</p>
      </div>
      <p className="product-card__description">{description}</p>
      <button className="product-card__button" type="button">
        {ctaLabel}
      </button>
    </article>
  )
}
