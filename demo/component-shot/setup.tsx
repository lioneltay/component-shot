import type { CSSProperties, ReactNode } from 'react'
import type { ComponentShotAppSetup } from '@lioneltay/component-shot'
import '../src/styles.css'

export type DemoShotProviderOptions = {
  accent?: string
  surface?: string
}

const createProviderStyle = (options?: DemoShotProviderOptions): CSSProperties => ({
  '--accent': options?.accent ?? '#0f766e',
  background: options?.surface ?? '#eef2f6',
  padding: 24,
} as CSSProperties)

const Provider = ({
  children,
  options,
}: {
  children: ReactNode
  options?: DemoShotProviderOptions
}) => (
  <div className="shot-theme" style={createProviderStyle(options)}>
    {children}
  </div>
)

const setup: ComponentShotAppSetup<DemoShotProviderOptions> = {
  Provider,
  rootStyle: {
    display: 'inline-block',
  },
}

export default setup
