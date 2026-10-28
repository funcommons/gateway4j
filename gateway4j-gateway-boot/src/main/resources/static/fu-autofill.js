/**
 * AutoFill Injection Script
 * -------------------------
 * 功能：注入到目标页面，自动解密凭据并填充到指定的输入框。
 * 兼容性：支持 SPA (React/Vue/Angular)、动态弹窗、懒加载 DOM。
 * * 使用方法：
 * 后端读取此文件内容，将 {{ENCRYPTED_CONFIG}} 替换为 Base64 后的 JSON 配置，
 * 然后将其注入到 HTML 的 </body> 之前。
 */

(function() {
    'use strict';

    // ============================================================
    // 1. 配置与常量
    // ============================================================
    const CONFIG_ID = '__autofill_secret'; // 隐藏 DIV 的 ID
    const MAX_ATTEMPTS = 20;               // 轮询最大次数 (配合定时器)
    const CHECK_INTERVAL = 500;            // 轮询间隔 (ms)
    const TIMEOUT = 15000;                 // MutationObserver 总超时时间 (ms)

    let observer = null;
    let checkTimer = null;
    let attempts = 0;

    // 日志前缀
    const log = (msg) => console.log(`[AutoFill] ${msg}`);
    const err = (msg) => console.error(`[AutoFill] ${msg}`);

    // ============================================================
    // 2. 核心工具函数
    // ============================================================

    /**
     * React 兼容性核心：绕过 React 的事件合成机制，直接调用原生 Setter
     * 解决：React 重写了 input 的 value setter，直接 .value = xx 不会触发 React 的 onChange
     */
    function setNativeValue(element, value) {
        const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

        if (valueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else {
            valueSetter.call(element, value);
        }
    }

    /**
     * 触发完整的输入事件链
     * 顺序：focus -> input -> change -> blur
     */
    function triggerEvents(element) {
        element.dispatchEvent(new Event('focus', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    /**
     * 安全隐藏元素（视觉隐藏，保留占位，防止布局崩塌）
     * [修改] 仅做 CSS 视觉隐藏，不修改 type 属性，不设置 readonly，最大程度避免 JS 报错。
     */
    function hideSecureElement(element) {
        if (!element) return;
        try {
            // 1. 视觉隐藏：透明度设为极低 (不用 display:none 是为了防止某些前端框架报错)
            element.style.opacity = '0.01';

            // 2. 禁止交互：防止鼠标点击
            element.style.pointerEvents = 'none';

            // 3. 移出焦点序列：防止 Tab 键选中
            element.tabIndex = -1;

            // [已移除] 强制修改 type 为 password (可能导致 TypeError)
            // [已移除] 设置 readonly (可能影响提交逻辑)
        } catch (e) {
            console.warn('[AutoFill] Failed to hide element fully', e);
        }
    }

    /**
     * 安全填值
     */
    function fillInput(element, value) {
        if (!element || element.value === value) return false;

        try {
            // 1. 尝试使用 React Hack 方式赋值
            setNativeValue(element, value);
        } catch (e) {
            // 2. 回退到普通赋值
            element.value = value;
        }

        // 3. 触发事件让框架感知
        triggerEvents(element);
        return true;
    }

    /**
     * 根据选择器查找元素 (支持 CSS 和 XPath)
     * 格式： "css:#username" 或 "xpath://input[@name='user']"
     */
    function findElement(selectorStr) {
        if (!selectorStr) return null;

        const [type, ...rest] = selectorStr.split(':');
        const selector = rest.join(':'); // 重新组合剩余部分，防止选择器本身含冒号

        if (type.toLowerCase() === 'xpath') {
            const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return result.singleNodeValue;
        } else {
            return document.querySelector(selector);
        }
    }

    /**
     * Base64 解码 (支持 UTF-8 中文)
     * 解决 atob() 直接解码中文乱码的问题
     */
    function b64DecodeUnicode(str) {
        try {
            return decodeURIComponent(atob(str).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        } catch (e) {
            err('Base64 decode failed: ' + e.message);
            return null;
        }
    }

    // ============================================================
    // 3. 业务逻辑
    // ============================================================

    function executeAutoFill(config) {
        // 检查当前路径是否为配置的登录页（支持 SPA 客户端路由跳转后再填充）
        if (config.url && window.location.pathname !== config.url) {
            return false;
        }

        let uFilled = false;
        let pFilled = false;

        const userEl = findElement(config.usernameSelector);
        const passEl = findElement(config.passwordSelector);

        if (userEl) {
            uFilled = fillInput(userEl, config.username);
            if (uFilled) log('Username filled.');
        }

        if (passEl) {
            // 在填充前/后执行隐藏操作
            hideSecureElement(passEl);

            pFilled = fillInput(passEl, config.password);
            if (pFilled) log('Password filled and hidden.');
        }

        // 只有当账号和密码都找到并填充后，才视为完成
        if (uFilled && pFilled) {
            return true;
        }
        return false;
    }

    function cleanUp() {
        if (observer) observer.disconnect();
        if (checkTimer) clearInterval(checkTimer);

        // 移除包含凭据的 DOM 节点
        const secretDiv = document.getElementById(CONFIG_ID);
        if (secretDiv) secretDiv.remove();

        log('Cleaned up and finished.');
    }

    // 填充成功后守卫 3 秒，防止 SPA re-render 清空已填充的值
    function startValueGuard(config) {
        const end = Date.now() + 3000;
        const guard = setInterval(() => {
            if (Date.now() > end) { clearInterval(guard); return; }
            const u = findElement(config.usernameSelector);
            const p = findElement(config.passwordSelector);
            if (u && u.value !== config.username) fillInput(u, config.username);
            if (p && p.value !== config.password) fillInput(p, config.password);
        }, 300);
    }

    // ============================================================
    // 4. 初始化与调度
    // ============================================================

    function init() {
        const secretDiv = document.getElementById(CONFIG_ID);
        if (!secretDiv) {
            // 可能脚本执行太早，DOM 还没解析到 body 底部，等待 window.load
            window.addEventListener('load', init);
            return;
        }

        let config;
        try {
            // [修改] 使用自定义的 UTF-8 解码函数替代原生 atob
            const raw = b64DecodeUnicode(secretDiv.innerText.trim());
            if (!raw) return;

            config = JSON.parse(raw);
        } catch (e) {
            err('Failed to parse config: ' + e.message);
            return;
        }

        log('Starting detection...');

        // --- 策略 A: 立即尝试 ---
        if (executeAutoFill(config)) {
            cleanUp();
            startValueGuard(config);
            return;
        }

        // --- 策略 B: 轮询 (Polling) ---
        // 应对简单的延时加载
        checkTimer = setInterval(() => {
            attempts++;
            const filled = executeAutoFill(config);
            if (filled || attempts >= MAX_ATTEMPTS) {
                cleanUp();
                if (filled) startValueGuard(config);
            }
        }, CHECK_INTERVAL);

        // --- 策略 C: MutationObserver ---
        // 应对复杂的 SPA 动态路由切换或弹窗
        observer = new MutationObserver((mutations) => {
            // 简单优化：只在节点增加时检查，避免频繁触发
            const hasNodesAdded = mutations.some(m => m.addedNodes.length > 0);
            if (hasNodesAdded) {
                if (executeAutoFill(config)) {
                    cleanUp();
                    startValueGuard(config);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 总超时保险
        setTimeout(() => {
            log('Timeout reached.');
            cleanUp();
        }, TIMEOUT);
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();