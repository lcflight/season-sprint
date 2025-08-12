<template>
  <section>
    <LineGraph storageKey="world-tour" />
  </section>
</template>

<script>
import LineGraph from '@/components/LineGraph.vue'
export default { name: 'WorldTourView', components: { LineGraph } }
</script>

