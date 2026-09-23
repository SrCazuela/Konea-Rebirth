const MAX_COURSE_NAME_CHARACTERS = 300

function truncateCourseName(value: string) {
  return Array.from(value).slice(0, MAX_COURSE_NAME_CHARACTERS).join('')
}

export function cleanCourseName(value: string) {
  return truncateCourseName(
    value.normalize('NFKC').trim().replaceAll(/\s+/gu, ' '),
  )
}

export function normalizeCourseName(value: string) {
  return truncateCourseName(cleanCourseName(value).toLocaleLowerCase('es-CL'))
}
