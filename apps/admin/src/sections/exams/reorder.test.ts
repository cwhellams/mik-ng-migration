import type { DropResult } from '@hello-pangea/dnd'
import type { ExamVersionDetail } from '@mik/contracts/exams'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import {
  CHOICE_DRAG_TYPE,
  QUESTION_DRAG_TYPE,
  QUESTIONS_DROPPABLE_ID,
  choicesDroppableId,
  commitReorder,
  moveItem,
  nextSortOrder,
  reorderIntentFromDrop,
} from './reorder'

type QuestionDetail = ExamVersionDetail['questions'][number]

const aChoice = (choiceId: string, sortOrder: number): QuestionDetail['choices'][number] => ({
  choiceId,
  questionId: 'Q1',
  isCorrect: sortOrder === 0,
  sortOrder,
  translations: { en: { text: choiceId } },
})

const aQuestion = (questionId: string, sortOrder: number, choiceIds: string[] = []) =>
  ({
    questionId,
    versionId: 'VER00001',
    sortOrder,
    translations: { en: { prompt: questionId, reasoning: null } },
    choices: choiceIds.map((id, i) => ({ ...aChoice(id, i), questionId })),
  }) satisfies QuestionDetail

const questions: QuestionDetail[] = [
  aQuestion('Q1', 0, ['C1', 'C2', 'C3']),
  aQuestion('Q2', 1, ['C4', 'C5']),
  aQuestion('Q3', 2),
]

const drop = (
  droppableId: string,
  fromIndex: number,
  toIndex: number | null,
  type = QUESTION_DRAG_TYPE,
  toDroppableId = droppableId,
): DropResult =>
  ({
    draggableId: 'whatever',
    type,
    source: { droppableId, index: fromIndex },
    destination: toIndex === null ? null : { droppableId: toDroppableId, index: toIndex },
    reason: 'DROP',
    mode: 'FLUID',
    combine: null,
  }) as DropResult

describe('moveItem', () => {
  it('moves an item forwards', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item backwards', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leaves the input array untouched', () => {
    const original = ['a', 'b', 'c']
    moveItem(original, 0, 2)
    expect(original).toEqual(['a', 'b', 'c'])
  })
})

describe('nextSortOrder', () => {
  it('starts a first item at zero', () => {
    expect(nextSortOrder([])).toBe(0)
  })

  it('goes one past the highest, not one past the count', () => {
    // Hand-typed legacy values with a gap: a count-derived 3 would collide with
    // the existing 3 and land the new item in an arbitrary place.
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 2 }, { sortOrder: 3 }])).toBe(4)
  })

  it('does not assume the list is sorted', () => {
    expect(nextSortOrder([{ sortOrder: 7 }, { sortOrder: 1 }])).toBe(8)
  })

  it('copes with duplicated legacy values', () => {
    expect(nextSortOrder([{ sortOrder: 2 }, { sortOrder: 2 }])).toBe(3)
  })
})

describe('reorderIntentFromDrop — questions', () => {
  it('reports the whole new question order', () => {
    const intent = reorderIntentFromDrop(drop(QUESTIONS_DROPPABLE_ID, 2, 0), questions)

    expect(intent).toEqual({
      kind: 'questions',
      questions: [questions[2], questions[0], questions[1]],
    })
  })

  it('ignores a drop back on the source index', () => {
    expect(reorderIntentFromDrop(drop(QUESTIONS_DROPPABLE_ID, 1, 1), questions)).toBeNull()
  })

  it('ignores a drop outside any list', () => {
    expect(reorderIntentFromDrop(drop(QUESTIONS_DROPPABLE_ID, 1, null), questions)).toBeNull()
  })

  it('ignores an index past the end of the list', () => {
    expect(reorderIntentFromDrop(drop(QUESTIONS_DROPPABLE_ID, 9, 0), questions)).toBeNull()
    expect(reorderIntentFromDrop(drop(QUESTIONS_DROPPABLE_ID, 0, 9), questions)).toBeNull()
  })
})

describe('reorderIntentFromDrop — choices', () => {
  it('reports the new order of one question’s choices', () => {
    const intent = reorderIntentFromDrop(
      drop(choicesDroppableId('Q1'), 0, 2, CHOICE_DRAG_TYPE),
      questions,
    )

    expect(intent).toEqual({
      kind: 'choices',
      questionId: 'Q1',
      choices: [questions[0].choices[1], questions[0].choices[2], questions[0].choices[0]],
    })
  })

  it('leaves the other questions’ choices alone', () => {
    const intent = reorderIntentFromDrop(
      drop(choicesDroppableId('Q2'), 0, 1, CHOICE_DRAG_TYPE),
      questions,
    )

    expect(intent).toMatchObject({ questionId: 'Q2' })
    expect(questions[0].choices.map((c) => c.choiceId)).toEqual(['C1', 'C2', 'C3'])
  })

  it('ignores a drop into a different question — the endpoint cannot move a choice across questions', () => {
    const result = drop(choicesDroppableId('Q1'), 0, 0, CHOICE_DRAG_TYPE, choicesDroppableId('Q2'))

    expect(reorderIntentFromDrop(result, questions)).toBeNull()
  })

  it('ignores a droppable id that names no known question', () => {
    expect(
      reorderIntentFromDrop(drop(choicesDroppableId('GONE'), 0, 1, CHOICE_DRAG_TYPE), questions),
    ).toBeNull()
  })

  it('ignores a droppable id this page does not own', () => {
    expect(reorderIntentFromDrop(drop('dashboard-components', 0, 1), questions)).toBeNull()
  })

  it('ignores an index past the end of a choice list', () => {
    expect(
      reorderIntentFromDrop(drop(choicesDroppableId('Q2'), 0, 5, CHOICE_DRAG_TYPE), questions),
    ).toBeNull()
  })
})

describe('commitReorder', () => {
  const captureReorders = () => {
    const sent: { path: string; body: unknown }[] = []

    server.use(
      http.put(
        apiUrl('v1/exams/admin/versions/:versionId/questions/order'),
        async ({ request }) => {
          sent.push({ path: 'questions', body: await request.json() })
          return HttpResponse.json({})
        },
      ),
      http.put(
        apiUrl('v1/exams/admin/questions/:questionId/choices/order'),
        async ({ request, params }) => {
          sent.push({ path: `choices:${String(params.questionId)}`, body: await request.json() })
          return HttpResponse.json({})
        },
      ),
    )

    return sent
  }

  it('sends the whole new question order to the version endpoint', async () => {
    const sent = captureReorders()

    await commitReorder(
      { kind: 'questions', questions: [questions[2], questions[0], questions[1]] },
      'VER00001',
    )

    expect(sent).toEqual([{ path: 'questions', body: { questionIds: ['Q3', 'Q1', 'Q2'] } }])
  })

  it('sends a choice order to the owning question, not to the version', async () => {
    const sent = captureReorders()

    await commitReorder(
      { kind: 'choices', questionId: 'Q1', choices: [...questions[0].choices].reverse() },
      'VER00001',
    )

    expect(sent).toEqual([{ path: 'choices:Q1', body: { choiceIds: ['C3', 'C2', 'C1'] } }])
  })

  it('propagates a rejected reorder so the page can restore the old order', async () => {
    server.use(
      http.put(apiUrl('v1/exams/admin/versions/:versionId/questions/order'), () =>
        problemResponse(409, 'Only DRAFT versions can be edited'),
      ),
    )

    await expect(
      commitReorder({ kind: 'questions', questions: [...questions].reverse() }, 'VER00001'),
    ).rejects.toThrow()
  })
})
