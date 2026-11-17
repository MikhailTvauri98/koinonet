<script setup lang="ts">
import AnnouncementList from '~/components/announcements/AnnouncementList.vue'
import MinistryHeader from '~/components/ministries/MinistryHeader.vue'
const route = useRoute()
const ministryId = computed(() => String(route.params.id))
const { ministry, error, load } = useMinistry(ministryId)
</script>

<template>
  <div><MinistryHeader :ministry="ministry" :ministry-id="ministryId" :error="error" @updated="ministry = $event" @retry="load" /><AnnouncementList :key="ministryId" :ministry-id="ministryId" /></div>
</template>
