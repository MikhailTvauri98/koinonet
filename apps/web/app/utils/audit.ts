// Журнал хранит коды действий и видов объектов (`AuditLogger::record` в
// apps/api), человеку они показываются словами из словаря (CONTEXT.md).
// Код без названия показывается как есть: новое действие сервера не должно
// пропасть с экрана только потому, что клиент о нём ещё не знает.
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  'person.created': 'Создание человека',
  'person.archived': 'Архивация человека',
  'person.restored': 'Возврат человека из архива',
  'person.erased': 'Стирание персональных данных',
  'person.roles_changed': 'Изменение глобальных ролей человека',
  'person.invited': 'Приглашение',
  'person.password_reset_link_created': 'Ссылка сброса пароля',
  'user.disabled': 'Отключение аккаунта',
  'user.enabled': 'Включение аккаунта',
  'user.login_changed': 'Смена логина',
  'role.created': 'Создание роли',
  'role.updated': 'Изменение роли',
  'role.deleted': 'Удаление роли',
  'ministry.created': 'Создание служения',
  'ministry.archived': 'Архивация служения',
  'member.added': 'Добавление участника',
  'member.removed': 'Исключение участника',
  'member.roles_changed': 'Изменение ролей участника',
  'settings.changed': 'Изменение настроек церкви',
}

// Вид объекта — имя модели в snake_case (`AuditLogger::record`).
export const AUDIT_SUBJECT_LABELS: Readonly<Record<string, string>> = {
  person: 'Человек',
  user: 'Аккаунт',
  role: 'Роль',
  ministry: 'Служение',
  ministry_member: 'Участие',
}

export function auditActionLabel(code: string): string {
  return AUDIT_ACTION_LABELS[code] ?? code
}

export function auditSubjectLabel(type: string): string {
  return AUDIT_SUBJECT_LABELS[type] ?? type
}
