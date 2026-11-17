<script setup lang="ts">
import MediaUploader from '~/components/MediaUploader.vue'
import MinistryColorField from '~/components/ministries/MinistryColorField.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
import UiDialog from '~/components/ui/UiDialog.vue'
import { membersCountLabel, type Ministry } from '~/utils/ministries'
import { apiErrorMessage } from '~/utils/apiError'
import { MINISTRY_COLORS, ministryColorVar, type MinistryColorKey } from '~/utils/ministryColor'

// Шапка служения одна на все вкладки: заголовок страницы — всегда название,
// вкладки под ним. Пока служение не загружено (`ministry` = null), видны путь
// назад и вкладки. Управление живёт в меню «⋯» и в каждом пункте требует своего
// существующего права; записи делает сама шапка и отдаёт странице готовое служение.
const props = defineProps<{ ministry: Ministry | null, ministryId: string, compact?: boolean, error?: string }>()
const emit = defineEmits<{ updated: [ministry: Ministry], retry: [] }>()

type Panel = 'menu' | 'edit' | 'cover' | 'color' | 'archive'
const api = useApi(), auth = useAuthStore()
const { can, canIn } = useCan()
const panel = ref<Panel | null>(null)
const name = ref(''), description = ref(''), color = ref<MinistryColorKey | null>(null)
const saving = ref(false), uploading = ref(false), archiving = ref(false)
const formError = ref(''), colorError = ref(''), archiveError = ref('')
const nameInput = ref<HTMLInputElement>(), colorField = ref<InstanceType<typeof MinistryColorField>>(), notice = ref<HTMLElement>()
let active = true, editOperation = 0, archiveOperation = 0, menuRevision = 0

const archived = computed(() => !!props.ministry?.archived_at)
const canEdit = computed(() => !!props.ministry && canIn(props.ministry.id, 'ministry.edit'))
const canArchive = computed(() => !!props.ministry && can('ministries.create') && !archived.value)
const hasMenu = computed(() => canEdit.value || canArchive.value)
const needsColor = computed(() => canEdit.value && !archived.value && !!props.ministry && !props.ministry.color)
const letter = computed(() => Array.from(props.ministry?.name.trim() ?? '')[0]?.toLocaleUpperCase('ru-RU') ?? '')

onBeforeUnmount(() => { active = false; editOperation++; archiveOperation++; menuRevision++ })
function current(session: number, id: string) { return active && session === auth.sessionVersion && id === props.ministryId }

function closePanel() { panel.value = null }
async function openPanel(next: Exclude<Panel, 'menu'>) {
  if (!props.ministry) return
  if (next === 'archive' ? !canArchive.value : !canEdit.value || archived.value) return
  if (next === 'edit') { name.value = props.ministry.name; description.value = props.ministry.description ?? ''; formError.value = '' }
  if (next === 'color') { color.value = MINISTRY_COLORS.find(item => item.key === props.ministry?.color)?.key ?? null; colorError.value = '' }
  if (next === 'archive') archiveError.value = ''
  if (next === 'cover') uploading.value = false
  const token = menuRevision
  // Меню закрывается раньше: фокус возвращается на «⋯», а следующее окно запоминает его как место возврата.
  closePanel()
  await nextTick()
  if (token !== menuRevision) return
  panel.value = next
  await nextTick()
  if (next === 'edit') nameInput.value?.focus({ preventScroll: true })
  else if (next === 'color') colorField.value?.focus()
}

watch(canEdit, (allowed) => {
  if (allowed) return
  editOperation++; saving.value = false; uploading.value = false; menuRevision++
  if (panel.value === 'edit' || panel.value === 'cover' || panel.value === 'color') closePanel()
}, { flush: 'sync' })
watch(canArchive, (allowed) => {
  if (allowed) return
  archiveOperation++; archiving.value = false; menuRevision++
  if (panel.value === 'archive') closePanel()
}, { flush: 'sync' })
watch(hasMenu, (available) => { if (!available) { menuRevision++; if (panel.value === 'menu') closePanel() } }, { flush: 'sync' })
watch(() => props.ministryId, () => { editOperation++; archiveOperation++; menuRevision++; saving.value = false; uploading.value = false; archiving.value = false; closePanel() }, { flush: 'sync' })

