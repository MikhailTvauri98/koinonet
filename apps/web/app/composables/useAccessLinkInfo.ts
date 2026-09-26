import type { components } from '~~/types/api'
import { apiErrorCode, apiErrorMessage } from '~/utils/apiError'

export type AccessLinkInfo = components['schemas']['AccessLinkResource']
export type AccessLinkKindValue = 'invite' | 'password_reset'

// Тексты по коду ссылки — дословно из ensureUsable() и
// AccessLinkController::show() (apps/api/app/Modules/Directory/{Models/AccessLink.php,
// Http/Controllers/AccessLinkController.php}). Общие для экранов приглашения
// (`pages/invite/[token].vue`) и сброса пароля (`pages/password-reset/[token].vue`):
// один язык отказов на оба экрана, а не два разных текста на один и тот же код.
const LINK_ERROR_MESSAGES: Record<string, string> = {
  'access_link.expired': 'Срок действия ссылки истёк.',
  'access_link.used': 'Ссылка уже использована.',
  'access_link.revoked': 'Ссылка отозвана.',
  'access_link.invalid': 'Ссылка недействительна.',
}

function describeLinkError(error: unknown): string {
  const code = apiErrorCode(error)
  if (code && code in LINK_ERROR_MESSAGES) {
    return LINK_ERROR_MESSAGES[code]!
  }
  return apiErrorMessage(error, 'Не удалось открыть ссылку. Попробуйте ещё раз.')
}

/**
 * Общая загрузка `GET /access-links/{token}` для экрана приглашения и экрана
 * сброса пароля. Оба публичны и без сессии, оба показывают один набор
 * отказов и оба обязаны принимать только свой вид ссылки: `expectedKind`,
 * несовпадающий с `kind` из ответа, отказывается тем же текстом, что и
 * недействительная ссылка, — человек не должен увидеть чужую форму
 * (приглашение по ссылке сброса пароля или наоборот).
 */
export function useAccessLinkInfo(token: string, expectedKind: AccessLinkKindValue) {
  const api = useApi()

  const loading = ref(true)
  const linkError = ref<string | null>(null)
  const info = ref<AccessLinkInfo | null>(null)

  async function load() {
    try {
      const response = await api.get<{ data: AccessLinkInfo }>(`/access-links/${token}`)
      if (response.data.kind !== expectedKind) {
        linkError.value = LINK_ERROR_MESSAGES['access_link.invalid']!
        return
      }
      info.value = response.data
    } catch (error) {
      linkError.value = describeLinkError(error)
    } finally {
      loading.value = false
    }
  }

  return { loading, linkError, info, load }
}
