<script setup lang="ts">
defineOptions({ name: 'AppLayout' })
// AppLayout.vue — host 业务侧. 接入 SDK 组件 + 用 slot 填入所有"内容".
//   • FcHeader (4-slot 壳) → 塞 brand / actions / user
//   • FcSidebar (5-slot 壳 + 拖拽) → 塞 nav 内容 (<FcSidebarNav :items="...">)
//   • FcMain (壳 + 默认 <router-view>) → 无需填
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePreferenceStore } from '@/store/preference'
import { useGatewayAuthStore } from '@/store/gateway-auth'
import { useOemStore } from '@/store/oem'
import { useResponsive, watchViewport, useSidebarNavItems, NAV_DEFAULT_OPENEDS } from '@/composables'
import i18n from '@/locales'
import Avatar from '@/components/sdk/display/FcAvatar.vue'
import FcHeader from '@/components/sdk/layout/FcHeader.vue'
import FcSidebar from '@/components/sdk/layout/FcSidebar.vue'
import FcSidebarNav from '@/components/sdk/layout/FcSidebarNav.vue'
import FcMain from '@/components/sdk/layout/FcMain.vue'
import FcDrawer from '@/components/sdk/overlay/FcDrawer.vue'
import FcDialog from '@/components/sdk/overlay/FcDialog.vue'
import FcSwitch from '@/components/sdk/form/FcSwitch.vue'
import { showSuccess } from '@/utils'

const preference = usePreferenceStore()
const auth = useGatewayAuthStore()
const oem = useOemStore()
// 显示用应用名: OEM.title 优先 (常见场景), 没填则退到 companyName, 最后兜底 i18n.
// OEM.companyName 字段保留给"公司主体名"语义 (如 footer 版权); UI 标题/关于页主标题都用此 computed.
const oemCompanyName = computed(() => oem.config.title || oem.config.companyName || t('app.name'))
const oemLogo = computed(() => {
  // 暗色主题用 logoDarkUrl, 否则用 logoUrl
  return oem.config.logoUrl || ''
})
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { isMobile } = useResponsive()

// ---- About dialog + language ----
const appVersion = __APP_VERSION__
const formattedBuildTime = computed(() => {
  try {
    return new Date(__BUILD_TIME__).toLocaleString()
  } catch {
    return __BUILD_TIME__
  }
})
const isEnglish = computed<boolean>({
  get: () => preference.locale === 'en-US',
  set: (v: boolean) => {
    const next = v ? 'en-US' : 'zh-CN'
    preference.setLocale(next)
    i18n.global.locale.value = next
  },
})
const aboutVisible = ref(false)

function handleMenuCommand(command: string) {
  switch (command) {
    case 'messages':
      showSuccess(t('common.no-new-messages'))
      break
    case 'docs':
      showSuccess(t('common.docs-coming-soon'))
      break
    case 'about':
      aboutVisible.value = true
      break
    case 'logout':
      handleLogout()
      break
  }
}

async function handleLogout() {
  // 跳到独立 /logout 页, 由该页统一处理登出逻辑
  router.push('/logout')
}

// nav 数据 (项目侧工厂: 从 routes + role + feature 聚合)
const navItems = useSidebarNavItems()

// ---- Mobile drawer ----
const mobileDrawerOpen = ref(false)
const sidebarDrawerVisible = computed({
  get: () => isMobile.value && mobileDrawerOpen.value,
  set: (v: boolean) => {
    if (isMobile.value) mobileDrawerOpen.value = v
  },
})

function onToggleSidebar() {
  // 当前仅 mobile drawer 用 (来自 FcHeader.hamburger, 桌面端 fold 按钮走
  // FcSidebar 自己的 update:collapsed → preference.setSidebarCollapsed).
  if (isMobile.value) {
    mobileDrawerOpen.value = !mobileDrawerOpen.value
  }
}

// ---- Sidebar width v-model ----
const sidebarWidth = computed({
  get: () => preference.sidebarWidth,
  set: (v: number) => preference.setSidebarWidth(v),
})
const sidebarCollapsed = computed({
  get: () => preference.sidebarCollapsed,
  set: (v: boolean) => preference.setSidebarCollapsed(v),
})

