import type { DropResult } from '@hello-pangea/dnd'
import type { ExamVersionDetail } from '@mik/contracts/exams'

import { adminReorderChoices, adminReorderQuestions } from '../../exams/examApi'

type QuestionDetail = ExamVersionDetail['questions'][number]

/**
 * The editor runs one `DragDropContext` for the whole page rather than nesting a
 * second one inside each question card — nesting is not supported by
 * `@hello-pangea/dnd`. Questions and choices are therefore separate droppables
 * distinguished by id, and `type` keeps a question from being dropped into a
 * choice list.
 */
export const QUESTIONS_DROPPABLE_ID = 'exam-questions'
export const QUESTION_DRAG_TYPE = 'question'
export const CHOICE_DRAG_TYPE = 'choice'

const CHOICES_DROPPABLE_PREFIX = 'exam-choices:'

export const choicesDroppableId = (questionId: string): string =>
  `${CHOICES_DROPPABLE_PREFIX}${questionId}`

/** Moves one item of `items` from `fromIndex` to `toIndex`, leaving the input untouched. */
export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * What a completed drag means, or `null` when it means nothing — dropped outside a
 * list, dropped back where it started, or aimed at a droppable this page doesn't
 * own. Keeping it a pure function is what makes the drop decisions testable
 * without driving a real drag through jsdom.
 */
export type ReorderIntent =
  | { kind: 'questions'; questions: QuestionDetail[] }
  | { kind: 'choices'; questionId: string; choices: QuestionDetail['choices'] }

export function reorderIntentFromDrop(
  result: DropResult,
  questions: readonly QuestionDetail[],
): ReorderIntent | null {
  const { source, destination } = result
  if (!destination) return null

  // A drag between two different lists would move an item across questions, which
  // the reorder endpoints deliberately cannot express — they rewrite sort_order
  // within one parent.
  if (destination.droppableId !== source.droppableId) return null
  if (destination.index === source.index) return null

  if (source.droppableId === QUESTIONS_DROPPABLE_ID) {
    if (source.index >= questions.length || destination.index >= questions.length) return null
    return { kind: 'questions', questions: moveItem(questions, source.index, destination.index) }
  }

  if (!source.droppableId.startsWith(CHOICES_DROPPABLE_PREFIX)) return null

  const questionId = source.droppableId.slice(CHOICES_DROPPABLE_PREFIX.length)
  const question = questions.find((q) => q.questionId === questionId)
  if (!question) return null
  if (source.index >= question.choices.length || destination.index >= question.choices.length) {
    return null
  }

  return {
    kind: 'choices',
    questionId,
    choices: moveItem(question.choices, source.index, destination.index),
  }
}

/**
 * Sends an intent to whichever reorder endpoint it belongs to. Lives here rather
 * than in the page so the mapping from intent to request — which list of ids, to
 * which parent — is testable without completing a real drag.
 */
export async function commitReorder(intent: ReorderIntent, versionId: string): Promise<void> {
  if (intent.kind === 'questions') {
    await adminReorderQuestions(
      versionId,
      intent.questions.map((q) => q.questionId),
    )
    return
  }

  await adminReorderChoices(
    intent.questionId,
    intent.choices.map((c) => c.choiceId),
  )
}
