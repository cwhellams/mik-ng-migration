import { describe, expect, it } from 'vitest'

import {
  ExamImportSchema,
  ExamVersionSchema,
  ExamVersionUpsertSchema,
  ReorderChoicesSchema,
  ReorderQuestionsSchema,
} from '../src/exams.ts'

const audit = {
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'k1mnimda',
  updatedAt: '2026-01-02T00:00:00.000Z',
  updatedBy: 'k1mnimda',
}

const version = {
  ...audit,
  versionId: 'VER00001',
  examId: 'EXAM0001',
}

describe('ExamVersionSchema.randomizeQuestionOrder', () => {
  it('defaults to random order, matching every version created before the column existed', () => {
    expect(ExamVersionSchema.parse(version).randomizeQuestionOrder).toBe(true)
  })

  it('accepts an explicit fixed order', () => {
    expect(
      ExamVersionSchema.parse({ ...version, randomizeQuestionOrder: false }).randomizeQuestionOrder,
    ).toBe(false)
  })

  it('rejects a non-boolean', () => {
    expect(ExamVersionSchema.safeParse({ ...version, randomizeQuestionOrder: 'yes' }).success).toBe(
      false,
    )
  })

  it('survives into the upsert shape, so an editor can change it', () => {
    const parsed = ExamVersionUpsertSchema.parse({ randomizeQuestionOrder: false })
    expect(parsed).toMatchObject({ randomizeQuestionOrder: false })
    expect(parsed).not.toHaveProperty('versionId')
  })
})

describe('ReorderQuestionsSchema', () => {
  it('accepts a list of ids', () => {
    expect(ReorderQuestionsSchema.parse({ questionIds: ['Q1', 'Q2', 'Q3'] })).toEqual({
      questionIds: ['Q1', 'Q2', 'Q3'],
    })
  })

  it('rejects duplicates — a repeated id would silently drop a question from the order', () => {
    const result = ReorderQuestionsSchema.safeParse({ questionIds: ['Q1', 'Q2', 'Q1'] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toMatch(/duplicates/)
  })

  it('rejects an empty list', () => {
    expect(ReorderQuestionsSchema.safeParse({ questionIds: [] }).success).toBe(false)
  })

  it('rejects an id longer than a short id', () => {
    expect(ReorderQuestionsSchema.safeParse({ questionIds: ['0123456789'] }).success).toBe(false)
  })
})

describe('ReorderChoicesSchema', () => {
  it('accepts a list of ids', () => {
    expect(ReorderChoicesSchema.parse({ choiceIds: ['C1', 'C2'] })).toEqual({
      choiceIds: ['C1', 'C2'],
    })
  })

  it('rejects duplicates', () => {
    expect(ReorderChoicesSchema.safeParse({ choiceIds: ['C1', 'C1'] }).success).toBe(false)
  })
})

describe('ExamImportSchema', () => {
  const importPayload = (overrides: Record<string, unknown> = {}) => ({
    name: '010 Air Law',
    version: {
      translations: { fi: { title: '010 Ilmailulainsäädäntö' } },
      questions: [
        {
          sortOrder: 0,
          translations: { fi: { prompt: 'Kysymys 1?' } },
          choices: [
            { sortOrder: 0, isCorrect: true, translations: { fi: { text: 'A' } } },
            { sortOrder: 1, isCorrect: false, translations: { fi: { text: 'B' } } },
          ],
        },
      ],
      ...overrides,
    },
  })

  it('defaults an imported version to random order', () => {
    expect(ExamImportSchema.parse(importPayload()).version.randomizeQuestionOrder).toBe(true)
  })

  it('lets an import declare fixed order — the AFM case that motivated #855', () => {
    const parsed = ExamImportSchema.parse(importPayload({ randomizeQuestionOrder: false }))
    expect(parsed.version.randomizeQuestionOrder).toBe(false)
  })
})
