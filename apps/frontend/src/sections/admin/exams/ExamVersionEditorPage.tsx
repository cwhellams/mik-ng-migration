import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  FormControlLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router'
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvided,
  type DropResult,
} from '@hello-pangea/dnd'
import { Title } from '../../../components/Title'
import { RemoteContent } from '../../../components/RemoteContent'
import useApi from '../../../hooks/useApi'
import type { ExamVersionDetail } from '@mik/contracts/exams'

type QuestionDetail = ExamVersionDetail['questions'][number]
type ChoiceDetail = QuestionDetail['choices'][number]
import {
  adminUpsertTranslation,
  adminUpsertQuestion,
  adminDeleteQuestion,
  adminUpsertChoice,
  adminDeleteChoice,
  adminUpdateVersion,
} from '../../exams/examApi'
import {
  EXAM_LANGUAGES,
  getConfiguredExamLanguages,
  getPreferredExamLanguage,
  type ExamLanguage,
} from '../../exams/language'
import {
  CHOICE_DRAG_TYPE,
  QUESTION_DRAG_TYPE,
  QUESTIONS_DROPPABLE_ID,
  choicesDroppableId,
  commitReorder,
  nextSortOrder,
  reorderIntentFromDrop,
} from './reorder'

interface LangFieldsProps {
  label: string
  languages: ExamLanguage[]
  values: Record<string, string>
  multiline?: boolean
  onChange: (lang: ExamLanguage, val: string) => void
}

function LangFields({ label, languages, values, multiline, onChange }: Readonly<LangFieldsProps>) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        mb: 2,
      }}
    >
      <Typography
        variant='caption'
        sx={{
          color: 'text.secondary',
          display: 'block',
          mb: 1,
        }}
      >
        {label}
      </Typography>
      {languages.map((lang, i) => (
        <Box
          key={lang}
          sx={{
            display: 'flex',
            gap: 1,
            mt: i > 0 ? 1 : 0,
            alignItems: multiline ? 'flex-start' : 'center',
          }}
        >
          <Chip label={lang.toUpperCase()} size='small' sx={{ width: 38, flexShrink: 0 }} />
          <TextField
            size='small'
            fullWidth
            value={values[lang] ?? ''}
            onChange={(e) => onChange(lang, e.target.value)}
            multiline={multiline}
            rows={multiline ? 2 : undefined}
          />
        </Box>
      ))}
    </Box>
  )
}

interface ChoiceEditorProps {
  questionId: string
  choice: ChoiceDetail | null
  /** Where a brand-new choice lands: the end of the question's current list. */
  nextSortOrder: number
  languages: ExamLanguage[]
  onClose: () => void
  onSaved: () => void
}