async function patch(payload: Record<string, unknown>, fallback: string, failed: (message: string) => void) {
  if (saving.value || archiving.value || !canEdit.value || archived.value) return
  const token = ++editOperation, session = auth.sessionVersion, id = props.ministryId
  saving.value = true
  try {
    const response = await api.patch<{ data: Ministry }>(`/ministries/${encodeURIComponent(id)}`, payload)
    if (!(token === editOperation && current(session, id)) || !canEdit.value) return
    emit('updated', response.data)
    closePanel()
  } catch (error) {
    if (token === editOperation && current(session, id) && canEdit.value) failed(apiErrorMessage(error, fallback))
  } finally {
    if (token === editOperation && current(session, id)) saving.value = false
  }
}
async function saveDetails() {
  if (!name.value.trim()) { formError.value = 'Заполните название.'; nameInput.value?.focus(); return }
  formError.value = ''
  await patch({ name: name.value.trim(), description: description.value.trim() || null }, 'Не удалось сохранить служение. Попробуйте ещё раз.', (message) => { formError.value = message })
}
async function saveColor() {
  if (!color.value) { colorError.value = 'Выберите цвет'; colorField.value?.focus(); return }
  colorError.value = ''
  await patch({ color: color.value }, 'Не удалось сохранить цвет. Попробуйте ещё раз.', (message) => { colorError.value = message })
}
function onCoverAttached(updated: Ministry) {
  if (updated.id === props.ministryId && canEdit.value) { emit('updated', updated); closePanel() }
}
async function archive() {
  if (archiving.value || saving.value || !canArchive.value) return
  const token = ++archiveOperation, session = auth.sessionVersion, id = props.ministryId
  archiving.value = true; archiveError.value = ''
  try {
    const response = await api.post<{ data: Ministry }>(`/ministries/${encodeURIComponent(id)}/archive`)
    if (!(token === archiveOperation && current(session, id)) || !canArchive.value) return
    emit('updated', response.data)
    closePanel()
    await nextTick(); await nextTick()
    notice.value?.focus()
  } catch (error) {
    if (token === archiveOperation && current(session, id) && canArchive.value) archiveError.value = apiErrorMessage(error, 'Не удалось архивировать служение. Попробуйте ещё раз.')
  } finally {
    if (token === archiveOperation && current(session, id)) archiving.value = false
  }
}
</script>

