import type { Env as AppEnv } from './env'

declare global {
  namespace Cloudflare {
    // Gives `env` from 'cloudflare:workers' the same shape the Worker sees at
    // runtime, so a binding added to Env without a matching test binding in
    // vitest.config.ts is a type error rather than an undefined at runtime.
    // The alias matters: `interface Env extends Env` resolves to itself.
    //
    // An empty extending interface is the point here, not an oversight:
    // Cloudflare.Env is declared as an interface by the plugin's types, so
    // declaration merging is the only way to fill it in. A type alias cannot
    // merge into it.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends AppEnv {}
  }
}
