import type { CSSProperties } from 'react'

interface IconStubProps {
  icon: unknown
  className?: string
  style?: CSSProperties
}

/**
 * Stand-in for `@iconify/react`'s `<Icon />`, installed globally in
 * `src/test/setup.ts`. Renders nothing visible but keeps the requested icon
 * name assertable:
 *
 * ```ts
 * expect(screen.getByTestId('icon')).toHaveAttribute('data-icon', 'mdi:lock-alert')
 * ```
 */
export const Icon = ({ icon, className, style }: IconStubProps) => (
  <span
    data-testid='icon'
    data-icon={typeof icon === 'string' ? icon : undefined}
    aria-hidden='true'
    className={className}
    style={style}
  />
)

export const InlineIcon = Icon