<template>
  <header class="ministry-header" :class="{ 'ministry-header--compact': compact }">
    <!-- На вкладке чата место дорого: путь назад даёт стрелка чата и навигация. -->
    <nav v-if="!compact" class="ministry-header__back" aria-label="Путь к странице"><NuxtLink to="/ministries">‹ Служения</NuxtLink></nav>
    <template v-if="ministry">
      <div class="ministry-header__row">
        <img v-if="ministry.cover_url" class="ministry-header__mark" :src="ministry.cover_url" alt="" data-test="ministry-cover">
        <span v-else class="ministry-header__mark ministry-header__tile ui-tinted" :style="{ '--tint-color': ministryColorVar(ministry) }" aria-hidden="true" data-test="ministry-tile">{{ letter }}</span>
        <div class="ministry-header__text">
          <h1>{{ ministry.name }}</h1>
          <p v-if="ministry.description && !compact" class="ministry-header__description" data-test="ministry-description">{{ ministry.description }}</p>
          <p class="ministry-header__count" data-test="members-count">{{ membersCountLabel(ministry.members_count) }}</p>
        </div>
        <div class="ministry-header__actions">
          <slot name="actions" />
          <button v-if="hasMenu" type="button" class="ui-button ui-button--quiet ministry-header__menu" data-test="ministry-menu" aria-label="Действия со служением" aria-haspopup="dialog" :aria-expanded="panel === 'menu'" @click="panel = 'menu'"><span aria-hidden="true">⋯</span></button>
        </div>
      </div>
      <p v-if="archived" ref="notice" tabindex="-1" class="ministry-header__notice ui-surface-muted" data-test="archived-notice">В архиве</p>
      <p v-if="needsColor && !compact" class="ministry-header__hint ui-surface-muted" data-test="color-hint"><button type="button" class="ui-button ui-button--quiet" data-test="choose-color" @click="openPanel('color')">Выберите цвет служения</button></p>

      <UiDialog v-if="panel === 'menu' && hasMenu" :open="true" label="Действия со служением" @close="closePanel">
        <h2>Действия со служением</h2>
        <div class="ministry-menu">
          <p v-if="archived && canEdit" class="ministry-menu__hint">Архивное служение изменить нельзя.</p>
          <button v-if="canEdit" type="button" class="ui-button" data-test="edit-ministry" :disabled="archived" @click="openPanel('edit')">Изменить название и описание</button>
          <button v-if="canEdit" type="button" class="ui-button" data-test="edit-cover" :disabled="archived" @click="openPanel('cover')">Обложка</button>
          <button v-if="canEdit" type="button" class="ui-button" data-test="edit-color" :disabled="archived" @click="openPanel('color')">Цвет</button>
          <button v-if="canArchive" type="button" class="ui-button ui-button--danger" data-test="archive" @click="openPanel('archive')">Архивировать</button>
        </div>
        <template #actions><button type="button" class="ui-button" @click="closePanel">Закрыть</button></template>
      </UiDialog>

      <UiDialog v-if="panel === 'edit' && canEdit" :open="true" label="Название и описание служения" @close="!saving && closePanel()">
        <h2>Название и описание</h2>
        <form data-test="ministry-form" @submit.prevent="saveDetails">
          <fieldset class="ministry-form" :disabled="saving">
            <legend class="visually-hidden">Данные служения</legend>
            <label>Название<input ref="nameInput" v-model="name" name="name" type="text" maxlength="100" required :aria-describedby="formError ? 'edit-ministry-error' : undefined"></label>
            <label>Описание<textarea v-model="description" name="description" rows="3" /></label>
          </fieldset>
          <p v-if="formError" id="edit-ministry-error" role="alert" class="ministry-form__error">{{ formError }}</p>
          <div class="ministry-form__actions">
            <button type="submit" class="ui-button ui-button--primary" data-test="save-ministry" :disabled="saving">Сохранить</button>
            <button type="button" class="ui-button" data-test="cancel-edit-ministry" :disabled="saving" @click="closePanel">Отмена</button>
          </div>
        </form>
      </UiDialog>

      <UiDialog v-if="panel === 'cover' && canEdit" :open="true" label="Обложка служения" @close="!uploading && closePanel()">
        <h2>Обложка</h2>
        <!-- Ключ по служению: загрузка, начатая в одном служении, не привяжет файл к другому. -->
        <MediaUploader :key="ministryId" purpose="ministry_cover" :target="`/ministries/${encodeURIComponent(ministryId)}/cover`" label="Изменить обложку" :disabled="archived" disabled-reason="Архивное служение изменить нельзя." @busy="uploading = $event" @attached="onCoverAttached" />
        <template #actions><button type="button" class="ui-button" :disabled="uploading" @click="closePanel">Закрыть</button></template>
      </UiDialog>

      <UiDialog v-if="panel === 'color' && canEdit" :open="true" label="Цвет служения" @close="!saving && closePanel()">
        <h2>Цвет служения</h2>
        <form data-test="color-form" @submit.prevent="saveColor">
          <MinistryColorField ref="colorField" v-model="color" hide-legend :error="colorError" :disabled="saving" @update:model-value="colorError = ''" />
          <div class="ministry-form__actions">
            <button type="submit" class="ui-button ui-button--primary" data-test="save-color" :disabled="saving">Сохранить</button>
            <button type="button" class="ui-button" data-test="cancel-color" :disabled="saving" @click="closePanel">Отмена</button>
          </div>
        </form>
      </UiDialog>

      <UiDialog v-if="panel === 'archive' && canArchive" :open="true" role="alertdialog" label="Подтверждение архивации" @close="!archiving && closePanel()">
        <h2>Архивировать служение?</h2>
        <div role="group" aria-label="Подтверждение архивации">
          <p>Оно исчезнет из активного списка, история сохранится.</p>
          <p v-if="archiveError" role="alert" class="ministry-form__error">{{ archiveError }}</p>
          <div class="ministry-form__actions">
            <button type="button" class="ui-button ui-button--danger" data-test="confirm-archive" :disabled="archiving" @click="archive">Подтвердить архивацию</button>
            <button type="button" class="ui-button" data-test="cancel-archive" :disabled="archiving" @click="closePanel">Отмена</button>
          </div>
        </div>
      </UiDialog>
    </template>
    <template v-else>
      <!-- Пока служение не загружено, страница всё равно имеет заголовок. -->
      <h1 class="ministry-header__fallback">Служение</h1>
      <p v-if="error" role="alert" class="ministry-form__error">{{ error }} <button type="button" class="ui-button" data-test="retry-ministry" @click="emit('retry')">Повторить</button></p>
    </template>
    <MinistryTabs :ministry-id="ministryId" :chat-id="ministry ? ministry.chat_id : undefined" :members-count="ministry?.members_count" />
  </header>
