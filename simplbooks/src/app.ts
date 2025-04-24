import axios from 'axios'
import fs from 'fs-extra'
import path from 'path'
import YAML from 'yaml'

const BASE_URL = 'https://app.simplbooks.com/api-documentation/oas/'
const OUTPUT_DIR = './simplbooks-api'

// Extract just the file path part of a $ref
function extractRefPath(ref: string): string {
  // Remove fragment part, e.g. '#/definitions/xyz'
  return ref.split('#')[0]
}

// Resolve relative references by removing ../ and appending to BASE_URL
function resolveRefPath(refPath: string): string {
  if (refPath.startsWith('http')) return refPath

  // Remove only the leading ../ or ./ once
  return refPath.replace(/^(\.\.\/|\.\/)/, '')
}

// Download and save a file
async function downloadFile(relativePath: string) {
  const url = `${BASE_URL}${relativePath}`
  const outputPath = path.join(OUTPUT_DIR, relativePath)

  try {
    const response = await axios.get(url)
    await fs.ensureDir(path.dirname(outputPath))
    await fs.writeFile(outputPath, response.data, 'utf-8')
    console.log(`✅ Downloaded: ${relativePath}`)
    return response.data
  } catch (err) {
    if (err instanceof Error) {
      console.error(`❌ Failed to download: ${relativePath}`, err.message)
    } else {
      console.error(`❌ Failed to download: ${relativePath}`, err)
    }
  }
}

// Recursively find all $refs and download those files
async function processFile(relativePath: string, visited = new Set<string>()) {
  if (visited.has(relativePath)) return
  visited.add(relativePath)

  const rawData = await downloadFile(relativePath)
  if (!rawData) return

  const content = typeof rawData === 'string' ? YAML.parse(rawData) : rawData
  const refs = findRefs(content)

  for (const ref of refs) {
    const rawRefPath = extractRefPath(ref) // Strip any `#/` fragments
    if (!rawRefPath || rawRefPath.startsWith('#')) continue // Skip internal-only refs

    const resolvedRefPath = resolveRefPath(rawRefPath)
    await processFile(resolvedRefPath, visited)
  }
}

// Find all $ref strings in an object
function findRefs(obj: any): string[] {
  const refs: string[] = []
  const stack = [obj]

  while (stack.length) {
    const current = stack.pop()
    if (typeof current === 'object' && current !== null) {
      for (const key in current) {
        if (key === '$ref' && typeof current[key] === 'string') {
          refs.push(current[key])
        } else {
          stack.push(current[key])
        }
      }
    }
  }

  return refs
}

// Start from api.yaml
;(async () => {
  console.log('📥 Downloading SimplBooks OpenAPI spec...')
  await processFile('api.yaml')
  await processFile('/schemas/Article.yaml')
  await processFile('/schemas/PurchaseRow.yaml')
  await processFile('/schemas/Purchase.yaml')
  await processFile('/schemas/EmployeeBasic.yaml')
  await processFile('/schemas/ClientBasicData.yaml')

  console.log('🎉 Done! Files saved to:', OUTPUT_DIR)
})()
