import useApi from '../../hooks/useApi'
import type { MemberSyllabusDetail } from './dtoApi'

/**
 * Fetches the active DTO syllabus assignment for the currently authenticated
 * member. Pass `skipFetch = true` to skip the network request (e.g. when the
 * user is known not to need this — instructors / admins).
 */
export function useMyDtoSyllabus(skipFetch = false) {
  const { data, isLoading } = useApi<MemberSyllabusDetail | null>({
    url: 'v1/dto/me/syllabus',
    skipFetch,
  })
  return {
    activeSyllabus: data ?? null,
    isLoading,
  }
}
