import type { components } from '~~/types/api'

export type Announcement = components['schemas']['AnnouncementResource']
export interface AnnouncementListResponse {
  data: Announcement[]
  meta: { current_page: number, last_page: number, total: number }
}
