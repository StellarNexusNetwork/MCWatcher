<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import MultiSelect from 'primevue/multiselect'
import type { AlertSettings, PlayerRuleItem } from '@/services/alertEngine'
import { validateCronExpression } from '@/utils/cron'

const props = defineProps<{
  modelValue: boolean
  settings: AlertSettings
  servers: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [value: AlertSettings]
}>()

const local = reactive<AlertSettings>({
  whitelistMode: true,
  whitelist: [],
  blacklist: [],
  countAlertEnabled: false,
  countAlertMode: 'any_increase',
  countThreshold: 5,
  chartSegmentMinutes: 10,
  chartVisibleSegments: 35,
  historyStorageLimit: 1000,
  curveColorMode: 'latest_state',
  showStatusTrack: true,
  refreshCron: '*/10 * * * *',
  soundEnabled: true,
  systemNotifyEnabled: true,
})

const cronError = ref('')

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) {
      cronError.value = ''
      return
    }
    Object.assign(local, cloneSettings(props.settings))
    cronError.value = ''
  },
  { immediate: true },
)

function cloneSettings(input: AlertSettings): AlertSettings {
  return {
    whitelistMode: input.whitelistMode,
    whitelist: input.whitelist.map((rule) => ({
      playerId: rule.playerId,
      scope:
        rule.scope.mode === 'global'
          ? { mode: 'global' }
          : { mode: 'servers', servers: [...rule.scope.servers] },
    })),
    blacklist: input.blacklist.map((rule) => ({
      playerId: rule.playerId,
      scope:
        rule.scope.mode === 'global'
          ? { mode: 'global' }
          : { mode: 'servers', servers: [...rule.scope.servers] },
    })),
    countAlertEnabled: input.countAlertEnabled,
    countAlertMode: input.countAlertMode,
    countThreshold: input.countThreshold,
    chartSegmentMinutes: input.chartSegmentMinutes,
    chartVisibleSegments: input.chartVisibleSegments,
    historyStorageLimit: input.historyStorageLimit,
    curveColorMode: input.curveColorMode,
    showStatusTrack: input.showStatusTrack,
    refreshCron: input.refreshCron,
    soundEnabled: input.soundEnabled,
    systemNotifyEnabled: input.systemNotifyEnabled,
  }
}

function addRule(list: PlayerRuleItem[]) {
  list.push({
    playerId: '',
    scope: { mode: 'global' },
  })
}

function removeRule(list: PlayerRuleItem[], index: number) {
  list.splice(index, 1)
}

function onScopeModeChange(rule: PlayerRuleItem, mode: 'global' | 'servers') {
  if (mode === 'global') {
    rule.scope = { mode: 'global' }
  } else {
    rule.scope = { mode: 'servers', servers: [] }
  }
}

function save() {
  const cronValidation = validateCronExpression(local.refreshCron)
  if (!cronValidation.valid) {
    cronError.value = cronValidation.error
    return
  }
  cronError.value = ''

  const payload: AlertSettings = {
    ...cloneSettings(local),
    whitelist: normalizeRules(local.whitelist),
    blacklist: normalizeRules(local.blacklist),
    countThreshold: Math.max(1, Math.floor(local.countThreshold || 1)),
    chartSegmentMinutes: Math.max(1, Math.floor(local.chartSegmentMinutes || 10)),
    chartVisibleSegments: Math.max(1, Math.min(35, Math.floor(local.chartVisibleSegments || 35))),
    historyStorageLimit: Math.max(50, Math.floor(local.historyStorageLimit || 1000)),
    refreshCron: local.refreshCron.trim(),
  }
  emit('save', payload)
  visible.value = false
}

function normalizeRules(input: PlayerRuleItem[]) {
  const normalized: PlayerRuleItem[] = []
  for (const rule of input) {
    const playerId = rule.playerId.trim()
    if (!playerId) {
      continue
    }
    if (rule.scope.mode === 'global') {
      normalized.push({ playerId, scope: { mode: 'global' } })
      continue
    }
    normalized.push({
      playerId,
      scope: {
        mode: 'servers',
        servers: rule.scope.servers.filter(Boolean),
      },
    })
  }
  return normalized
}
</script>