</template>

<style scoped>
.ministry-header { min-width: 0; margin-bottom: var(--ui-space-4); }
.ministry-header__back { margin-bottom: var(--ui-space-3); font-size: .875rem; }
.ministry-header__back a { display: inline-flex; align-items: center; min-height: 44px; color: var(--ui-text-muted); }
.ministry-header__row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--ui-space-3) var(--ui-space-4); }
.ministry-header__mark { flex: none; width: 64px; height: 64px; border-radius: var(--ui-radius-md); object-fit: cover; }
.ministry-header__tile { display: grid; place-items: center; font-size: 1.5rem; font-weight: 700; line-height: 1; }
.ministry-header__text { flex: 1 1 14rem; min-width: 0; }
.ministry-header h1 { margin: 0; overflow-wrap: anywhere; }
.ministry-header__description { margin: var(--ui-space-2) 0 0; overflow-wrap: anywhere; }
.ministry-header__count { margin: var(--ui-space-1) 0 0; color: var(--ui-text-muted); font-size: .875rem; }
.ministry-header__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2); min-width: 0; max-width: 100%; }
.ministry-header__menu { min-width: 44px; min-height: 44px; font-size: 1.5rem; line-height: 1; }
.ministry-header__notice, .ministry-header__hint { margin: var(--ui-space-3) 0 0; padding: var(--ui-space-2) var(--ui-space-3); border-radius: var(--ui-radius-sm); }
.ministry-header__hint { padding: var(--ui-space-1) var(--ui-space-2); }
.ministry-menu { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ministry-menu button { text-align: start; min-height: 44px; }
.ministry-menu__hint { margin: 0; color: var(--ui-text-muted); font-size: .875rem; }
.ministry-form { min-width: 0; border: 0; padding: 0; margin: 0; display: grid; gap: var(--ui-space-3); }
.ministry-form__actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin-top: var(--ui-space-4); }
.ministry-form__error { color: var(--ui-danger); }
/* Вкладка чата: одна строка шапки, чтобы поле ввода оставалось на экране в коротком окне. */
.ministry-header--compact { margin-bottom: 0; }
.ministry-header--compact .ministry-header__row { flex-wrap: nowrap; align-items: center; gap: var(--ui-space-3); }
.ministry-header--compact .ministry-header__mark { width: 40px; height: 40px; font-size: 1.125rem; }
.ministry-header--compact h1 { font-size: 1.25rem; }
.ministry-header--compact .ministry-header__text { flex: 1 1 0; }
.ministry-header--compact .ministry-header__count { margin-top: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
