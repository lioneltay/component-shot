import type { CSSProperties, ReactNode } from 'react'
import { createComponentShot } from '@lioneltay/component-shot/react'
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

export const componentShot = createComponentShot<DemoShotProviderOptions>()
export const scenario = componentShot.scenario

export default componentShot.setup({
  Provider,
  rootStyle: {
    display: 'inline-block',
  },
})
