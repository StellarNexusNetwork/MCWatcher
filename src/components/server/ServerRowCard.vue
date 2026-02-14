<script setup lang="ts">
import { computed, ref } from 'vue'
import { VueDataUi } from 'vue-data-ui'
import { getAvatarUrl } from '@/services/mcApi'
import type { ServerRuntime } from '@/stores/watcher'

const props = defineProps<{
  server: ServerRuntime
}>()

const brokenAvatarNames = ref(new Set<string>())
const statusTextMap = {
  online: '在线',
  offline: '离线',
  api_error: 'API异常',
} as const

const sparkDataset = computed(() =>
  props.server.history.map((item) => ({
    period: item.ts,
    value: typeof item.online === 'number' ? item.online : 0,
  })),
)

const sparkConfig = computed(() => ({
  type: 'line',
  style: {
    backgroundColor: 'transparent',
    chartWidth: 320,
    line: {
      color: '#16a34a',
      strokeWidth: 1.8,
      smooth: true,
    },
    area: {
      show: true,
      useGradient: true,
      color: '#4ade80',
      opacity: 20,
    },
    plot: { show: false },
    tooltip: { show: false },
    title: { show: false },
    dataLabel: { show: false },
    zeroLine: { color: '#334155', strokeWidth: 1 },
  },
}))

const playerPairs = computed(() => {
  if (!props.server.playersDataValid) {
    return []
  }
  return props.server.players
})

function statusClass(state: ServerRuntime['state']) {
  if (state === 'online') return 'status status-online'
  if (state === 'offline') return 'status status-offline'
  return 'status status-api'
}

function statusTrackClass(state: ServerRuntime['state']) {
  if (state === 'online') return 'track track-online'
  if (state === 'offline') return 'track track-offline'
  return 'track track-api'
}

function avatarSrc(name: string) {
  if (brokenAvatarNames.value.has(name)) {
    // TODO: Replace this with a real placeholder avatar URL.
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="100%" height="100%" fill="%23334155"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="%23cbd5e1">N/A</text></svg>'
  }
  return getAvatarUrl(name)
}

function onAvatarError(name: string) {
  brokenAvatarNames.value.add(name)
}
</script>

<template>
  <article class="server-row">
    <section class="left">
      <img class="favicon" :src="server.faviconUrl" alt="server icon" />
      <div class="server-meta">
        <div class="server-head">
          <strong>{{ server.address }}</strong>
          <span :class="statusClass(server.state)">{{ statusTextMap[server.state] }}</span>
          <span v-if="server.online !== null && server.max !== null" class="count">
            {{ server.online }}/{{ server.max }}
          </span>
        </div>
        <p class="motd" v-html="server.motdHtmlSafe || server.motdText || '暂无 MOTD'" />
      </div>
    </section>

    <section class="middle">
      <VueDataUi component="VueUiSparkline" :dataset="sparkDataset" :config="sparkConfig" />
      <div class="status-track">
        <span
          v-for="point in server.history"
          :key="point.ts"
          :class="statusTrackClass(point.state)"
          :title="new Date(point.ts).toLocaleString()"
        />
      </div>
    </section>

    <section class="right">
      <div v-if="!server.playersDataValid" class="no-data">无数据</div>
      <ul v-else class="players">
        <li v-for="name in playerPairs" :key="name" class="player-item">
          <img :src="avatarSrc(name)" alt="avatar" @error="onAvatarError(name)" />
          <span>{{ name }}</span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.server-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.5fr) minmax(230px, 1fr) minmax(220px, 1fr);
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #0f172a;
}

.left {
  display: flex;
  gap: 0.8rem;
}

.favicon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  background: #1e293b;
  border: 1px solid #334155;
}

.server-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.server-meta {
  min-width: 0;
}

.motd {
  margin: 0.4rem 0 0;
  color: #cbd5e1;
  white-space: pre-wrap;
  line-height: 1.2;
}

.status {
  font-size: 12px;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  font-weight: 600;
}

.status-online {
  background: #14532d;
  color: #86efac;
}

.status-offline {
  background: #7f1d1d;
  color: #fca5a5;
}

.status-api {
  background: #854d0e;
  color: #fde68a;
}

.count {
  color: #94a3b8;
  font-size: 12px;
}

.middle {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.5rem;
}

.status-track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(4px, 1fr);
  gap: 2px;
}

.track {
  height: 6px;
  border-radius: 999px;
}

.track-online {
  background: #22c55e;
}

.track-offline {
  background: #ef4444;
}

.track-api {
  background: #facc15;
}

.right {
  min-width: 0;
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem 0.65rem;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 13px;
  color: #e2e8f0;
}

.player-item img {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid #334155;
}

.no-data {
  color: #94a3b8;
  font-size: 13px;
}

@media (max-width: 980px) {
  .server-row {
    grid-template-columns: 1fr;
  }
}
</style>
