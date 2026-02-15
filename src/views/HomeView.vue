<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import ServerRowCard from '@/components/server/ServerRowCard.vue'
import { useWatcherStore } from '@/stores/watcher'
import type { AlertSettings } from '@/services/alertEngine'

const store = useWatcherStore()
const serverInput = ref('')
const showSettings = ref(false)
const nowTs = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | null = null

const rows = computed(() => store.serverRows)
const countdownText = computed(() => {
  if (store.nextRefreshAt === null) {
    return '--:--:--'
  }
  const remainMs = Math.max(0, store.nextRefreshAt - nowTs.value)
  const totalSeconds = Math.floor(remainMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
})

function pad2(value: number) {
  return value.toString().padStart(2, '0')
}

function addServer() {
  if (!store.addServer(serverInput.value)) {
    return
  }
  serverInput.value = ''
  void store.refreshAll()
}

function removeServer(address: string) {
  store.removeServer(address)
}

function onSaveSettings(nextSettings: AlertSettings) {
  store.updateSettings(nextSettings)
}

onMounted(() => {
  countdownTimer = setInterval(() => {
    nowTs.value = Date.now()
  }, 1000)
  store.startPolling()
})

onBeforeUnmount(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  store.stopPolling()
})
</script>

<template>
  <main class="page">
    <header class="topbar">
      <div>
        <h1>MCWatcher</h1>
        <p>下一次刷新：{{ countdownText }}</p>
      </div>
      <div class="actions">
        <Button label="手动刷新" :loading="store.isRefreshing" @click="store.refreshAll('manual')" />
        <Button label="设置" severity="secondary" @click="showSettings = true" />
      </div>
    </header>

    <section class="add-row">
      <InputText
        v-model="serverInput"
        placeholder="输入服务器地址（例：mc.example.com 或 mc.example.com:25565）"
        class="add-input"
        @keyup.enter="addServer"
      />
      <Button label="添加服务器" @click="addServer" />
    </section>

    <section v-if="!rows.length" class="empty">
      还没有服务器，先添加一个地址开始监控。
    </section>

    <section v-else class="list">
      <article v-for="server in rows" :key="server.address" class="server-block">
        <div class="remove-action">
          <Button size="small" severity="danger" label="删除" @click="removeServer(server.address)" />
        </div>
        <ServerRowCard :server="server" :settings="store.settings" />
      </article>
    </section>

    <SettingsDialog
      v-model="showSettings"
      :settings="store.settings"
      :servers="store.servers"
      @save="onSaveSettings"
    />
  </main>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.topbar h1 {
  margin: 0;
  font-size: 1.8rem;
}

.topbar p {
  margin: 0.3rem 0 0;
  color: #64748b;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.add-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
}

.add-input {
  width: 100%;
}

.empty {
  border: 1px dashed #475569;
  border-radius: 12px;
  padding: 1rem;
  color: #64748b;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.server-block {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.remove-action {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 700px) {
  .topbar {
    flex-direction: column;
  }

  .actions {
    width: 100%;
  }

  .add-row {
    grid-template-columns: 1fr;
  }
}
</style>
