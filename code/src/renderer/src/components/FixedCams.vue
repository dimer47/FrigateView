<script setup>
// Caméras dont le flux HD/SD est fixé par clic droit (réglage propre, prioritaire sur le réglage général)
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useServerStore } from '@/stores/server'
const ui = useUiStore()
const server = useServerStore()
const list = computed(() => Object.entries(ui.camQuality).map(([id, q]) => ({ id, q, name: server.camById(id)?.name || id })))
const resetAll = () => { for (const { id } of list.value) ui.setCamQuality(id, null) }
</script>

<template>
  <div>
    <p v-if="!list.length" class="text-xs text-ink-3">{{ $t('quality.help.noneFixed') }}</p>
    <ul v-else class="flex flex-col">
      <li v-for="c in list" :key="c.id" class="flex items-center gap-2 border-b border-line py-1.5 text-[13px] last:border-0">
        <i class="size-1.5 rounded-full bg-ink" />
        <span class="min-w-0 flex-1 truncate">{{ c.name }}</span>
        <span class="text-ink-3">{{ $t('quality.' + c.q) }}</span>
        <button class="text-xs font-semibold text-accent" @click="ui.setCamQuality(c.id, null)">{{ $t('quality.help.reset') }}</button>
      </li>
    </ul>
    <button v-if="list.length > 1" class="mt-2 text-xs font-semibold text-accent" @click="resetAll">{{ $t('quality.help.resetAll') }}</button>
  </div>
</template>
