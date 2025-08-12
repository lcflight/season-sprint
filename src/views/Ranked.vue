<template>
  <section>
    <LineGraph storageKey="ranked" />
  </section>
</template>

<script>
import LineGraph from '@/components/LineGraph.vue'
export default { name: 'RankedView', components: { LineGraph } }
</script>