<template>
  <Dialog v-model:visible="visible" modal header="设置" :style="{ width: 'min(980px, 94vw)' }">
    <section class="settings-grid">
      <div class="item">
        <label>刷新 Cron（5段）</label>
        <InputText v-model="local.refreshCron" placeholder="*/10 * * * *" />
        <small class="hint">格式：min hour dom mon dow</small>
        <small v-if="cronError" class="error">{{ cronError }}</small>
      </div>
      <div class="item">
        <label>每段间隔（分钟）</label>
        <InputNumber v-model="local.chartSegmentMinutes" :min="1" />
      </div>
      <div class="item">
        <label>展示段数（最多35）</label>
        <InputNumber v-model="local.chartVisibleSegments" :min="1" :max="35" />
      </div>
      <div class="item">
        <label>每服最多存储条数</label>
        <InputNumber v-model="local.historyStorageLimit" :min="50" />
      </div>
      <div class="item">
        <label>曲线着色模式</label>
        <select v-model="local.curveColorMode" class="plain-select">
          <option value="latest_state">整条按当前状态</option>
          <option value="per_segment">分段按历史状态</option>
        </select>
      </div>
      <div class="item">
        <label>显示状态条</label>
        <ToggleSwitch v-model="local.showStatusTrack" />
      </div>
      <div class="item">
        <label>白名单模式</label>
        <ToggleSwitch v-model="local.whitelistMode" />
      </div>
      <div class="item">
        <label>人数增加提醒</label>
        <ToggleSwitch v-model="local.countAlertEnabled" />
      </div>
      <div class="item">
        <label>声音提醒</label>
        <ToggleSwitch v-model="local.soundEnabled" />
      </div>
      <div class="item">
        <label>系统通知</label>
        <ToggleSwitch v-model="local.systemNotifyEnabled" />
      </div>
      <div class="item">
        <label>人数提醒模式</label>
        <select v-model="local.countAlertMode" class="plain-select">
          <option value="any_increase">任意增加</option>
          <option value="threshold">达到阈值</option>
        </select>
      </div>
      <div class="item">
        <label>人数提醒阈值</label>
        <InputNumber
          v-model="local.countThreshold"
          :min="1"
          :disabled="local.countAlertMode !== 'threshold'"
        />
      </div>
    </section>

    <section class="rules-block">
      <header>
        <h3>玩家白名单</h3>
        <Button size="small" label="添加" @click="addRule(local.whitelist)" />
      </header>
      <div v-if="!local.whitelist.length" class="empty">暂无白名单条目</div>
      <div v-for="(rule, index) in local.whitelist" :key="`w-${index}`" class="rule-row">
        <InputText v-model="rule.playerId" placeholder="玩家ID" />
        <select
          :value="rule.scope.mode"
          class="plain-select"
          @change="
            onScopeModeChange(
              rule,
              ($event.target as HTMLSelectElement).value as 'global' | 'servers',
            )
          "
        >
          <option value="global">全局</option>
          <option value="servers">指定服务器</option>
        </select>
        <MultiSelect
          v-if="rule.scope.mode === 'servers'"
          v-model="rule.scope.servers"
          :options="servers"
          placeholder="选择服务器"
          display="chip"
          filter
        />
        <Button
          severity="danger"
          size="small"
          label="删除"
          @click="removeRule(local.whitelist, index)"
        />
      </div>
    </section>

    <section class="rules-block">
      <header>
        <h3>玩家黑名单</h3>
        <Button size="small" label="添加" @click="addRule(local.blacklist)" />
      </header>
      <div v-if="!local.blacklist.length" class="empty">暂无黑名单条目</div>
      <div v-for="(rule, index) in local.blacklist" :key="`b-${index}`" class="rule-row">
        <InputText v-model="rule.playerId" placeholder="玩家ID" />
        <select
          :value="rule.scope.mode"
          class="plain-select"
          @change="
            onScopeModeChange(
              rule,
              ($event.target as HTMLSelectElement).value as 'global' | 'servers',
            )
          "
        >
          <option value="global">全局</option>
          <option value="servers">指定服务器</option>
        </select>
        <MultiSelect
          v-if="rule.scope.mode === 'servers'"
          v-model="rule.scope.servers"
          :options="servers"
          placeholder="选择服务器"
          display="chip"
          filter
        />
        <Button
          severity="danger"
          size="small"
          label="删除"
          @click="removeRule(local.blacklist, index)"
        />
      </div>
    </section>

    <template #footer>
      <Button severity="secondary" label="取消" @click="visible = false" />
      <Button label="保存" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.hint {
  color: #94a3b8;
  font-size: 12px;
}

.error {
  color: #fca5a5;
  font-size: 12px;
}

.rules-block {
  margin-top: 1rem;
}

.rules-block header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}

.rule-row {
  display: grid;
  grid-template-columns: minmax(140px, 220px) 120px 1fr auto;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.plain-select {
  height: 2.5rem;
  border-radius: 8px;
  border: 1px solid #475569;
  background: #0f172a;
  color: #e2e8f0;
  padding: 0 0.5rem;
}

.empty {
  color: #94a3b8;
  font-size: 13px;
}

@media (max-width: 920px) {
  .rule-row {
    grid-template-columns: 1fr;
  }
}
</style>
