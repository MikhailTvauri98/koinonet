<script setup lang="ts">
import AnnouncementList from '~/components/announcements/AnnouncementList.vue'
import MinistryTabs from '~/components/ministries/MinistryTabs.vue'
const route = useRoute()
const ministryId = computed(() => String(route.params.id))
</script>

<template>
  <div><h1>Объявления служения</h1><MinistryTabs :ministry-id="ministryId" /><AnnouncementList :key="ministryId" :ministry-id="ministryId" /></div>
</template>
