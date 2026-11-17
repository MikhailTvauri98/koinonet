<script setup lang="ts">
import AnnouncementList from '~/components/announcements/AnnouncementList.vue'
import MinistryHeader from '~/components/ministries/MinistryHeader.vue'
const route = useRoute()
const ministryId = computed(() => String(route.params.id))
const { ministry } = useMinistry(ministryId)
</script>

<template>
  <div><MinistryHeader :ministry="ministry" :ministry-id="ministryId" @updated="ministry = $event" /><AnnouncementList :key="ministryId" :ministry-id="ministryId" /></div>
</template>
