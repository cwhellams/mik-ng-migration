#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SIMPLBOOKS_SPEC_FILE="$REPO_ROOT/simplbooks/simplbooks-api/api.yaml"
PRISM_HOST="127.0.0.1"
PRISM_PORT="4011"
PROXY_PORT="4010"
RATE_LIMIT_MS="1000"

if [[ ! -f "$SIMPLBOOKS_SPEC_FILE" ]]; then
	echo "Simplbooks OpenAPI file not found: $SIMPLBOOKS_SPEC_FILE"
	echo "Fetch it first from https://app.simplbooks.com/api-documentation/oas/api.yaml"
	exit 1
fi

# Resolve company id from env or backend .env for path rewriting.
SIMPLBOOKS_COMPANY_ID="${SIMPLBOOKS_COMPANY_ID:-}"
if [[ -z "$SIMPLBOOKS_COMPANY_ID" && -f "$REPO_ROOT/apps/backend/.env" ]]; then
	SIMPLBOOKS_COMPANY_ID="$(grep -E '^SIMPLBOOKS_COMPANY_ID=' "$REPO_ROOT/apps/backend/.env" | tail -n 1 | cut -d'=' -f2-)"
fi

if [[ -z "$SIMPLBOOKS_COMPANY_ID" ]]; then
	echo "SIMPLBOOKS_COMPANY_ID was not found in environment or apps/backend/.env"
	exit 1
fi

echo "Starting Prism on ${PRISM_HOST}:${PRISM_PORT}"
pnpm --dir "$REPO_ROOT" exec prism mock \
	--host "$PRISM_HOST" \
	--port "$PRISM_PORT" \
	"$SIMPLBOOKS_SPEC_FILE" &
PRISM_PID=$!

echo "Starting path rewrite proxy on ${PRISM_HOST}:${PROXY_PORT} for /${SIMPLBOOKS_COMPANY_ID}/api/*"
SIMPLBOOKS_COMPANY_ID="$SIMPLBOOKS_COMPANY_ID" PRISM_HOST="$PRISM_HOST" PRISM_PORT="$PRISM_PORT" PROXY_PORT="$PROXY_PORT" RATE_LIMIT_MS="$RATE_LIMIT_MS" node <<'NODE' &
const http = require('node:http')

const companyId = process.env.SIMPLBOOKS_COMPANY_ID
const prismHost = process.env.PRISM_HOST || '127.0.0.1'
const prismPort = Number(process.env.PRISM_PORT || '4011')
const proxyPort = Number(process.env.PROXY_PORT || '4010')
const rateLimitMs = Number(process.env.RATE_LIMIT_MS || '1000')
const prefix = `/${companyId}/api`
let lastAcceptedRequestAt = 0

const server = http.createServer((req, res) => {
	const now = Date.now()
	const elapsed = now - lastAcceptedRequestAt
	if (elapsed < rateLimitMs) {
		const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitMs - elapsed) / 1000))
		res.writeHead(429, {
			'content-type': 'application/json',
			'retry-after': String(retryAfterSeconds),
		})
		res.end(
			JSON.stringify({
				status: 429,
				errors: ['Too many requests. Mock rate limit is 1 request per second.'],
			}),
		)
		return
	}

	lastAcceptedRequestAt = now

	const incomingUrl = req.url || '/'
	const rewrittenUrl = incomingUrl.startsWith(prefix)
		? incomingUrl.slice(prefix.length) || '/'
		: incomingUrl

	const proxyReq = http.request(
		{
			host: prismHost,
			port: prismPort,
			path: rewrittenUrl,
			method: req.method,
			headers: req.headers,
		},
		proxyRes => {
			res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
			proxyRes.pipe(res)
		},
	)

	proxyReq.on('error', err => {
		res.writeHead(502, { 'content-type': 'application/json' })
		res.end(JSON.stringify({ error: 'proxy_error', message: err.message }))
	})

	req.pipe(proxyReq)
})

server.listen(proxyPort, '127.0.0.1', () => {
	console.log(`Simplbooks Prism proxy listening on http://127.0.0.1:${proxyPort}`)
})
NODE
PROXY_PID=$!

cleanup() {
	kill "$PRISM_PID" "$PROXY_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM
wait
