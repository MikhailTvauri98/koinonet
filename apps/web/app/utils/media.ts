import type { components } from '~~/types/api'

export type MediaLike = components['schemas']['MediaResource']
export type MediaPurpose = components['schemas']['MediaPurpose']

// Ресурс, которым отвечает эндпоинт прямой привязки файла этого назначения
// (`PUT /me/photo`, `PUT /people/{id}/photo`, `PUT /ministries/{id}/cover`).
export interface DirectLinkResources {
  person_photo: components['schemas']['PersonResource']
  ministry_cover: components['schemas']['MinistryResource']
  chat_avatar: components['schemas']['ChatResource']
}
export type DirectLinkPurpose = keyof DirectLinkResources & MediaPurpose