function ChoiceEditor({
  questionId,
  choice,
  nextSortOrder,
  languages,
  onClose,
  onSaved,
}: Readonly<ChoiceEditorProps>) {
  const { t } = useTranslation()
  const [text, setText] = useState<Record<ExamLanguage, string>>(
    Object.fromEntries(languages.map((l) => [l, choice?.translations[l]?.text ?? ''])) as Record<
      ExamLanguage,
      string
    >,
  )
  const [isCorrect, setIsCorrect] = useState(choice?.isCorrect ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await adminUpsertChoice(questionId, {
        choiceId: choice?.choiceId,
        isCorrect,
        // Order is set by dragging the list, never typed here, so an edit keeps the
        // position the choice already has.
        sortOrder: choice?.sortOrder ?? nextSortOrder,
        translations: Object.fromEntries(languages.map((l) => [l, { text: text[l] }])) as Record<
          string,
          { text: string }
        >,
      })
      onSaved()
    } catch {
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{choice ? t('exams.admin.editChoice') : t('exams.admin.addChoice')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <LangFields
          label={t('exams.admin.choiceText')}
          languages={languages}
          values={text}
          onChange={(l, v) => setText((prev) => ({ ...prev, [l]: v }))}
        />
        <FormControlLabel
          control={<Switch checked={isCorrect} onChange={(e) => setIsCorrect(e.target.checked)} />}
          label={t('exams.admin.isCorrect')}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={saving} variant='contained'>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface ChoiceRowProps {
  choice: ChoiceDetail
  languages: ExamLanguage[]
  dragHandle?: DraggableProvided['dragHandleProps']
  dragLabel: string
  onEdit: () => void
  onDelete: () => void
}

function ChoiceRow({
  choice,
  languages,
  dragHandle,
  dragLabel,
  onEdit,
  onDelete,
}: Readonly<ChoiceRowProps>) {
  const choiceLanguage = getPreferredExamLanguage(
    'en',
    { supportedLanguages: languages, defaultLanguage: languages[0] },
    Object.keys(choice.translations),
  )

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
      {dragHandle && (
        <Box {...dragHandle} aria-label={dragLabel} sx={{ display: 'flex', cursor: 'grab' }}>
          <Icon icon='mdi:drag' />
        </Box>
      )}
      {choice.isCorrect ? (
        <Icon icon='mdi:check-circle' color='green' />
      ) : (
        <Icon icon='mdi:circle-outline' />
      )}
      <Typography variant='body2' sx={{ flex: 1 }}>
        {choiceLanguage ? (choice.translations[choiceLanguage]?.text ?? '') : ''}
      </Typography>
      <IconButton size='small' onClick={onEdit}>
        <Icon icon='mdi:pencil' />
      </IconButton>
      <IconButton size='small' color='error' onClick={onDelete}>
        <Icon icon='mdi:delete' />
      </IconButton>
    </Box>
  )
}

interface QuestionCardProps {
  versionId: string
  question: QuestionDetail
  index: number
  languages: ExamLanguage[]
  /**
   * Present only on a DRAFT, where the card sits inside the page's
   * `DragDropContext` — which is also the only place its choices may be a
   * `Droppable`. Published versions get neither: the backend rejects the edit.
   */
  drag?: DraggableProvided
  onChanged: () => void
}

function QuestionCard({
  versionId,
  question,
  index,
  languages,
  drag,
  onChanged,
}: Readonly<QuestionCardProps>) {
  const { t } = useTranslation()
  const [editingChoice, setEditingChoice] = useState<ChoiceDetail | null | 'new'>(null)
  const [editingQuestion, setEditingQuestion] = useState(false)
  const [prompt, setPrompt] = useState<Record<ExamLanguage, string>>(
    Object.fromEntries(languages.map((l) => [l, question.translations[l]?.prompt ?? ''])) as Record<
      ExamLanguage,
      string
    >,
  )
  const [reasoning, setReasoning] = useState<Record<ExamLanguage, string>>(
    Object.fromEntries(
      languages.map((l) => [l, question.translations[l]?.reasoning ?? '']),
    ) as Record<ExamLanguage, string>,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewLanguage = getPreferredExamLanguage(
    'en',
    { supportedLanguages: languages, defaultLanguage: languages[0] },
    Object.keys(question.translations),
  )

  const handleSaveQuestion = async () => {
    setSaving(true)
    setError(null)
    try {
      await adminUpsertQuestion(versionId, {
        questionId: question.questionId,
        sortOrder: question.sortOrder,
        translations: Object.fromEntries(
          languages.map((l) => [l, { prompt: prompt[l], reasoning: reasoning[l] || null }]),
        ) as Record<string, { prompt: string; reasoning?: string | null }>,
      })
      setEditingQuestion(false)
      onChanged()
    } catch {
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteQuestion = async () => {
    if (!confirm(t('common.confirmDelete'))) return
    try {
      await adminDeleteQuestion(question.questionId)
      onChanged()
    } catch {
      setError(t('common.error'))
    }
  }

  const handleDeleteChoice = async (choiceId: string) => {
    if (!confirm(t('common.confirmDelete'))) return
    try {
      await adminDeleteChoice(choiceId)
      onChanged()
    } catch {
      setError(t('common.error'))
    }
  }

  const choiceRow = (choice: ChoiceDetail, dragHandle?: DraggableProvided['dragHandleProps']) => (
    <ChoiceRow
      choice={choice}
      languages={languages}
      dragHandle={dragHandle}
      dragLabel={t('exams.admin.reorderChoice')}
      onEdit={() => setEditingChoice(choice)}
      onDelete={() => handleDeleteChoice(choice.choiceId)}
    />
  )

  return (
    <Box
      ref={drag?.innerRef}
      {...drag?.draggableProps}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 2,
        mb: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {drag && (
            <Box
              {...drag.dragHandleProps}
              aria-label={t('exams.admin.reorderQuestion', { n: index + 1 })}
              sx={{ display: 'flex', cursor: 'grab' }}
            >
              <Icon icon='mdi:drag' />
            </Box>
          )}
          <Typography
            variant='subtitle1'
            sx={{
              fontWeight: 'bold',
            }}
          >
            {t('exams.questionNumber', { n: index + 1 })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton size='small' onClick={() => setEditingQuestion(!editingQuestion)}>
            <Icon icon='mdi:pencil' />
          </IconButton>
          <IconButton size='small' color='error' onClick={handleDeleteQuestion}>
            <Icon icon='mdi:delete' />
          </IconButton>
        </Box>
      </Box>
      {error && (
        <Alert severity='error' sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {editingQuestion ? (
        <Box>
          <LangFields
            label={t('exams.admin.questionPrompt')}
            languages={languages}
            values={prompt}
            multiline
            onChange={(l, v) => setPrompt((prev) => ({ ...prev, [l]: v }))}
          />
          <LangFields
            label={t('exams.admin.questionReasoning')}
            languages={languages}
            values={reasoning}
            multiline
            onChange={(l, v) => setReasoning((prev) => ({ ...prev, [l]: v }))}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={handleSaveQuestion} disabled={saving} variant='contained' size='small'>
              {t('common.save')}
            </Button>
            <Button onClick={() => setEditingQuestion(false)} size='small'>
              {t('common.cancel')}
            </Button>
          </Box>
        </Box>
      ) : (
        <Typography
          variant='body2'
          sx={{
            color: 'text.secondary',
          }}
        >
          {previewLanguage
            ? (question.translations[previewLanguage]?.prompt ?? t('exams.admin.noTranslation'))
            : t('exams.admin.noTranslation')}
        </Typography>
      )}
      <Divider sx={{ my: 1.5 }} />
      <Typography
        variant='caption'
        sx={{
          fontWeight: 'bold',
        }}
      >
        {t('exams.admin.choices')}
      </Typography>
      {drag ? (
        <Droppable droppableId={choicesDroppableId(question.questionId)} type={CHOICE_DRAG_TYPE}>
          {(dropProvided) => (
            <Box ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
              {question.choices.map((choice, choiceIndex) => (
                <Draggable key={choice.choiceId} draggableId={choice.choiceId} index={choiceIndex}>
                  {(dragProvided) => (
                    <Box ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                      {choiceRow(choice, dragProvided.dragHandleProps)}
                    </Box>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </Box>
          )}
        </Droppable>
      ) : (
        question.choices.map((choice) => <Box key={choice.choiceId}>{choiceRow(choice)}</Box>)
      )}
      <Button
        startIcon={<Icon icon='mdi:plus' />}
        size='small'
        sx={{ mt: 1 }}
        onClick={() => setEditingChoice('new')}
      >
        {t('exams.admin.addChoice')}
      </Button>
      {editingChoice !== null && (
        <ChoiceEditor
          questionId={question.questionId}
          choice={editingChoice === 'new' ? null : editingChoice}
          nextSortOrder={nextSortOrder(question.choices)}
          languages={languages}
          onClose={() => setEditingChoice(null)}
          onSaved={() => {
            setEditingChoice(null)
            onChanged()
          }}
        />
      )}
    </Box>
  )
}

export default function ExamVersionEditorPage() {
  const { versionId } = useParams<{ versionId: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const {
    data: version,
    isLoading,
    error,
    mutate,
  } = useApi<ExamVersionDetail>({
    url: `v1/exams/admin/versions/${versionId}`,
    skipFetch: !versionId,
  })

  const [translations, setTranslations] = useState<Record<
    ExamLanguage,
    { title: string; description: string }
  > | null>(null)
  const [savingTrans, setSavingTrans] = useState(false)
  const [transError, setTransError] = useState<string | null>(null)
  const [versionSettings, setVersionSettings] = useState<{
    defaultLanguage: ExamLanguage
    supportedLanguages: ExamLanguage[]
    passPercent: number
    questionCount: number | null
    randomizeQuestionOrder: boolean
  } | null>(null)
  const [savingVersionSettings, setSavingVersionSettings] = useState(false)
  const [versionSettingsError, setVersionSettingsError] = useState<string | null>(null)
  // Holds the dragged-to order while the reorder request is in flight, so the list
  // doesn't snap back to the server's order for the duration of the round trip.
  const [pendingQuestions, setPendingQuestions] = useState<QuestionDetail[] | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const versionLanguages = version
    ? getConfiguredExamLanguages(version, Object.keys(version.translations))
    : []
  const isDraft = version?.status === 'DRAFT'
  const questions = pendingQuestions ?? version?.questions ?? []

  useEffect(() => {
    if (!version) return
    const supportedLanguages = getConfiguredExamLanguages(
      version,
      Object.keys(version.translations),
    )
    const init = Object.fromEntries(
      supportedLanguages.map((l) => [
        l,
        {
          title: version.translations?.[l]?.title ?? '',
          description: version.translations?.[l]?.description ?? '',
        },
      ]),
    ) as Record<ExamLanguage, { title: string; description: string }>
    setTranslations(init)
    setVersionSettings({
      defaultLanguage:
        supportedLanguages.find((lang) => lang === version.defaultLanguage) ??
        supportedLanguages[0] ??
        'en',
      supportedLanguages,
      passPercent: version.passPercent,
      questionCount: version.questionCount ?? null,
      randomizeQuestionOrder: version.randomizeQuestionOrder,
    })
  }, [version])

  const handleSaveTranslations = async () => {
    if (!translations || !versionId) return
    setSavingTrans(true)
    setTransError(null)
    try {
      await Promise.all(
        versionLanguages.map((l) =>
          adminUpsertTranslation(
            versionId,
            l,
            translations[l].title,
            translations[l].description || null,
          ),
        ),
      )
      await mutate()
    } catch {
      setTransError(t('common.error'))
    } finally {
      setSavingTrans(false)
    }
  }

  const handleSaveVersionSettings = async () => {
    if (!versionId || !versionSettings) return
    setSavingVersionSettings(true)
    setVersionSettingsError(null)
    try {
      await adminUpdateVersion(versionId, {
        defaultLanguage: versionSettings.defaultLanguage,
        supportedLanguages: versionSettings.supportedLanguages,
        passPercent: versionSettings.passPercent,
        questionCount: versionSettings.questionCount,
        randomizeQuestionOrder: versionSettings.randomizeQuestionOrder,
      })
      await mutate()
    } catch {
      setVersionSettingsError(t('common.error'))
    } finally {
      setSavingVersionSettings(false)
    }
  }

  const handleAddQuestion = async () => {
    if (!versionId) return
    await adminUpsertQuestion(versionId, {
      sortOrder: nextSortOrder(version?.questions ?? []),
      translations: Object.fromEntries(versionLanguages.map((l) => [l, { prompt: '' }])) as Record<
        string,
        { prompt: string }
      >,
    })
    await mutate()
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!versionId) return
    const intent = reorderIntentFromDrop(result, questions)
    if (!intent) return

    setReorderError(null)
    setPendingQuestions(
      intent.kind === 'questions'
        ? intent.questions
        : questions.map((q) =>
            q.questionId === intent.questionId ? { ...q, choices: intent.choices } : q,
          ),
    )
    try {
      await commitReorder(intent, versionId)
    } catch {
      setReorderError(t('exams.admin.reorderFailed'))
    } finally {
      // Either way the server is now the authority: a success confirms the new
      // order, a failure discards the optimistic one.
      await mutate()
      setPendingQuestions(null)
    }
  }

  return (
    <Box>
      <Button
        onClick={() => navigate('/admin/exams')}
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('exams.admin.title')}
      </Button>
      <RemoteContent isLoading={isLoading} error={error}>
        {version && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Title label={`${t('exams.admin.versionEditor')} v${version.versionNumber}`} />
              <Chip
                label={version.status}
                color={
                  version.status === 'PUBLISHED'
                    ? 'success'
                    : version.status === 'RETIRED'
                      ? 'default'
                      : 'warning'
                }
              />
            </Box>

            {isDraft && versionSettings && (
              <>
                <Typography variant='h6' gutterBottom>
                  {t('exams.admin.versionSettings')}
                </Typography>
                {versionSettingsError && (
                  <Alert severity='error' sx={{ mb: 2 }}>
                    {versionSettingsError}
                  </Alert>
                )}
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>{t('exams.admin.supportedLanguages')}</InputLabel>
                  <Select
                    multiple
                    value={versionSettings.supportedLanguages}
                    label={t('exams.admin.supportedLanguages')}
                    renderValue={(selected) =>
                      (selected as string[]).map((lang) => t(`exams.languages.${lang}`)).join(', ')
                    }
                    onChange={(e) => {
                      const nextLanguages = (
                        typeof e.target.value === 'string'
                          ? e.target.value.split(',')
                          : e.target.value
                      ) as ExamLanguage[]
                      setVersionSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              supportedLanguages: nextLanguages,
                              defaultLanguage: nextLanguages.includes(prev.defaultLanguage)
                                ? prev.defaultLanguage
                                : (nextLanguages[0] ?? prev.defaultLanguage),
                            }
                          : prev,
                      )
                    }}
                  >
                    {EXAM_LANGUAGES.map((lang) => (
                      <MenuItem key={lang} value={lang}>
                        <Checkbox checked={versionSettings.supportedLanguages.includes(lang)} />
                        <ListItemText primary={t(`exams.languages.${lang}`)} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>{t('exams.admin.defaultLanguage')}</InputLabel>
                  <Select
                    value={versionSettings.defaultLanguage}
                    label={t('exams.admin.defaultLanguage')}
                    onChange={(e) =>
                      setVersionSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              defaultLanguage: e.target.value as ExamLanguage,
                            }
                          : prev,
                      )
                    }
                    disabled={versionSettings.supportedLanguages.length === 0}
                  >
                    {versionSettings.supportedLanguages.map((lang) => (
                      <MenuItem key={lang} value={lang}>
                        {t(`exams.languages.${lang}`)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label={t('exams.admin.passPercent')}
                  type='number'
                  value={versionSettings.passPercent}
                  onChange={(e) =>
                    setVersionSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            passPercent: Number(e.target.value),
                          }
                        : prev,
                    )
                  }
                  fullWidth
                  sx={{ mb: 2 }}
                  slotProps={{
                    htmlInput: { min: 0, max: 100 },
                  }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={versionSettings.randomizeQuestionOrder}
                      onChange={(e) =>
                        setVersionSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                randomizeQuestionOrder: e.target.checked,
                              }
                            : prev,
                        )
                      }
                    />
                  }
                  label={t('exams.admin.randomizeQuestionOrder')}
                />
                <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block' }}>
                  {t('exams.admin.randomizeQuestionOrderHelp')}
                </Typography>
                <TextField
                  label={t('exams.admin.questionCount')}
                  type='number'
                  value={versionSettings.questionCount ?? ''}
                  onChange={(e) =>
                    setVersionSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            questionCount: e.target.value === '' ? null : Number(e.target.value),
                          }
                        : prev,
                    )
                  }
                  // A fixed-order exam is the whole authored set, so drawing a random
                  // subset of it is not one of the two modes the backend supports.
                  disabled={!versionSettings.randomizeQuestionOrder}
                  fullWidth
                  sx={{ mt: 2, mb: 2 }}
                  helperText={
                    versionSettings.randomizeQuestionOrder
                      ? t('exams.admin.questionCountHelp')
                      : t('exams.admin.questionCountRandomOnly')
                  }
                  slotProps={{
                    htmlInput: { min: 1 },
                  }}
                />
                <Button
                  onClick={handleSaveVersionSettings}
                  disabled={
                    savingVersionSettings || versionSettings.supportedLanguages.length === 0
                  }
                  variant='outlined'
                  sx={{ mb: 4 }}
                >
                  {t('exams.admin.saveVersionSettings')}
                </Button>
                <Divider sx={{ mb: 3 }} />
              </>
            )}

            <Typography variant='h6' gutterBottom>
              {t('exams.admin.translations')}
            </Typography>
            {transError && (
              <Alert severity='error' sx={{ mb: 2 }}>
                {transError}
              </Alert>
            )}

            {translations &&
              versionLanguages.map((lang) => (
                <Box key={lang} sx={{ mb: 2 }}>
                  <Typography variant='subtitle2' gutterBottom>
                    <Chip label={t(`exams.languages.${lang}`)} size='small' sx={{ mr: 1 }} />
                  </Typography>
                  <TextField
                    label={t('exams.admin.versionTitle')}
                    value={translations[lang].title}
                    onChange={(e) =>
                      setTranslations((prev) => ({
                        ...prev!,
                        [lang]: { ...prev![lang], title: e.target.value },
                      }))
                    }
                    fullWidth
                    sx={{ mb: 1 }}
                    size='small'
                  />
                  <TextField
                    label={t('common.description')}
                    value={translations[lang].description}
                    onChange={(e) =>
                      setTranslations((prev) => ({
                        ...prev!,
                        [lang]: { ...prev![lang], description: e.target.value },
                      }))
                    }
                    fullWidth
                    multiline
                    rows={2}
                    size='small'
                  />
                </Box>
              ))}

            <Button
              onClick={handleSaveTranslations}
              disabled={savingTrans}
              variant='outlined'
              sx={{ mb: 4 }}
            >
              {t('exams.admin.saveTranslations')}
            </Button>

            <Divider sx={{ mb: 3 }} />

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
              }}
            >
              <Typography variant='h6'>
                {t('exams.admin.questions')} ({questions.length})
              </Typography>
              {isDraft && (
                <Button
                  variant='contained'
                  startIcon={<Icon icon='mdi:plus' />}
                  onClick={handleAddQuestion}
                >
                  {t('exams.admin.addQuestion')}
                </Button>
              )}
            </Box>

            {reorderError && (
              <Alert severity='error' sx={{ mb: 2 }} onClose={() => setReorderError(null)}>
                {reorderError}
              </Alert>
            )}

            {isDraft && (questions.length > 1 || questions.some((q) => q.choices.length > 1)) && (
              <Alert severity='info' sx={{ mb: 2 }}>
                {t('exams.admin.reorderHint')}
              </Alert>
            )}

            {isDraft ? (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId={QUESTIONS_DROPPABLE_ID} type={QUESTION_DRAG_TYPE}>
                  {(dropProvided) => (
                    <Box ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                      {questions.map((q, idx) => (
                        <Draggable key={q.questionId} draggableId={q.questionId} index={idx}>
                          {(dragProvided) => (
                            <QuestionCard
                              versionId={version.versionId}
                              question={q}
                              index={idx}
                              languages={versionLanguages}
                              drag={dragProvided}
                              onChanged={() => mutate()}
                            />
                          )}
                        </Draggable>
                      ))}
                      {dropProvided.placeholder}
                    </Box>
                  )}
                </Droppable>
              </DragDropContext>
            ) : (
              questions.map((q, idx) => (
                <QuestionCard
                  key={q.questionId}
                  versionId={version.versionId}
                  question={q}
                  index={idx}
                  languages={versionLanguages}
                  onChanged={() => mutate()}
                />
              ))
            )}
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
