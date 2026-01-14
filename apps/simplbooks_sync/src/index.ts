import dotenv from 'dotenv'
import { SimplBooksApiClient } from './simplbooks-client.js'
import { DatabaseService } from './database-service.js'
import { join, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config()

interface Config {
  simplBooksBaseUri: string
  simplBooksApiKey: string
  simplBooksCompanyId: string
  databaseUrl: string
}

function loadConfig(): Config {
  const simplBooksBaseUri = process.env.SIMPLBOOKS_BASE_URI
  const simplBooksApiKey = process.env.SIMPLBOOKS_API_KEY
  const simplBooksCompanyId = process.env.SIMPLBOOKS_COMPANY_ID
  const databaseUrl = process.env.DATABASE_URL

  if (!simplBooksBaseUri) {
    throw new Error('SIMPLBOOKS_BASE_URI environment variable is required')
  }
  if (!simplBooksApiKey) {
    throw new Error('SIMPLBOOKS_API_KEY environment variable is required')
  }
  if (!simplBooksCompanyId) {
    throw new Error('SIMPLBOOKS_COMPANY_ID environment variable is required')
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  return {
    simplBooksBaseUri,
    simplBooksApiKey,
    simplBooksCompanyId,
    databaseUrl,
  }
}

async function syncClients() {
  console.log('=== SimplBooks Client Sync Started ===\n')

  const config = loadConfig()

  // Initialize services
  const simplBooksClient = new SimplBooksApiClient(
    config.simplBooksBaseUri,
    config.simplBooksApiKey,
    config.simplBooksCompanyId
  )

  const certPath = join(__dirname, '..', 'ca-certificate.crt')
  const caCert = readFileSync(certPath, 'utf-8')

  console.log(`ca cert loaded from ${certPath}: ${caCert.substring(0, 30)}...`)

  const db = new DatabaseService(config.databaseUrl, caCert)

  try {
    // Connect to database
    await db.connect()

    // Fetch all clients from SimplBooks
    const clients = await simplBooksClient.getAllClients()

    console.log(`\nProcessing ${clients.length} clients...\n`)

    let updated = 0
    let skipped = 0
    let errors = 0

    for (const client of clients) {
      // Skip clients without email
      if (!client.e_mail) {
        console.log(
          `⊘ Skipping client ${client.name} (ID: ${client.id}) - no email address`
        )
        skipped++
        continue
      }

      try {
        // Update billing_id for existing members only
        const result = await db.updateMemberBillingId(client)
        if (result.action === 'updated') {
          updated++
        } else {
          skipped++
        }
      } catch (error) {
        console.error(`Error processing client ${client.e_mail}:`, error)
        errors++
      }
    }

    // Print summary
    console.log('\n=== Sync Summary ===')
    console.log(`Total clients processed: ${clients.length}`)
    console.log(`Billing IDs updated: ${updated}`)
    console.log(`Skipped (no match or no change): ${skipped}`)
    console.log(`Errors: ${errors}`)
    console.log('===================\n')
  } catch (error) {
    console.error('Fatal error during sync:', error)
    process.exit(1)
  } finally {
    await db.close()
  }

  console.log('=== SimplBooks Client Sync Completed ===')
}

async function matchRemovedMembers() {
  console.log('\n=== Matching Removed Members ===\n')

  const config = loadConfig()

  const simplBooksClient = new SimplBooksApiClient(
    config.simplBooksBaseUri,
    config.simplBooksApiKey,
    config.simplBooksCompanyId
  )

  const certPath = join(__dirname, '..', 'ca-certificate.crt')
  const caCert = readFileSync(certPath, 'utf-8')

  console.log(`ca cert loaded from ${certPath}: ${caCert.substring(0, 30)}...`)

  const db = new DatabaseService(config.databaseUrl, caCert)

  try {
    await db.connect()

    // Get all removed members
    const removedMembers = await db.getRemovedMembers()
    console.log(`Found ${removedMembers.length} removed members\n`)

    for (const member of removedMembers) {
      if (!member.last_name) {
        console.log(`⊘ Skipping ${member.email} - no last name`)
        continue
      }

      try {
        // Search SimplBooks by last name
        const clients = await simplBooksClient.searchClientsByName(
          member.last_name
        )

        if (!clients || clients.length === 0) {
          console.log(
            `⊘ No SimplBooks clients found for: ${member.last_name} (${member.email})`
          )
        } else if (clients.length === 1) {
          // Single match - assume this is correct
          const client = clients[0]
          if (!client?.id) {
            console.log(
              `⊘ Invalid client data for: ${member.last_name} (${member.email})`
            )
          } else {
            console.log(
              `✓ Single match for ${member.last_name}: SimplBooks ID=${client.id}, Email=${member.email}, Last Name=${member.last_name}`
            )
          }
        } else {
          // Multiple matches - check emails
          console.log(
            `⚠ Multiple matches (${clients.length}) for ${member.last_name}:`
          )

          for (const client of clients) {
            if (!client?.e_mail) {
              continue
            }

            // Check if this email exists in active members
            const isActive = await db.isEmailInActiveMembers(client.e_mail)

            if (isActive) {
              console.log(
                `  → ${client.e_mail} is still an active member (SimplBooks ID=${client.id})`
              )
            } else {
              console.log(
                `  ✓ OLD MEMBER FOUND: ${client.e_mail} (SimplBooks ID=${client.id}, Last Name=${member.last_name})`
              )
            }
          }
        }

        // Small delay between searches
        await new Promise((resolve) => setTimeout(resolve, 200))
      } catch (error) {
        console.error(
          `Error processing removed member ${member.email}:`,
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    console.log('\n=== Matching Completed ===')
  } catch (error) {
    console.error('Fatal error during matching:', error)
    process.exit(1)
  } finally {
    await db.close()
  }
}

// Run the sync
const operation = process.argv[2] || 'sync'

if (operation === 'sync') {
  syncClients().catch((error) => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
} else if (operation === 'match') {
  matchRemovedMembers().catch((error) => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
} else if (operation === 'both') {
  syncClients()
    .then(() => matchRemovedMembers())
    .catch((error) => {
      console.error('Unhandled error:', error)
      process.exit(1)
    })
} else {
  console.error(`Unknown operation: ${operation}`)
  console.error('Usage: pnpm sync [sync|match|both]')
  console.error(
    '  sync  - Sync SimplBooks clients to member database (default)'
  )
  console.error('  match - Match removed members to SimplBooks clients')
  console.error('  both  - Run both operations sequentially')
  process.exit(1)
}
