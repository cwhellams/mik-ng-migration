import { Hono } from 'hono'

import { runWithContext } from './context'
import type { Env } from './env'
import { notFoundProblemHandler, problemErrorHandler } from './problem'
import { securityHeaders } from './securityHeaders'
import { strangler } from './proxy'
import { time } from './routes/time/api'

const app = new Hono<{ Bindings: Env }>()

// Order matters. The strangler runs first so an unported path never touches the
// rest of the stack, and second so that everything below it can assume this
// Worker owns the request.
app.use('*', strangler)
app.use('*', securityHeaders)

app.onError(problemErrorHandler)
// Reachable only for a path inside a ported prefix that no route matches — an
// unported path was proxied before ever getting here. That is deliberate: a gap
// inside a domain claimed as ported is a porting bug, and answering it from the
// legacy backend would hide it behind a working response.
app.notFound(notFoundProblemHandler)

app.route('/api/v1/time', time)

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    runWithContext({ env, ctx }, () => app.fetch(request, env, ctx)),
} satisfies ExportedHandler<Env>