function onSelectSidebar(path: string) {
  if (route.path === path) return
  router.push(path)
}

// ---- Lifecycle ----
onMounted(() => {
  if (auth.hasToken) {
    auth.init()
  }
})

onUnmounted(() => {
})

watch(
  () => route.fullPath,
  () => {
    if (isMobile.value) mobileDrawerOpen.value = false
  }
)

watchViewport(() => {
  if (!isMobile.value) mobileDrawerOpen.value = false
})
</script>

<template>
  <div class="app-shell">
    <FcHeader @toggle-sidebar="onToggleSidebar">
      <template #brand>
        <div
          class="app-logo"
          role="button"
          tabindex="0"
          :aria-label="oemCompanyName"
          @click="router.push('/')"
          @keydown.enter="router.push('/')"
          @keydown.space.prevent="router.push('/')"
        >
          <img v-if="oemLogo" class="app-logo__icon" :src="oemLogo" alt="Logo" />
          <div class="app-logo__text">
            <strong>{{ oemCompanyName }}</strong>
          </div>
        </div>
      </template>
      <template #actions>
        <button class="header-btn">
          <i class="ri-notification-3-line" />
        </button>
      </template>
      <template #user>
        <el-dropdown trigger="click" placement="bottom-end" popper-class="user-menu-popper" @command="handleMenuCommand">
          <button type="button" class="app-header__user" tabindex="0" aria-haspopup="menu">
            <Avatar :src="''" :name="auth.user?.username || ''" size="small" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="messages">
                <i class="ri-notification-3-line" />
                <span>{{ t('common.menu-messages') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="docs">
                <i class="ri-book-open-line" />
                <span>{{ t('common.menu-docs') }}</span>
              </el-dropdown-item>
              <el-dropdown-item class="user-menu__lang-item" @click.stop>
                <i class="ri-translate-2" />
                <span>{{ t('common.menu-language') }}</span>
                <FcSwitch
                  v-model="isEnglish"
                  class="user-menu__lang-switch"
                  inline-prompt
                  :active-text="t('langSwitch.en')"
                  :inactive-text="t('langSwitch.zh')"
                  size="small"
                />
              </el-dropdown-item>
              <el-dropdown-item command="about" divided>
                <i class="ri-information-line" />
                <span>{{ t('common.menu-about') }}</span>
              </el-dropdown-item>
              <!-- 退出登录: 仅 self-managed 模式 (有 accessToken) 显示 -->
              <el-dropdown-item v-if="auth.accessToken" command="logout" divided>
                <i class="ri-logout-circle-line" />
                <span>{{ t('common.menu-logout') }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </FcHeader>

    <!-- 关于对话框 -->
    <FcDialog
      v-model:open="aboutVisible"
      :title="t('common.about-title')"
      width="360px"
      append-to-body
      dialog-class="about-dialog"
    >
      <div class="about-body">
        <div class="about-app-name">{{ oemCompanyName }}</div>
        <div class="about-row">
          <span class="about-label">{{ t('common.about-version') }}</span>
          <span class="about-value">{{ appVersion }}</span>
        </div>
        <div class="about-row">
          <span class="about-label">{{ t('common.about-build-time') }}</span>
          <span class="about-value">{{ formattedBuildTime }}</span>
        </div>
        <div v-if="oem.config.footerText" class="about-row">
          <span class="about-label">{{ t('common.about-footer') }}</span>
          <span class="about-value">{{ oem.config.footerText }}</span>
        </div>
      </div>
    </FcDialog>

    <div class="app-body">
      <!-- Desktop sidebar -->
      <FcSidebar
        v-if="!isMobile"
        v-model:collapsed="sidebarCollapsed"
        :width="sidebarWidth"
        @update:width="(v: number) => (sidebarWidth = v)"
        @select="onSelectSidebar"
      >
        <FcSidebarNav
          :items="navItems"
          :active-path="route.path"
          :collapse="sidebarCollapsed"
          :default-openeds="sidebarCollapsed ? [] : NAV_DEFAULT_OPENEDS"
          @select="onSelectSidebar"
        />
      </FcSidebar>

      <!-- Mobile drawer -->
      <FcDrawer
        v-else
        v-model:open="sidebarDrawerVisible"
        direction="ltr"
        :with-header="false"
        size="240px"
        drawer-class="fc-sidebar-drawer-modal"
      >
        <FcSidebar
          :force-collapsed="false"
          :collapsed="sidebarCollapsed"
          :width="sidebarWidth"
          :enable-drag="false"
          @update:collapsed="(v: boolean) => (sidebarCollapsed = v)"
          @update:width="(v: number) => (sidebarWidth = v)"
          @select="onSelectSidebar"
        >
          <FcSidebarNav
            :items="navItems"
            :active-path="route.path"
            :collapse="false"
            :default-openeds="NAV_DEFAULT_OPENEDS"
            @select="onSelectSidebar"
          />
        </FcSidebar>
      </FcDrawer>

      <FcMain />
    </div>
  </div>
</template>

<style lang="scss">
@use '@/styles/mixins' as *;

.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-body {
  display: grid;
  grid-template-columns: auto 1fr;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.app-body > .fc-sidebar {
  grid-column: 1;
}

.app-body > main.fc-main {
  grid-column: 2;
  min-width: 0;
  width: 100%;
  padding: var(--app-main-padding-y) var(--app-main-padding-x);
}

@media (max-width: 768px) {
  .app-body {
    grid-template-columns: 1fr;
  }
  /* mobile 下 sidebar 抽屉化 + 不占布局; main 占满唯一一列 */
  .app-body > .fc-sidebar {
    display: none;
  }
  .app-body > main.fc-main {
    grid-column: 1;
  }
}

/* Brand / Logo */
.app-logo {
  display: flex;
  align-items: center;
  gap: var(--app-header-gap-logo, 10px);
  cursor: pointer;
  user-select: none;
}

.app-logo__icon {
  width: 32px;
  height: 32px;
  border-radius: var(--app-radius-md, 8px);
  object-fit: contain;
}

.app-logo__text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  strong {
    font-size: 16px;
    font-weight: 700;
    color: var(--app-text);
  }
}

/* Header actions */
.header-btn {
  background: none;
  border: none;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-sm, 8px);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    background: var(--app-sidebar-item-hover-bg);
    color: var(--app-text);
  }
  i {
    font-size: 18px;
  }
}

.app-header__user {
  @include reset-button;
  display: inline-flex;
  align-items: center;
  padding: 4px;
  cursor: pointer;
  border-radius: var(--app-radius-md, 8px);
  transition: background 0.15s;
  &:hover {
    background: var(--app-sidebar-item-hover-bg);
  }
}

.user-menu__aux {
  margin-left: auto;
  padding-left: 24px;
  color: var(--app-text-tertiary, var(--app-text-secondary));
  font-size: 12px;
}

.user-menu-popper .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  padding: 8px 16px;
  i {
    font-size: 16px;
    color: var(--app-text-secondary);
  }
}

.user-menu__lang-item {
  cursor: default;
}

.user-menu__lang-switch {
  margin-left: auto;
}

.about-dialog .about-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0 8px;
}

.about-dialog .about-app-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
  margin-bottom: 12px;
}

.about-dialog .about-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--app-header-border-color);
  font-size: 14px;
}

.about-dialog .about-row:last-child {
  border-bottom: none;
}

.about-dialog .about-label {
  color: var(--app-text-secondary);
}

.about-dialog .about-value {
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

/* Sidebar group dividers */
.app-sidebar__divider {
  list-style: none;
  margin: 10px 16px 4px;
  padding: 0;
  height: auto;
}

.app-sidebar__divider-label {
  display: block;
  font-size: 11px;
  font-weight: 900;
  color: var(--app-text-tertiary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 0;
}

@media (max-width: 768px) {
  .app-logo__text {
    display: none;
  }
}

/* Mobile sidebar drawer */
.fc-sidebar-drawer-modal .el-drawer {
  background-color: var(--el-bg-color) !important;
}
.fc-sidebar-drawer-modal .el-drawer__body {
  padding: 0;
}
</style>
