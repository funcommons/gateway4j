<script setup lang="ts">
/**
 * EnvironmentSwitcher — 顶栏环境切换器（H7b T1）。
 *
 * 定位口径：这是管理面「视图过滤 + 路由归属环境」选择，不是数据面切换
 * （数据面环境属于网关进程配置）——tooltip 固定说明。
 *
 * 降级：GET /v1/environments 404 / 失败 → 整个切换器不渲染；
 * 单环境（仅 default）→ 无可切换项，同样不渲染。
 * 切换后只改 Pinia + localStorage（gw4j_env），路由列表 / 大盘 watch 后自行带参刷新。
 */
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { FcSelect, FcTooltip } from '@/components'
import { useEnvironments } from '@/store/environment'

defineOptions({ name: 'EnvironmentSwitcher' })

const { t } = useI18n()
const env = useEnvironments()

onMounted(() => { env.ensureLoaded() })

function onChange(v: unknown) {
  if (typeof v === 'string') env.setCurrent(v)
}
</script>

<template>
  <div
    v-if="env.switchable"
    class="env-switcher"
    data-testid="env-switcher"
  >
    <FcTooltip :content="t('env.switcherTip')" placement="bottom">
      <FcSelect
        class="env-switcher__select"
        size="small"
        :model-value="env.current"
        :options="env.options"
        :aria-label="t('env.switcherLabel')"
        :placeholder="t('env.switcherLabel')"
        data-testid="env-switcher-select"
        @update:model-value="onChange"
      />
    </FcTooltip>
  </div>
</template>

<style scoped>
.env-switcher {
  display: flex;
  align-items: center;
}
.env-switcher__select {
  width: 130px;
}
</style>
