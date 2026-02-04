const fs = require('fs')

function decodeBase64ToPdf(base64, outputPath) {
  if (!base64 || typeof base64 !== 'string' || !base64.trim()) {
    throw new Error('No base64 input provided.')
  }

  const clean = base64.replace(/\s/g, '')
  const buffer = Buffer.from(clean, 'base64')

  fs.writeFileSync(outputPath, buffer)
  console.log(`PDF written to ${outputPath}`)
}

function run() {
  const args = process.argv.slice(2)

  const outputPath = args[1] || 'output.pdf'

  // Prefer stdin if data is being piped in; otherwise use argv[2] as base64 input.
  if (!process.stdin.isTTY) {
    let input = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => {
      input += chunk
    })
    process.stdin.on('end', () => {
      try {
        decodeBase64ToPdf(input, outputPath)
      } catch (err) {
        console.error(err.message || err)
        process.exitCode = 1
      }
    })
  } else {
    const base64Arg = args[0]
    try {
      decodeBase64ToPdf(base64Arg, outputPath)
    } catch (err) {
      console.error(err.message || err)
      process.exitCode = 1
    }
  }
}

if (require.main === module) {
  run()
}
