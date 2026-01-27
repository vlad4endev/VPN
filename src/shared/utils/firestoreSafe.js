/**
 * Удаляет из объекта все поля со значением undefined.
 * Firestore не принимает undefined — при setDoc/updateDoc возникает ошибка.
 * Рекурсивно обрабатывает вложенные объекты и элементы массивов-объектов.
 *
 * @param {any} value - Значение (объект, массив, примитив)
 * @returns {any} Копия без undefined-полей; примитивы и null возвращаются как есть
 */
export function stripUndefinedForFirestore(value) {
  if (value === undefined) {
    return undefined
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedForFirestore(item))
  }
  // Дата и Firestore Timestamp не разбираем рекурсивно
  if (value instanceof Date || (value && typeof value.toDate === 'function')) {
    return value
  }
  const out = {}
  for (const key of Object.keys(value)) {
    const v = value[key]
    if (v === undefined) continue
    const cleaned = stripUndefinedForFirestore(v)
    if (cleaned !== undefined) {
      out[key] = cleaned
    }
  }
  return out
}
