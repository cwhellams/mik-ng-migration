/**
 * Traficom LAPL/PPL PDF → JSON converter
 *
 * Converts Finnish and English Traficom practice question PDFs into the
 * ExamImport JSON format ready for POST /api/v1/exams/admin/exams/import.
 *
 * Usage:
 *   npx tsx apps/backend/scripts/parseTraficomPdf.ts \
 *     --fi 010-fi.pdf --en 010-en.pdf \
 *     --subject "010 Air Law" --subject-fi "010 Ilmailulainsäädäntö" \
 *     > apps/backend/data/traficom/010-air-law.json
 *
 * Notes:
 *   - Choice A is set as isCorrect: true as a placeholder; fix manually after import.
 *   - Questions missing choice D in the source PDF are skipped (logged to stderr).
 *   - Questions present in only one language are skipped (logged to stderr).
 *
 * Requires: pdftotext (Poppler)
 */

import { execFileSync } from 'node:child_process'

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  const value = args[idx + 1]
  if (value === undefined || value.startsWith('--')) return undefined
  return value
}

const fiPdf = getArg('--fi')
const enPdf = getArg('--en')
const subject = getArg('--subject')
const subjectFi = getArg('--subject-fi')

if (!fiPdf || !enPdf || !subject || !subjectFi) {
  process.stderr.write(
    'Usage: npx tsx parseTraficomPdf.ts --fi <pdf> --en <pdf> --subject "<en name>" --subject-fi "<fi name>"\n',
  )
  process.exit(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedQuestion {
  number: number
  prompt: string
  choices: Record<string, string>
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF text extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractText(pdfPath: string): string {
  return execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
    maxBuffer: 10 * 1024 * 1024,
  }).toString()
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse questions from pdftotext -layout output.
 *
 * Format in PDF:
 *   NUMBER   Question text (possibly multi-line)
 *       [A]   Choice text (possibly multi-line)
 *       [B]   ...
 *       [C]   ...
 *       [D]   ...
 *
 * Page breaks (\f) are stripped before parsing.
 */
function parseQuestions(text: string): ParsedQuestion[] {
  // Strip form-feed (page break) characters that pdftotext -layout inserts
  const lines = text.replace(/\f/g, '').split('\n')
  const questions: ParsedQuestion[] = []

  let i = 0

  // Skip header until the first question line
  while (i < lines.length && !/^(\s*)(\d+)\s{1,6}\S/.test(lines[i])) i++

  while (i < lines.length) {
    const qMatch = lines[i].match(/^(\s*)(\d+)\s{1,6}(\S)/)
    if (!qMatch) {
      i++
      continue
    }

    const qIndent = qMatch[1].length
    const qNumber = parseInt(qMatch[2], 10)
    const firstLinePrefixLen = qMatch[1].length + qMatch[2].length
    const promptLines = [lines[i].slice(firstLinePrefixLen).trimStart()]
    i++

    // Collect continuation lines of the prompt (before first [A-D])
    while (i < lines.length) {
      const line = lines[i]
      if (/^\s*\[[ABCD]\]\s+/.test(line)) break
      const nextQ = line.match(/^(\s*)(\d+)\s{1,6}(\S)/)
      if (nextQ && nextQ[1].length <= qIndent) break
      if (line.trim() === '') {
        i++
        continue
      }
      promptLines.push(line.trimStart())
      i++
    }

    // Collect choices [A]–[D]
    const choices: Record<string, string> = {}

    while (i < lines.length) {
      const line = lines[i]
      const choiceMatch = line.match(/^(\s*)\[([ABCD])\]\s+(.*)/)

      if (!choiceMatch) {
        const nextQ = line.match(/^(\s*)(\d+)\s{1,6}(\S)/)
        if (nextQ && nextQ[1].length <= qIndent) break
        if (line.trim() === '') {
          i++
          continue
        }
        // Continuation of the last choice
        const lastLetter = Object.keys(choices).at(-1)
        if (lastLetter) choices[lastLetter] += ' ' + line.trimStart()
        i++
        continue
      }

      const choiceIndent = choiceMatch[1].length
      const letter = choiceMatch[2]
      const choiceLines = [choiceMatch[3]]
      i++

      // Collect continuation lines for this choice
      while (i < lines.length) {
        const contLine = lines[i]
        if (/^\s*\[[ABCD]\]\s+/.test(contLine)) break
        const nextQ = contLine.match(/^(\s*)(\d+)\s{1,6}(\S)/)
        if (nextQ && nextQ[1].length <= qIndent) break
        if (contLine.trim() === '') break
        const contIndent = contLine.match(/^(\s*)/)![1].length
        if (contIndent > choiceIndent) {
          choiceLines.push(contLine.trimStart())
          i++
        } else {
          break
        }
      }

      choices[letter] = choiceLines.join(' ').replace(/\s+/g, ' ').trim()
    }

    const prompt = promptLines.join(' ').replace(/\s+/g, ' ').trim()

    if (prompt && choices['A'] && choices['B'] && choices['C'] && choices['D']) {
      questions.push({ number: qNumber, prompt, choices })
    } else if (prompt) {
      process.stderr.write(
        `WARNING: Q${qNumber} incomplete (choices: ${Object.keys(choices).join('')}) — skipped\n`,
      )
    }
  }

  return questions
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON builder
// ─────────────────────────────────────────────────────────────────────────────

function buildJson(
  fiQuestions: ParsedQuestion[],
  enQuestions: ParsedQuestion[],
  subjectEn: string,
  subjectFiName: string,
) {
  const fiByNum = new Map(fiQuestions.map((q) => [q.number, q]))
  const enByNum = new Map(enQuestions.map((q) => [q.number, q]))
  const allNumbers = [...new Set([...fiByNum.keys(), ...enByNum.keys()])].sort((a, b) => a - b)

  const questions = []
  let sortOrder = 1

  for (const num of allNumbers) {
    const fi = fiByNum.get(num)
    const en = enByNum.get(num)

    if (!fi) {
      process.stderr.write(`WARNING: Q${num} missing in Finnish — skipped\n`)
      continue
    }
    if (!en) {
      process.stderr.write(`WARNING: Q${num} missing in English — skipped\n`)
      continue
    }

    questions.push({
      sortOrder: sortOrder++,
      translations: {
        fi: { prompt: fi.prompt, reasoning: null },
        en: { prompt: en.prompt, reasoning: null },
      },
      choices: ['A', 'B', 'C', 'D'].map((letter, idx) => ({
        sortOrder: idx,
        isCorrect: idx === 0, // placeholder — fix correct answers after import
        translations: {
          fi: { text: fi.choices[letter] },
          en: { text: en.choices[letter] },
        },
      })),
    })
  }

  return {
    name: subjectEn,
    examType: 'OTHER',
    version: {
      defaultLanguage: 'fi',
      supportedLanguages: ['fi', 'en'],
      passPercent: 75,
      translations: {
        fi: { title: subjectFiName, description: null },
        en: { title: subjectEn, description: null },
      },
      questions,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const fiText = extractText(fiPdf)
const enText = extractText(enPdf)

const fiQuestions = parseQuestions(fiText)
const enQuestions = parseQuestions(enText)

process.stderr.write(
  `Parsed: fi=${fiQuestions.length} questions, en=${enQuestions.length} questions\n`,
)

const result = buildJson(fiQuestions, enQuestions, subject, subjectFi)

process.stdout.write(JSON.stringify(result, null, 2) + '\n')
