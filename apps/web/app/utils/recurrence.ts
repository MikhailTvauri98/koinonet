import type { components } from '~~/types/api'
export type Recurrence = components['schemas']['EventTemplateResource']['recurrence']
export const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const weekly = ['Каждый понедельник', 'Каждый вторник', 'Каждую среду', 'Каждый четверг', 'Каждую пятницу', 'Каждую субботу', 'Каждое воскресенье']
const biweekly = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям']
const ordinals = {
  masculine: ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый', 'Последний'],
  feminine: ['Первая', 'Вторая', 'Третья', 'Четвёртая', 'Пятая', 'Последняя'],
  neuter: ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Пятое', 'Последнее'],
}
export function recurrenceLabel(rule: Recurrence): string {
  if (!rule) return 'Без повторения'
  const day = rule.weekday - 1
  if (rule.type === 'weekly') return weekly[day] ?? ''
  if (rule.type === 'biweekly') return `Раз в две недели по ${biweekly[day]}`
  const gender = rule.weekday === 7 ? 'neuter' : [3, 5, 6].includes(rule.weekday) ? 'feminine' : 'masculine'
  return `${ordinals[gender][rule.nth === -1 ? 5 : rule.nth - 1]} ${weekdays[day]?.toLowerCase()} месяца`
}
