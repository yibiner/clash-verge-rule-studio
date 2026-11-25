;(function () {
  'use strict'

  const STORAGE_KEY = 'yanet_global_script_editor_state_v1'
  const THEME_KEY = 'clash_verge_rule_studio_theme_v1'
  const MAX_UNDO = 20
  const {
    QURE_ICONS,
    DNS_MODES,
    FOREIGN_AI_SPLIT_KEYS,
    SERVICE_BUNDLES,
    SAMPLE_NODES_TEXT,
    createDefaultState,
    mergeStateWithDefaults,
    applyDevLeanPreset,
    applyServiceBundle,
    isBundleSplit,
    serviceOrderViolations,
    repairServiceOrder,
  } = window.YaNetDefaults
  const {
    generateGlobalScript,
    executeScriptPreview,
    diagnoseConfig,
    simulateRuleMatch,
    toYaml,
    parseExistingScript,
  } = window.YaNetGenerator

  // ===== UI State =====
  let state = loadState()
  let activeSection = 'general'
  let activePreviewTab = 'groups'
  let vergeMode = 'rule' // rule | global | direct
  let serviceSearch = ''
  let ruleSearch = ''
  let ruleTestQuery = ''
  let groupSearch = ''
  let openServiceIdx = -1
  let openServiceOriginalName = ''
  let openRegionIdx = -1
  let bundlesOpen = false
  let bundleInfoId = ''
  let dragState = null
  let expandedPreviewGroups = new Set(['默认节点'])
  let simulatedSelections = {} // groupName -> proxyName
  let iconPickerCallback = null
  let iconPickerCategory = '全部'
  let iconPickerQuery = ''
  let lastScriptCode = ''
  let lastPreviewResult = null
  let lastDiagnostics = []
  let undoStack = []
  let toastTimer = null

  // ===== DOM Refs =====
  const elNav = document.getElementById('nav-list')
  const elEditor = document.getElementById('editor-pane')
  const elPreviewBody = document.getElementById('preview-body')
  const elPreviewTabs = document.getElementById('preview-tabs')
  const elPreviewExtra = document.getElementById('preview-extra-actions')
  const elRunStatus = document.getElementById('run-status')
  const elRunStatusText = document.getElementById('run-status-text')
  const elToast = document.getElementById('toast')
  const elBtnUndo = document.getElementById('btn-undo')
  const elBtnTheme = document.getElementById('btn-theme')
  const elBtnShareUrl = document.getElementById('btn-share-url')

  // Modals
  const elIconModal = document.getElementById('icon-modal')
  const elIconSearch = document.getElementById('icon-search')
  const elIconCats = document.getElementById('icon-cats')
  const elIconGrid = document.getElementById('icon-grid')
  const elImportModal = document.getElementById('import-modal')
  const elImportFile = document.getElementById('import-file-input')
  const elImportTextarea = document.getElementById('import-textarea')
  const elAboutModal = document.getElementById('about-modal')
  const elBtnAbout = document.getElementById('btn-about')

  // ===== Utilities =====
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return createDefaultState()
      return mergeStateWithDefaults(JSON.parse(raw))
    } catch {
      return createDefaultState()
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore quota errors
    }
  }

  function showToast(msg) {
    elToast.textContent = msg
    elToast.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      elToast.classList.remove('show')
    }, 2200)
  }

  function resolvePreviewIcon(url) {
    if (!url) return ''
    const proxy = (state.args.githubProxy || '').trim()
    if (proxy && url.startsWith('https://raw.githubusercontent.com/')) {
      return proxy + url
    }
    return url
  }

  const ICON_PALETTES = [
    { bg: '#e8f2fd', fg: '#1976d2' },
    { bg: '#e6f7f0', fg: '#0f9d58' },
    { bg: '#feeceb', fg: '#d93025' },
    { bg: '#fef3e2', fg: '#d97706' },
    { bg: '#f1ebfe', fg: '#7c3aed' },
    { bg: '#e5f6fb', fg: '#0284c7' },
    { bg: '#fce7f3', fg: '#db2777' },
  ]

  function pickPalette(name) {
    let h = 0
    const s = String(name || '')
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0
    return ICON_PALETTES[h % ICON_PALETTES.length]
  }

  function shortGlyph(name) {
    const s = String(name || '?').trim()
    if (/^[A-Za-z]{2}/.test(s)) return s.slice(0, 2).toUpperCase()
    return s.slice(0, 1).toUpperCase()
  }

  function renderIconThumb(url, fallbackText) {
    const pal = pickPalette(fallbackText)
    const glyph = esc(shortGlyph(fallbackText))
    const fallback = `<span class="icon-fallback" style="background:${pal.bg};color:${pal.fg}">${glyph}</span>`
    if (!url) return fallback
    const src = esc(resolvePreviewIcon(url))
    return `${fallback}<img src="${src}" alt="" loading="lazy" onload="this.parentElement.classList.add('has-img')" onerror="this.remove()" />`
  }

  function pseudoDelay(name) {
    const directName = state.builtinProxies?.directName || '直连'
    const rejectName = state.builtinProxies?.rejectName || '拒绝'
    if (name === directName || name === 'DIRECT') return '12 ms'
    if (name === rejectName || name === 'REJECT') return 'REJECT'
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) % 220
    }
    return `${28 + hash} ms`
  }

  // ===== Theme (Light / Dark) =====
  const SUN_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
  const MOON_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'

  function getPreferredTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'dark' || saved === 'light') return saved
    } catch {
      // ignore
    }
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark'
    if (document.documentElement) {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }
    const metaTheme = typeof document.querySelector === 'function' ? document.querySelector('meta[name="theme-color"]') : null
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#161d28' : '#1976d2')
    }
    if (elBtnTheme) {
      elBtnTheme.innerHTML = isDark ? SUN_SVG : MOON_SVG
      elBtnTheme.title = isDark ? '切换为亮色主题' : '切换为暗色主题'
      elBtnTheme.setAttribute('aria-label', elBtnTheme.title)
    }
  }

  function toggleTheme() {
    const cur = document.documentElement?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    const next = cur === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // ignore
    }
    applyTheme(next)
  }

  // ===== Undo History =====
  function updateUndoButton() {
    if (!elBtnUndo) return
    elBtnUndo.disabled = undoStack.length === 0
    const last = undoStack[undoStack.length - 1]
    elBtnUndo.title = last ? `撤销：${last.label} (Ctrl/Cmd+Z)` : '暂无可撤销操作 (Ctrl/Cmd+Z)'
  }

  function pushUndo(label) {
    try {
      undoStack.push({
        label: label || '上一步修改',
        snapshot: JSON.stringify(state),
      })
      if (undoStack.length > MAX_UNDO) undoStack.shift()
      updateUndoButton()
    } catch {
      // ignore serialization failure
    }
  }

  function performUndo() {
    if (undoStack.length === 0) return
    const entry = undoStack.pop()
    updateUndoButton()
    try {
      state = mergeStateWithDefaults(JSON.parse(entry.snapshot))
      openServiceIdx = -1
      openServiceOriginalName = ''
      openRegionIdx = -1
      recomputePreview()
      renderEditor()
      showToast(`已撤销：${entry.label}`)
    } catch {
      showToast('撤销失败')
    }
  }

  // ===== URL Hash Sharing (#cfg=...) =====
  function bytesToBase64Url(bytes) {
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function base64UrlToBytes(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }

  async function encodeStateToSharePayload(currentState) {
    const slim = { ...currentState }
    if (slim.sampleNodesText === SAMPLE_NODES_TEXT) {
      delete slim.sampleNodesText
    }
    const jsonBytes = new TextEncoder().encode(JSON.stringify(slim))
    if (typeof CompressionStream === 'function' && typeof Blob === 'function') {
      const stream = new Blob([jsonBytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
      const compressed = new Uint8Array(await new Response(stream).arrayBuffer())
      return 'z.' + bytesToBase64Url(compressed)
    }
    return 'j.' + bytesToBase64Url(jsonBytes)
  }

  function validateSharedState(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('分享链接数据格式无效')
    }
    if (!parsed.args || !Array.isArray(parsed.services) || !Array.isArray(parsed.regions)) {
      throw new Error('分享链接缺少必要配置字段')
    }
    return mergeStateWithDefaults(parsed)
  }

  async function decodeStateFromSharePayload(payload) {
    if (payload.startsWith('z.')) {
      if (typeof DecompressionStream !== 'function' || typeof Blob !== 'function') {
        throw new Error('当前浏览器不支持解压此分享链接')
      }
      const bytes = base64UrlToBytes(payload.slice(2))
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      const text = await new Response(stream).text()
      return validateSharedState(JSON.parse(text))
    }
    const raw = payload.startsWith('j.') ? payload.slice(2) : payload
    const text = new TextDecoder().decode(base64UrlToBytes(raw))
    return validateSharedState(JSON.parse(text))
  }

  async function loadStateFromUrlHash() {
    const hash = typeof location !== 'undefined' ? location.hash || '' : ''
    if (!hash.startsWith('#cfg=')) return
    const payload = hash.slice(5).trim()
    if (!payload) return
    try {
      const decoded = await decodeStateFromSharePayload(payload)
      pushUndo('加载分享链接')
      state = decoded
      openServiceIdx = -1
      openServiceOriginalName = ''
      openRegionIdx = -1
      recomputePreview()
      renderEditor()
      if (typeof history !== 'undefined' && typeof history.replaceState === 'function') {
        history.replaceState(null, '', location.pathname + location.search)
      }
      showToast('已从分享链接加载配置')
    } catch {
      showToast('分享链接解析失败，已保留本地配置')
    }
  }

  // ===== Live Script Generation & Execution =====
  function recomputePreview() {
    saveState()
    lastScriptCode = generateGlobalScript(state)
    lastPreviewResult = executeScriptPreview(lastScriptCode, state.sampleNodesText, state)
    lastDiagnostics = diagnoseConfig(state, lastPreviewResult)

    const statusDiagnostics = lastDiagnostics.filter((item) => !String(item.code || '').startsWith('shadow-'))
    const errorCount = statusDiagnostics.filter((d) => d.level === 'error').length
    const warnCount = statusDiagnostics.filter((d) => d.level === 'warn').length

    if (lastPreviewResult.ok) {
      elRunStatus.classList.toggle('is-error', errorCount > 0)
      elRunStatus.classList.toggle('is-warn', errorCount === 0 && warnCount > 0)
      const groupsCount = (lastPreviewResult.config['proxy-groups'] || []).length
      const rulesCount = (lastPreviewResult.config.rules || []).length
      const diagSuffix =
        errorCount > 0
          ? ` · ${errorCount} 异常`
          : warnCount > 0
            ? ` · ${warnCount} 提示`
            : ''
      elRunStatusText.textContent = `正常 · ${groupsCount} 策略组 / ${rulesCount} 规则${diagSuffix}`
    } else {
      elRunStatus.classList.remove('is-warn')
      elRunStatus.classList.add('is-error')
      elRunStatusText.textContent = '执行异常'
    }

    renderNav()
    renderPreview()
  }

  // ===== Sidebar Navigation =====
  const NAV_ITEMS = [
    {
      id: 'general',
      label: '基础与倍率',
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
      badge: () => (state.args.enable ? '开' : '关'),
    },
    {
      id: 'services',
      label: '服务分流组',
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
      badge: () => `${state.services.filter((s) => s.enabled).length}/${state.services.length}`,
    },
    {
      id: 'regions',
      label: '地区分组',
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      badge: () => `${state.regions.filter((r) => r.enabled).length}/${state.regions.length}`,
    },
    {
      id: 'systemGroups',
      label: '系统策略组',
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
      badge: () => '5',
    },
    {
      id: 'dns',
      label: 'DNS 与规则',
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/></svg>`,
      badge: () => (state.args.dns ? state.args.mode || 'custom' : '关'),
    },
    {
      id: 'core',
      label: '内核与 TUN',
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>`,
      badge: () => (!includeVergeManagedFields() ? 'Verge' : state.tun.enable ? 'TUN' : '常规'),
    },
    {
      id: 'nodes',
      label: '模拟订阅节点',
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg>`,
      badge: () => `${lastPreviewResult ? lastPreviewResult.inputCount : 0}`,
    },
  ]

  function renderNav() {
    elNav.innerHTML = NAV_ITEMS.map((item) => {
      const active = item.id === activeSection ? 'active' : ''
      return `
        <button class="nav-item ${active}" data-nav="${item.id}">
          <span class="nav-item-left">
            ${item.icon}
            <span>${item.label}</span>
          </span>
          <span class="nav-badge">${esc(item.badge())}</span>
        </button>
      `
    }).join('')
  }

  // ===== Render Center Editor =====
  function renderEditor() {
    if (activeSection === 'general') renderGeneralSection()
    else if (activeSection === 'services') renderServicesSection()
    else if (activeSection === 'regions') renderRegionsSection()
    else if (activeSection === 'systemGroups') renderSystemGroupsSection()
    else if (activeSection === 'dns') renderDnsSection()
    else if (activeSection === 'core') renderCoreSection()
    else if (activeSection === 'nodes') renderNodesSection()
  }

  function includeVergeManagedFields() {
    return Boolean(state.exportOptions && state.exportOptions.includeVergeManaged)
  }

  function heldPill() {
    if (includeVergeManagedFields()) return ''
    return '<span class="pill pill-gray">不写入脚本</span>'
  }

  function renderGeneralSection() {
    const a = state.args
    const c = state.core
    const excludedCount = lastPreviewResult ? lastPreviewResult.analysis.excluded.length : 0

    elEditor.innerHTML = `
      <div class="pane-header">
        <div>
          <h2 class="pane-title">基础与倍率过滤</h2>
          <p class="pane-desc">对应脚本顶部的 <code>defaultArgs</code> 参数，支持 Clash Verge 覆写与 Sub-Store 传参。</p>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">核心开关</h3>
        </div>
        <div class="toggle-row">
          <div>
            <div class="toggle-info-title">启用全局覆写脚本 (enable)</div>
            <div class="toggle-info-desc">关闭后 <code>main(config)</code> 将直接返回原始订阅配置。</div>
          </div>
          <label class="switch">
            <input type="checkbox" data-bind="args.enable" ${a.enable ? 'checked' : ''} />
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="toggle-row">
          <div>
            <div class="toggle-info-title">接管并优化 DNS 配置 (dns)</div>
            <div class="toggle-info-desc">启用内置 Fake-IP 与国内外分流 DNS 策略。</div>
          </div>
          <label class="switch">
            <input type="checkbox" data-bind="args.dns" ${a.dns ? 'checked' : ''} />
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="toggle-row">
          <div>
            <div class="toggle-info-title">启用域名嗅探 (sniffer)</div>
            <div class="toggle-info-desc">对 TLS/HTTP/QUIC 流量进行域名还原，减少纯 IP 误分流。</div>
          </div>
          <label class="switch">
            <input type="checkbox" data-bind="args.sniffer" ${a.sniffer ? 'checked' : ''} />
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="toggle-row">
          <div>
            <div class="toggle-info-title">启用 IPv6 (ipv6) ${heldPill()}</div>
            <div class="toggle-info-desc">${includeVergeManagedFields() ? '本地网络与节点均支持 IPv6 时再开启。' : '以 Clash Verge 设置页为准，默认不写入脚本。'}</div>
          </div>
          <label class="switch">
            <input type="checkbox" data-bind="args.ipv6" ${a.ipv6 ? 'checked' : ''} />
            <span class="switch-track"></span>
          </label>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">高倍率节点过滤</h3>
          <span id="multiplier-excluded-pill" class="pill ${excludedCount > 0 ? 'pill-amber' : 'pill-gray'}">当前模拟订阅已过滤 ${excludedCount} 个节点</span>
        </div>
        <div class="toggle-row" style="margin-bottom: 12px">
          <div>
            <div class="toggle-info-title">过滤高倍率节点 (excludeHighPercentage)</div>
            <div class="toggle-info-desc">识别 <code>x2</code> / <code>×3</code> / <code>1.5x</code> / <code>倍率5</code>，超上限节点不加入策略组。</div>
          </div>
          <label class="switch">
            <input type="checkbox" data-bind="args.excludeHighPercentage" ${a.excludeHighPercentage ? 'checked' : ''} />
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>最大允许倍率 (globalRatioLimit)</label>
            <input type="number" step="0.5" min="0.1" max="50" class="input" data-bind="args.globalRatioLimit" data-type="number" value="${esc(a.globalRatioLimit)}" />
          </div>
          <div class="field">
            <label>日志级别 (logLevel)</label>
            <select class="select" data-bind="args.logLevel">
              ${['silent', 'error', 'warning', 'info', 'debug']
                .map((lv) => `<option value="${lv}" ${a.logLevel === lv ? 'selected' : ''}>${lv}</option>`)
                .join('')}
            </select>
          </div>
          <div class="field span-2">
            <label>
              倍率识别正则 (multiplierRegex)
              <span id="multiplier-regex-pill" class="pill ${lastPreviewResult?.analysis?.multiplierValid === false ? 'pill-red' : 'pill-green'}">${lastPreviewResult?.analysis?.multiplierValid === false ? '正则语法错误' : '正则有效'}</span>
            </label>
            <div class="input-row">
              <input class="input mono" data-bind="args.multiplierRegex" value="${esc(a.multiplierRegex)}" />
              <input class="input mono" style="width: 68px" data-bind="args.multiplierFlags" value="${esc(a.multiplierFlags || 'i')}" title="正则标志 (flags)" />
            </div>
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">网络与加速</h3>
        </div>
        <div class="form-grid">
          <div class="field span-2">
            <label>
              GitHub 加速前缀 (githubProxy)
              <span class="field-hint">用于 geox-url 与 zashboard 下载，留空则直连 GitHub</span>
            </label>
            <div class="input-row">
              <input class="input mono" data-bind="args.githubProxy" value="${esc(a.githubProxy)}" placeholder="例如 https://ghfast.top/" />
              <button class="btn btn-sm" data-set-ghproxy="">清空</button>
              <button class="btn btn-sm" data-set-ghproxy="https://ghfast.top/">ghfast</button>
              <button class="btn btn-sm" data-set-ghproxy="https://gh-proxy.com/">gh-proxy</button>
            </div>
          </div>
          <div class="field">
            <label>出口网卡名 (interfaceName)</label>
            <input class="input mono" data-bind="args.interfaceName" value="${esc(a.interfaceName)}" placeholder="留空自动检测（如 en0 / eth0）" />
          </div>
          <div class="field">
            <label>外部控制密码 (secret) ${heldPill()}</label>
            <input class="input mono" data-bind="core.secret" value="${esc(c.secret)}" />
          </div>
        </div>
      </div>
    `
  }

  const DRAG_GRIP_SVG =
    '<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="3.5" cy="3" r="1.25"/><circle cx="8.5" cy="3" r="1.25"/><circle cx="3.5" cy="8" r="1.25"/><circle cx="8.5" cy="8" r="1.25"/><circle cx="3.5" cy="13" r="1.25"/><circle cx="8.5" cy="13" r="1.25"/></svg>'

  function buildServiceKeyFreq() {
    const keyFreq = {}
    state.services.forEach((s) => {
      const k = String(s.key || '').trim()
      if (k) keyFreq[k] = (keyFreq[k] || 0) + 1
    })
    return keyFreq
  }

  function describeServiceOrderHint(svc, violations) {
    if (!svc || !svc.enabled) return ''
    const key = svc.key
    const list = violations || serviceOrderViolations(state.services)
    const related = list.filter((item) => item.earlierKey === key || item.laterKey === key)
    if (!related.length) return ''
    const notes = related.map((item) => {
      if (item.earlierKey === key) {
        const other = state.services.find((s) => s.enabled && s.key === item.laterKey)
        return `排在「${other?.name || item.laterKey}」后面`
      }
      const other = state.services.find((s) => s.enabled && s.key === item.earlierKey)
      return `排在「${other?.name || item.earlierKey}」前面`
    })
    const impacts = [...new Set(related.map((item) => String(item.reason || '').trim()).filter(Boolean))]
    return `${[...new Set(notes)].join('，')}。${impacts.join('')}`
  }

  function renderServiceTitleInner(svc, keyFreq, violations) {
    const ruleCount = (svc.rules || []).filter((r) => r.trim()).length
    const provCount = (svc.providers || []).length
    const trimmedKey = String(svc.key || '').trim()
    return `
      <div class="entity-name">
        <span>${esc(svc.name)}</span>
        ${!trimmedKey ? '<span class="pill pill-red">key 不能为空</span>' : ''}
        ${keyFreq[trimmedKey] > 1 ? '<span class="pill pill-red">key 重复</span>' : ''}
        ${svc.reject ? '<span class="pill pill-red">默认拒绝</span>' : ''}
        ${svc.directFirst ? '<span class="pill pill-green">直连优先</span>' : ''}
        ${!svc.reject && svc.preferRegion ? `<span class="pill pill-blue">优先 ${esc(svc.preferRegion)}</span>` : ''}
        <span class="pill pill-gray">${ruleCount} 条规则</span>
        ${provCount > 0 ? `<span class="pill pill-blue">${provCount} 规则集</span>` : ''}
      </div>
      <div class="entity-sub">key: ${esc(svc.key)} · ${esc((svc.rules || [])[0] || '无规则')}</div>
      ${renderServiceOrderHint(svc, violations)}
    `
  }

  function renderServiceOrderHint(svc, violations) {
    const text = describeServiceOrderHint(svc, violations)
    if (!text) return ''
    return `<div class="entity-order-hint is-warn"><span>${esc(text)}</span><button type="button" class="entity-order-fix" data-fix-service-order>调整顺序</button></div>`
  }

  function renderServiceOrderSummaryBanner(violations) {
    const list = violations || serviceOrderViolations(state.services)
    if (!list.length) return ''
    const first = list[0]
    const extra = list.length > 1 ? ` 等 ${list.length} 处` : ''
    return `
      <div class="order-warn-bar">
        <span>顺序冲突：${esc(first.message)}${esc(extra)}</span>
        <button type="button" class="btn btn-sm" data-fix-service-order>一键调整顺序</button>
      </div>
    `
  }

  function fixServiceOrder() {
    const openItem = openServiceIdx >= 0 ? state.services[openServiceIdx] : null
    pushUndo('一键调整服务组顺序')
    state.services = repairServiceOrder(state.services)
    openServiceIdx = openItem ? state.services.indexOf(openItem) : -1
    recomputePreview()
    renderServicesSection()
    const left = serviceOrderViolations(state.services)
    showToast(left.length ? '仍有顺序问题，请再看提示' : '已调整顺序')
  }

  function toastServiceOrder(name, key) {
    const svc = state.services.find((s) => s.enabled && s.key === key)
    const hint = describeServiceOrderHint(svc)
    showToast(hint ? `已调整「${name}」：${hint}` : `已调整「${name}」排序`)
  }

  function renderRegionPrefixOptions(selectedPrefix) {
    const cur = String(selectedPrefix || '').trim()
    const seen = new Set()
    const options = ['<option value="">不指定（按地区顺序）</option>']
    for (const r of state.regions || []) {
      const prefix = String(r.name || '').substring(0, 2)
      if (!prefix || seen.has(prefix)) continue
      seen.add(prefix)
      options.push(
        `<option value="${esc(prefix)}" ${cur === prefix ? 'selected' : ''}>${esc(r.name)} (${esc(prefix)})</option>`
      )
    }
    if (cur && !seen.has(cur)) {
      options.push(`<option value="${esc(cur)}" selected>${esc(cur)}（自定义前缀）</option>`)
    }
    return options.join('')
  }

  function renderServiceRuleSyncSlot(svc, idx) {
    const newName = String(svc.name || '').trim()
    if (!openServiceOriginalName || !newName || newName === openServiceOriginalName) {
      return '<span class="field-hint">修改策略组名后可一键同步下方规则目标</span>'
    }
    const oldEscaped = esc(openServiceOriginalName)
    const hasOldRef = (svc.rules || []).some((line) => {
      const parts = String(line || '').split(',').map((s) => s.trim())
      const target = (parts[0] || '').toUpperCase() === 'MATCH' ? parts[1] : parts[2]
      return target === openServiceOriginalName
    })
    if (!hasOldRef) {
      return '<span class="field-hint">修改策略组名后可一键同步下方规则目标</span>'
    }
    return `<button type="button" class="btn btn-sm btn-primary" data-sync-svc-rules="${idx}">将规则中的「${oldEscaped}」同步为「${esc(newName)}」</button>`
  }

  function refreshServiceCardHeaders() {
    const keyFreq = buildServiceKeyFreq()
    const violations = serviceOrderViolations(state.services)
    elEditor.querySelectorAll('.entity-card[data-drag-type="service"]').forEach((card) => {
      const idx = Number(card.dataset.dragIdx)
      const svc = state.services[idx]
      const wrap = card.querySelector('.entity-title-wrap')
      if (svc && wrap) wrap.innerHTML = renderServiceTitleInner(svc, keyFreq, violations)
    })
    const orderBanner = document.getElementById('service-order-banner-wrap')
    if (orderBanner) orderBanner.innerHTML = renderServiceOrderSummaryBanner(violations)
  }

  function renderRegionTitleInner(reg, stat) {
    const statusPill = !stat.valid
      ? '<span class="pill pill-red">正则语法错误</span>'
      : stat.count > 0
        ? `<span class="pill pill-green">命中 ${stat.count} 节点</span>`
        : '<span class="pill pill-gray">当前 0 命中</span>'
    return `
      <div class="entity-name">
        <span>${esc(reg.name)}</span>
        ${statusPill}
      </div>
      <div class="entity-sub">/${esc(reg.regex)}/${esc(reg.flags || 'i')}</div>
    `
  }

  function refreshRegionCardHeaders() {
    const regionCounts = lastPreviewResult ? lastPreviewResult.analysis.regionCounts : {}
    elEditor.querySelectorAll('.entity-card[data-drag-type="region"]').forEach((card) => {
      const idx = Number(card.dataset.dragIdx)
      const reg = state.regions[idx]
      const wrap = card.querySelector('.entity-title-wrap')
      if (reg && wrap) {
        const stat = regionCounts[reg.name] || { count: 0, valid: true }
        wrap.innerHTML = renderRegionTitleInner(reg, stat)
      }
    })
  }

  function renderServicesListMarkup(precomputedViolations) {
    const query = serviceSearch.trim().toLowerCase()
    const keyFreq = buildServiceKeyFreq()
    const violations = precomputedViolations || serviceOrderViolations(state.services)
    const filtered = state.services
      .map((svc, idx) => ({ svc, idx }))
      .filter(({ svc }) => {
        if (!query) return true
        return (
          svc.name.toLowerCase().includes(query) ||
          svc.key.toLowerCase().includes(query) ||
          (svc.rules || []).some((r) => r.toLowerCase().includes(query))
        )
      })

    if (filtered.length === 0) {
      return '<div class="empty-state">无匹配的服务分流组</div>'
    }

    return filtered
      .map(({ svc, idx }) => {
        const isOpen = openServiceIdx === idx
        return `
          <div class="entity-card ${svc.enabled ? '' : 'is-disabled'} ${isOpen ? 'is-open' : ''}" data-drag-type="service" data-drag-idx="${idx}">
            <div class="entity-head" draggable="true">
              <span class="drag-handle" title="按住拖拽调整顺序" aria-hidden="true">${DRAG_GRIP_SVG}</span>
              <div class="entity-head-main" data-toggle-svc-open="${idx}">
                <div class="entity-icon">${renderIconThumb(svc.icon, svc.name)}</div>
                <div class="entity-title-wrap">
                  ${renderServiceTitleInner(svc, keyFreq, violations)}
                </div>
              </div>
              <div class="entity-actions">
                <button class="icon-btn" data-move-svc="${idx}:-1" title="上移" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button class="icon-btn" data-move-svc="${idx}:1" title="下移" ${idx === state.services.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn btn-sm btn-ghost" data-toggle-svc-open="${idx}" title="展开编辑">${isOpen ? '收起' : '编辑'}</button>
                <label class="switch" title="启用/禁用该服务组">
                  <input type="checkbox" data-svc-toggle="${idx}" ${svc.enabled ? 'checked' : ''} />
                  <span class="switch-track"></span>
                </label>
              </div>
            </div>
            ${isOpen ? renderServiceEditBody(svc, idx) : ''}
          </div>
        `
      })
      .join('')
  }

  const BUNDLE_KEEP_NOTE = '苹果、谷歌、广告、网易云保持单组。苹果的国内直连和国际代理写在同一组规则里。'

  function renderBundleBar(bundle) {
    const split = isBundleSplit(state.services, bundle)
    const present = state.services.filter((svc) => bundle.splitKeys.includes(svc.key)).length
    const total = bundle.splitKeys.length
    const status = split ? `已细分 ${present}/${total}` : `合并为「${bundle.mergedName}」`
    const infoOpen = bundleInfoId === bundle.id
    return `
      <div class="bundle-row">
        <span class="bundle-row-name">${esc(bundle.title)}</span>
        <span class="bundle-row-status">${esc(status)}</span>
        <button class="icon-btn bundle-info-btn" type="button" data-bundle-info="${esc(bundle.id)}" title="说明" aria-label="${esc(bundle.title)}说明">i</button>
        <button class="btn btn-sm ${split ? '' : 'btn-primary'}" type="button" data-bundle-action="split" data-bundle-id="${esc(bundle.id)}">${split ? '重置' : '拆分'}</button>
        ${split ? `<button class="btn btn-sm" type="button" data-bundle-action="merge" data-bundle-id="${esc(bundle.id)}">合并</button>` : ''}
      </div>
      ${infoOpen ? `<div class="bundle-info-pop">${esc(bundle.desc)}</div>` : ''}
    `
  }

  function renderBundlePanel() {
    const summary = SERVICE_BUNDLES.map((bundle) => {
      const split = isBundleSplit(state.services, bundle)
      const present = state.services.filter((svc) => bundle.splitKeys.includes(svc.key)).length
      return split ? `${bundle.title} ${present}/${bundle.splitKeys.length}` : `${bundle.title} 合并`
    }).join(' · ')
    const keepOpen = bundleInfoId === 'keep'
    return `
      <div class="bundle-fold">
        <button class="bundle-fold-main" type="button" data-toggle-bundles>
          <span class="bundle-fold-title">细分与合并</span>
          <span class="bundle-fold-summary">${esc(summary)}</span>
          <span class="bundle-fold-caret">${bundlesOpen ? '收起' : '展开'}</span>
        </button>
        <button class="icon-btn bundle-info-btn" type="button" data-bundle-info="keep" title="说明" aria-label="单组说明">i</button>
      </div>
      ${keepOpen ? `<div class="bundle-info-pop">${esc(BUNDLE_KEEP_NOTE)}</div>` : ''}
      ${bundlesOpen ? `<div class="bundle-rows">${SERVICE_BUNDLES.map((bundle) => renderBundleBar(bundle)).join('')}</div>` : ''}
    `
  }

  function renderServicesSection() {
    const violations = serviceOrderViolations(state.services)
    elEditor.innerHTML = `
      <div class="pane-header">
        <div>
          <h2 class="pane-title">服务分流策略组</h2>
          <p class="pane-desc">上面的组先生效。</p>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-service">+ 新增服务组</button>
      </div>

      ${renderBundlePanel()}

      <div class="toolbar">
        <div class="chip-group">
          <button class="chip" data-svc-preset="all">全部开启</button>
          <button class="chip" data-svc-preset="daily">日常精简</button>
          <button class="chip" data-svc-preset="devLean">开发精简</button>
          <button class="chip" data-svc-preset="dev">仅 AI + 谷歌 + 开发</button>
          <button class="chip" data-svc-preset="none">全部关闭</button>
        </div>
        <input id="service-search-input" class="input toolbar-search" placeholder="搜索服务名称或规则..." value="${esc(serviceSearch)}" />
      </div>

      <div id="service-order-banner-wrap">${renderServiceOrderSummaryBanner(violations)}</div>

      <div class="entity-list" id="service-entity-list">
        ${renderServicesListMarkup(violations)}
      </div>
    `
  }

  function renderServiceEditBody(svc, idx) {
    const providersHtml = (svc.providers || [])
      .map(
        (p, pIdx) => `
          <div style="border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 8px">
            <div class="provider-row">
              <input class="input mono" placeholder="key" value="${esc(p.key)}" data-svc-prov="${idx}:${pIdx}:key" />
              <input class="input mono" placeholder="url" value="${esc(p.url)}" data-svc-prov="${idx}:${pIdx}:url" />
              <select class="select" data-svc-prov="${idx}:${pIdx}:format">
                ${['text', 'yaml', 'mrs'].map((f) => `<option value="${f}" ${p.format === f ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
              <select class="select" data-svc-prov="${idx}:${pIdx}:behavior">
                ${['classical', 'domain', 'ipcidr'].map((b) => `<option value="${b}" ${p.behavior === b ? 'selected' : ''}>${b}</option>`).join('')}
              </select>
              <button class="icon-btn danger" data-del-svc-prov="${idx}:${pIdx}" title="删除规则集">✕</button>
            </div>
            <input class="input mono" placeholder="本地缓存路径 path，例如 ./ruleset/custom/rules.list" value="${esc(p.path || '')}" data-svc-prov="${idx}:${pIdx}:path" />
          </div>
        `
      )
      .join('')

    return `
      <div class="entity-body">
        <div class="form-grid">
          <div class="field">
            <label>策略组名称 (name)</label>
            <input class="input" value="${esc(svc.name)}" data-svc-field="${idx}:name" />
          </div>
          <div class="field">
            <label>开关标识 (key)</label>
            <input class="input mono" value="${esc(svc.key)}" data-svc-field="${idx}:key" />
          </div>
          <div class="field span-2">
            <label>图标链接 (icon)</label>
            <div class="input-row">
              <input class="input mono" value="${esc(svc.icon)}" data-svc-field="${idx}:icon" />
              <button class="btn btn-sm" data-pick-icon="service:${idx}">选 Qure 图标</button>
            </div>
          </div>
          <div class="field">
            <label>测速链接 (url，可选)</label>
            <input class="input mono" value="${esc(svc.url)}" data-svc-field="${idx}:url" placeholder="留空则使用默认测速地址" />
          </div>
          <div class="field">
            <label>优先置顶地区 (preferRegion)</label>
            <select class="select" data-svc-field="${idx}:preferRegion" ${svc.reject ? 'disabled' : ''}>
              ${renderRegionPrefixOptions(svc.preferRegion)}
            </select>
          </div>
        </div>

        <div class="chip-group">
          <label class="btn btn-sm" style="gap: 6px">
            <input type="checkbox" data-svc-bool="${idx}:reject" ${svc.reject ? 'checked' : ''} />
            默认拒绝型（拒绝 → 直连 → 默认节点）
          </label>
          <label class="btn btn-sm" style="gap: 6px">
            <input type="checkbox" data-svc-bool="${idx}:directFirst" ${svc.directFirst ? 'checked' : ''} />
            直连靠前（默认节点 → 直连 → 各地区）
          </label>
        </div>

        <div class="field">
          <label>
            <span>分流规则列表 (每行一条)</span>
            <span id="svc-sync-slot-${idx}">${renderServiceRuleSyncSlot(svc, idx)}</span>
          </label>
          <textarea class="textarea mono" rows="4" data-svc-rules="${idx}">${esc((svc.rules || []).join('\n'))}</textarea>
        </div>

        <div class="sub-block">
          <div class="sub-block-head">
            <span>关联 Rule-Providers (${(svc.providers || []).length})</span>
            <button class="btn btn-sm" data-add-svc-prov="${idx}">+ 添加规则集</button>
          </div>
          ${providersHtml || '<div class="field-hint">无外部规则集，全部使用内置 GEOSITE / GEOIP / DOMAIN 规则。</div>'}
        </div>

        <div style="display:flex; justify-content:flex-end">
          <button class="btn btn-sm btn-danger-ghost" data-del-svc="${idx}">删除此服务组</button>
        </div>
      </div>
    `
  }

  function renderRegionsSection() {
    const regionCounts = lastPreviewResult ? lastPreviewResult.analysis.regionCounts : {}

    elEditor.innerHTML = `
      <div class="pane-header">
        <div>
          <h2 class="pane-title">地区自动分组 (URLTest)</h2>
          <p class="pane-desc">按顺序正则分组并保留展示顺序，支持 ⠿ 拖拽排序，未命中归入「其他节点」。</p>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-region">+ 新增地区</button>
      </div>

      <div class="toolbar">
        <div class="chip-group">
          <button class="chip" data-reg-preset="all">全部开启</button>
          <button class="chip" data-reg-preset="core">常用五区 (HK/US/JP/SG/TW)</button>
          <button class="chip" data-reg-preset="none">全部关闭</button>
        </div>
        <span class="field-hint">正则匹配实时对照右侧模拟节点</span>
      </div>

      <div class="entity-list">
        ${state.regions
          .map((reg, idx) => {
            const isOpen = openRegionIdx === idx
            const stat = regionCounts[reg.name] || { count: 0, valid: true }

            return `
              <div class="entity-card ${reg.enabled ? '' : 'is-disabled'} ${isOpen ? 'is-open' : ''}" data-drag-type="region" data-drag-idx="${idx}">
                <div class="entity-head" draggable="true">
                  <span class="drag-handle" title="按住拖拽调整顺序" aria-hidden="true">${DRAG_GRIP_SVG}</span>
                  <div class="entity-head-main" data-toggle-reg-open="${idx}">
                    <div class="entity-icon">${renderIconThumb(reg.icon, reg.name)}</div>
                    <div class="entity-title-wrap">
                      ${renderRegionTitleInner(reg, stat)}
                    </div>
                  </div>
                  <div class="entity-actions">
                    <button class="icon-btn" data-move-reg="${idx}:-1" title="上移" ${idx === 0 ? 'disabled' : ''}>↑</button>
                    <button class="icon-btn" data-move-reg="${idx}:1" title="下移" ${idx === state.regions.length - 1 ? 'disabled' : ''}>↓</button>
                    <button class="btn btn-sm btn-ghost" data-toggle-reg-open="${idx}">${isOpen ? '收起' : '编辑'}</button>
                    <label class="switch">
                      <input type="checkbox" data-reg-toggle="${idx}" ${reg.enabled ? 'checked' : ''} />
                      <span class="switch-track"></span>
                    </label>
                  </div>
                </div>
                ${
                  isOpen
                    ? `
                  <div class="entity-body">
                    <div class="form-grid">
                      <div class="field">
                        <label>地区分组名 <span class="field-hint">前2字母作为 regionSet 标识</span></label>
                        <input class="input" value="${esc(reg.name)}" data-reg-field="${idx}:name" />
                      </div>
                      <div class="field">
                        <label>正则标志 (flags)</label>
                        <input class="input mono" value="${esc(reg.flags || 'i')}" data-reg-field="${idx}:flags" />
                      </div>
                      <div class="field span-2">
                        <label>匹配正则表达式</label>
                        <input class="input mono" value="${esc(reg.regex)}" data-reg-field="${idx}:regex" />
                      </div>
                      <div class="field span-2">
                        <label>图标链接 (icon)</label>
                        <div class="input-row">
                          <input class="input mono" value="${esc(reg.icon)}" data-reg-field="${idx}:icon" />
                          <button class="btn btn-sm" data-pick-icon="region:${idx}">选 Qure 图标</button>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center">
                      <span class="field-hint">${
                        stat.matches && stat.matches.length
                          ? '已匹配：' + esc(stat.matches.join('、'))
                          : '暂无模拟节点命中该正则'
                      }</span>
                      <button class="btn btn-sm btn-danger-ghost" data-del-reg="${idx}">删除此地区</button>
                    </div>
                  </div>
                `
                    : ''
                }
              </div>
            `
          })
          .join('')}
      </div>
    `
  }

  function renderSystemGroupsSection() {
    const sg = state.systemGroups
    const bp = state.builtinProxies
    const items = [
      { key: 'defaultGroup', title: '默认节点组', hasUrl: false, hasProxies: true, hasPreferRegion: true },
      { key: 'otherGroup', title: '未匹配地区兜底组', hasUrl: false, hasProxies: false, hasPreferRegion: false },
      { key: 'downloadGroup', title: '下载软件策略组', hasUrl: false, hasProxies: true, hasPreferRegion: false },
      { key: 'otherForeignGroup', title: '其他外网兜底组', hasUrl: false, hasProxies: true, hasPreferRegion: false },
      { key: 'cnGroup', title: '国内网站策略组', hasUrl: true, hasProxies: true, hasPreferRegion: false },
    ]

    elEditor.innerHTML = `
      <div class="pane-header">
        <div>
          <h2 class="pane-title">系统与兜底策略组</h2>
          <p class="pane-desc">自定义系统策略组与内置直连/拒绝节点，候选列表支持 <code>$regions</code> / <code>$other</code> / <code>$default</code> / <code>$cn</code>。</p>
        </div>
      </div>

      ${items
        .map((meta) => {
          const g = sg[meta.key]
          return `
            <div class="section-card">
              <div class="section-card-head">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="entity-icon">${renderIconThumb(g.icon, g.name)}</div>
                  <div>
                    <h3 class="section-card-title">${meta.title}</h3>
                    <div class="section-card-hint">${esc(g.name)} (${esc(g.type || 'select')})</div>
                  </div>
                </div>
                <button class="btn btn-sm" data-pick-icon="sys:${meta.key}">选 Qure 图标</button>
              </div>
              <div class="form-grid">
                <div class="field">
                  <label>策略组名称 (name)</label>
                  <input class="input" data-bind="systemGroups.${meta.key}.name" value="${esc(g.name)}" />
                </div>
                <div class="field">
                  <label>策略组类型 (type)</label>
                  <select class="select" data-bind="systemGroups.${meta.key}.type">
                    ${['select', 'url-test', 'fallback', 'load-balance']
                      .map((tp) => `<option value="${tp}" ${(g.type || 'select') === tp ? 'selected' : ''}>${tp}</option>`)
                      .join('')}
                  </select>
                </div>
                <div class="field span-2">
                  <label>图标链接 (icon)</label>
                  <input class="input mono" data-bind="systemGroups.${meta.key}.icon" value="${esc(g.icon || '')}" />
                </div>
                ${
                  meta.hasUrl
                    ? `
                  <div class="field span-2">
                    <label>测速链接 (url)</label>
                    <input class="input mono" data-bind="systemGroups.${meta.key}.url" value="${esc(g.url || '')}" />
                  </div>
                `
                    : ''
                }
                ${
                  meta.hasPreferRegion
                    ? `
                  <div class="field span-2">
                    <label>
                      优先置顶地区 (preferRegion)
                      <span class="field-hint">命中后会将该地区移至候选列表首位（默认 SG）</span>
                    </label>
                    <select class="select" data-bind="systemGroups.${meta.key}.preferRegion">
                      ${renderRegionPrefixOptions(g.preferRegion)}
                    </select>
                  </div>
                `
                    : ''
                }
                ${
                  meta.hasProxies
                    ? `
                  <div class="field span-2">
                    <label>
                      候选代理顺序 (逗号分隔)
                      <span class="field-hint">支持 $regions / $other / $default / $cn / 直连 / 拒绝</span>
                    </label>
                    <input class="input mono" data-csv="systemGroups.${meta.key}.proxies" value="${esc((g.proxies || []).join(', '))}" />
                  </div>
                `
                    : ''
                }
              </div>
            </div>
          `
        })
        .join('')}

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">内置直连 / 拒绝节点 (config.proxies)</h3>
        </div>
        <div class="form-grid" style="margin-bottom: 12px">
          <div class="field">
            <label>直连节点名称</label>
            <input class="input" data-bind="builtinProxies.directName" value="${esc(bp.directName)}" />
          </div>
          <div class="field">
            <label>直连路由标记 (routing-mark)</label>
            <input type="number" class="input mono" data-bind="builtinProxies.directRoutingMark" data-type="number" value="${esc(bp.directRoutingMark)}" />
          </div>
          <div class="field">
            <label>拒绝节点名称</label>
            <input class="input" data-bind="builtinProxies.rejectName" value="${esc(bp.rejectName)}" />
          </div>
        </div>
        <div class="switch-grid" style="margin-bottom: 0">
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">直连节点允许 UDP</div>
              <div class="switch-cell-sub">direct.udp</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="builtinProxies.directUdp" ${bp.directUdp ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">拒绝节点允许 UDP</div>
              <div class="switch-cell-sub">reject.udp</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="builtinProxies.rejectUdp" ${bp.rejectUdp ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
        </div>
      </div>
    `
  }

  function renderDnsSection() {
    const a = state.args
    const d = state.dnsExtra
    const isPreset = a.mode && a.mode !== 'custom'
    const currentPreset = DNS_MODES.find((m) => m.id === a.mode)

    elEditor.innerHTML = `
      <div class="pane-header">
        <div>
          <h2 class="pane-title">DNS 与基础规则</h2>
          <p class="pane-desc">配置 DNS 预设/自定义模式、Fake-IP 过滤与首尾规则。</p>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">DNS 预设模式 (mode)</h3>
          <span class="field-hint">${isPreset ? '预设模式运行时自动覆盖下方 DNS' : '自定义模式，下方 DNS 直接生效'}</span>
        </div>
        <div class="mode-grid">
          ${DNS_MODES.map(
            (m) => `
              <button class="mode-option ${a.mode === m.id ? 'active' : ''}" data-dns-mode="${m.id}">
                <div class="mode-option-title">
                  <span>${m.label}</span>
                  <span class="field-hint" style="font-family:var(--font-mono)">${m.id}</span>
                </div>
                <div class="mode-option-desc">${m.desc}</div>
              </button>
            `
          ).join('')}
        </div>

        <div class="form-grid" style="margin-top: 14px">
          <div class="field">
            <label>defaultDNS <span class="field-hint">分号分隔</span></label>
            <input class="input mono" data-bind="args.defaultDNS" value="${esc(isPreset && currentPreset?.values ? currentPreset.values.defaultDNS : a.defaultDNS)}" ${isPreset ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label>directDNS</label>
            <input class="input mono" data-bind="args.directDNS" value="${esc(isPreset && currentPreset?.values ? currentPreset.values.directDNS : a.directDNS)}" ${isPreset ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label>chinaDNS</label>
            <input class="input mono" data-bind="args.chinaDNS" value="${esc(isPreset && currentPreset?.values ? currentPreset.values.chinaDNS : a.chinaDNS)}" ${isPreset ? 'disabled' : ''} />
          </div>
          <div class="field">
            <label>foreignDNS</label>
            <input class="input mono" data-bind="args.foreignDNS" value="${esc(isPreset && currentPreset?.values ? currentPreset.values.foreignDNS : a.foreignDNS)}" ${isPreset ? 'disabled' : ''} />
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">Fake-IP 与 DNS 分流策略</h3>
        </div>
        <div class="form-grid" style="margin-bottom: 12px">
          <div class="field">
            <label>DNS 监听地址 (listen)</label>
            <input class="input mono" data-bind="dnsExtra.listen" value="${esc(d.listen)}" />
          </div>
          <div class="field">
            <label>Fake-IP 网段 (fake-ip-range)</label>
            <input class="input mono" data-bind="dnsExtra.fakeIpRange" value="${esc(d.fakeIpRange)}" />
          </div>
          <div class="field">
            <label>增强模式 (enhanced-mode)</label>
            <select class="select" data-bind="dnsExtra.enhancedMode">
              <option value="fake-ip" ${d.enhancedMode === 'fake-ip' ? 'selected' : ''}>fake-ip</option>
              <option value="redir-host" ${d.enhancedMode === 'redir-host' ? 'selected' : ''}>redir-host</option>
            </select>
          </div>
          <div class="field">
            <label>过滤模式 (fake-ip-filter-mode)</label>
            <select class="select" data-bind="dnsExtra.fakeIpFilterMode">
              <option value="whitelist" ${d.fakeIpFilterMode === 'whitelist' ? 'selected' : ''}>whitelist</option>
              <option value="blacklist" ${d.fakeIpFilterMode === 'blacklist' ? 'selected' : ''}>blacklist</option>
            </select>
          </div>
        </div>

        <div class="switch-grid">
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">优先 HTTP/3</div>
              <div class="switch-cell-sub">prefer-h3</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="dnsExtra.preferH3" ${d.preferH3 ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">遵循分流规则解析</div>
              <div class="switch-cell-sub">respect-rules</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="dnsExtra.respectRules" ${d.respectRules ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">启用配置 Hosts</div>
              <div class="switch-cell-sub">use-hosts</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="dnsExtra.useHosts" ${d.useHosts ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">启用系统 Hosts</div>
              <div class="switch-cell-sub">use-system-hosts</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="dnsExtra.useSystemHosts" ${d.useSystemHosts ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
        </div>

        <div class="field" style="margin-bottom: 12px">
          <label>fake-ip-filter（每行一条）</label>
          <textarea class="textarea mono" rows="5" data-lines="dnsExtra.fakeIpFilter">${esc((d.fakeIpFilter || []).join('\n'))}</textarea>
        </div>

        <div class="sub-block">
          <div class="sub-block-head">
            <span>nameserver-policy（可用 $chinaDNS / $foreignDNS / system）</span>
            <button class="btn btn-sm" id="btn-add-dns-policy">+ 添加策略</button>
          </div>
          ${(d.nameserverPolicy || [])
            .map(
              (p, i) => `
                <div class="policy-row">
                  <input class="input mono" value="${esc(p.match)}" data-dns-policy="${i}:match" placeholder="geosite:cn" />
                  <input class="input mono" value="${esc(p.target)}" data-dns-policy="${i}:target" placeholder="$chinaDNS 或 system" />
                  <button class="icon-btn danger" data-del-dns-policy="${i}">✕</button>
                </div>
              `
            )
            .join('')}
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">前置规则与兜底规则</h3>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>前置规则（最高优先级，每行一条）</label>
            <textarea class="textarea mono" rows="8" data-lines="initialRules">${esc((state.initialRules || []).join('\n'))}</textarea>
          </div>
          <div class="field">
            <label>兜底规则（服务规则之后，每行一条）</label>
            <textarea class="textarea mono" rows="8" data-lines="fallbackRules">${esc((state.fallbackRules || []).join('\n'))}</textarea>
          </div>
          <div class="field span-2">
            <label>跳过/局域网保留网段 (skipIps，分号分隔)</label>
            <input class="input mono" data-bind="args.skipIps" value="${esc(a.skipIps)}" />
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">预置 Rule-Providers 与公共参数</h3>
          <button class="btn btn-sm" id="btn-add-builtin-prov">+ 添加预置规则集</button>
        </div>
        <div class="form-grid" style="margin-bottom: 12px">
          <div class="field">
            <label>默认更新周期 (ruleProviderCommon.interval 秒)</label>
            <input type="number" class="input mono" data-bind="core.ruleProviderInterval" data-type="number" value="${esc(state.core.ruleProviderInterval)}" />
          </div>
          <div class="field">
            <label>默认格式 (ruleProviderCommon.format)</label>
            <select class="select" data-bind="core.ruleProviderFormat">
              ${['yaml', 'text', 'mrs'].map((f) => `<option value="${f}" ${state.core.ruleProviderFormat === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="sub-block">
          <div class="sub-block-head">
            <span>预置规则集列表 (${(state.builtinProviders || []).length})</span>
            <span class="field-hint">默认包含 applications (DustinWin)</span>
          </div>
          ${(state.builtinProviders || [])
            .map(
              (p, i) => `
                <div style="border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 8px">
                  <div class="provider-row">
                    <input class="input mono" placeholder="key" value="${esc(p.key)}" data-builtin-prov="${i}:key" />
                    <input class="input mono" placeholder="url" value="${esc(p.url)}" data-builtin-prov="${i}:url" />
                    <select class="select" data-builtin-prov="${i}:format">
                      ${['text', 'yaml', 'mrs'].map((f) => `<option value="${f}" ${p.format === f ? 'selected' : ''}>${f}</option>`).join('')}
                    </select>
                    <select class="select" data-builtin-prov="${i}:behavior">
                      ${['classical', 'domain', 'ipcidr'].map((b) => `<option value="${b}" ${p.behavior === b ? 'selected' : ''}>${b}</option>`).join('')}
                    </select>
                    <button class="icon-btn danger" data-del-builtin-prov="${i}" title="删除">✕</button>
                  </div>
                  <input class="input mono" placeholder="本地缓存路径 path，例如 ./ruleset/DustinWin/applications.list" value="${esc(p.path)}" data-builtin-prov="${i}:path" />
                </div>
              `
            )
            .join('') || '<div class="field-hint">暂无预置 Rule-Provider。</div>'}
        </div>
      </div>
    `
  }

  function renderCoreSection() {
    const c = state.core
    const t = state.tun
    const s = state.snifferConfig
    const n = state.ntp

    elEditor.innerHTML = `
      <div class="pane-header">
        <div>
          <h2 class="pane-title">内核端口、TUN 与 GeoX</h2>
          <p class="pane-desc">对应 <code>main(config)</code> 3.1 节，标记「不写入脚本」的项默认不导出。</p>
        </div>
      </div>

      <div class="section-card">
        <div class="toggle-row">
          <div>
            <div class="toggle-info-title">导出时写入 Clash Verge 接管字段</div>
            <div class="toggle-info-desc">默认关闭，端口 / TUN / IPv6 等以 Clash Verge 设置页为准；给其他客户端用时再开启。</div>
          </div>
          <label class="switch">
            <input type="checkbox" data-bind="exportOptions.includeVergeManaged" ${includeVergeManagedFields() ? 'checked' : ''} />
            <span class="switch-track"></span>
          </label>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">代理端口、访问控制与面板</h3>
        </div>
        <div class="form-grid-3" style="margin-bottom: 12px">
          <div class="field">
            <label><span>HTTP (port)</span> ${heldPill()}</label>
            <input type="number" class="input mono" data-bind="core.port" data-type="number" value="${esc(c.port)}" />
          </div>
          <div class="field">
            <label><span>SOCKS5</span> ${heldPill()}</label>
            <input type="number" class="input mono" data-bind="core.socksPort" data-type="number" value="${esc(c.socksPort)}" />
          </div>
          <div class="field">
            <label><span>混合端口</span> ${heldPill()}</label>
            <input type="number" class="input mono" data-bind="core.mixedPort" data-type="number" value="${esc(c.mixedPort)}" />
          </div>
          <div class="field">
            <label><span>Redir</span> ${heldPill()}</label>
            <input type="number" class="input mono" data-bind="core.redirPort" data-type="number" value="${esc(c.redirPort)}" />
          </div>
          <div class="field">
            <label><span>TProxy</span> ${heldPill()}</label>
            <input type="number" class="input mono" data-bind="core.tproxyPort" data-type="number" value="${esc(c.tproxyPort)}" />
          </div>
          <div class="field">
            <label><span>绑定地址</span></label>
            <input class="input mono" data-bind="core.bindAddress" value="${esc(c.bindAddress)}" />
          </div>
        </div>

        <div class="switch-grid">
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">允许局域网连接 ${heldPill()}</div>
              <div class="switch-cell-sub">allow-lan</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.allowLan" ${c.allowLan ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">统一延迟计算 ${heldPill()}</div>
              <div class="switch-cell-sub">unified-delay</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.unifiedDelay" ${c.unifiedDelay ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">TCP 并发连接</div>
              <div class="switch-cell-sub">tcp-concurrent</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.tcpConcurrent" ${c.tcpConcurrent ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="field">
            <label>TCP 保活间隔 (keep-alive-interval 秒)</label>
            <input type="number" class="input mono" data-bind="core.keepAliveInterval" data-type="number" value="${esc(c.keepAliveInterval)}" />
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label>外部控制地址 (external-controller) ${heldPill()}</label>
            <input class="input mono" data-bind="core.externalController" value="${esc(c.externalController)}" />
          </div>
          <div class="field">
            <label>外部面板目录 (external-ui)</label>
            <input class="input mono" data-bind="core.externalUi" value="${esc(c.externalUi)}" />
          </div>
          <div class="field span-2">
            <label>外部面板下载地址 (external-ui-url)</label>
            <input class="input mono" data-bind="core.externalUiUrl" value="${esc(c.externalUiUrl)}" />
          </div>
          <div class="field">
            <label>进程匹配 (find-process-mode)</label>
            <select class="select" data-bind="core.findProcessMode">
              ${['strict', 'always', 'off'].map((m) => `<option value="${m}" ${c.findProcessMode === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>地区 URLTest 容差 (tolerance ms)</label>
            <input type="number" class="input mono" data-bind="core.regionTolerance" data-type="number" value="${esc(c.regionTolerance)}" />
          </div>
          <div class="field">
            <label>策略组测速间隔 (interval 秒)</label>
            <input type="number" class="input mono" data-bind="core.groupInterval" data-type="number" value="${esc(c.groupInterval)}" />
          </div>
          <div class="field">
            <label>策略组测速超时 (timeout ms)</label>
            <input type="number" class="input mono" data-bind="core.groupTimeout" data-type="number" value="${esc(c.groupTimeout)}" />
          </div>
          <div class="field">
            <label>测速最大失败次数 (max-failed-times)</label>
            <input type="number" class="input mono" data-bind="core.groupMaxFailedTimes" data-type="number" value="${esc(c.groupMaxFailedTimes)}" />
          </div>
          <div class="field">
            <label>默认测速地址 (groupBaseOption.url)</label>
            <input class="input mono" data-bind="core.groupUrl" value="${esc(c.groupUrl)}" />
          </div>
        </div>

        <div class="switch-grid" style="margin-top: 12px">
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">策略组惰性测速</div>
              <div class="switch-cell-sub">groupBaseOption.lazy</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.groupLazy" ${c.groupLazy ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">默认隐藏策略组</div>
              <div class="switch-cell-sub">groupBaseOption.hidden</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.groupHidden" ${c.groupHidden ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">记忆上次选择的节点</div>
              <div class="switch-cell-sub">profile.store-selected</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.profileStoreSelected" ${c.profileStoreSelected ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">持久化 Fake-IP 缓存</div>
              <div class="switch-cell-sub">profile.store-fake-ip</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.profileStoreFakeIp" ${c.profileStoreFakeIp ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">CORS 允许私有网络访问 ${heldPill()}</div>
              <div class="switch-cell-sub">allow-private-network</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.corsAllowPrivateNetwork" ${c.corsAllowPrivateNetwork ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="field">
            <label>CORS 允许来源 (allow-origins，每行一个) ${heldPill()}</label>
            <textarea class="textarea mono" rows="1" style="min-height: 44px" data-lines="core.corsAllowOrigins">${esc((c.corsAllowOrigins || ['*']).join('\n'))}</textarea>
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">TUN 虚拟网卡</h3>
        </div>
        <div class="switch-grid">
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">启用 TUN ${heldPill()}</div>
              <div class="switch-cell-sub">tun.enable</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="tun.enable" ${t.enable ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">严格路由 ${heldPill()}</div>
              <div class="switch-cell-sub">strict-route</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="tun.strictRoute" ${t.strictRoute ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">自动配置路由 ${heldPill()}</div>
              <div class="switch-cell-sub">auto-route</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="tun.autoRoute" ${t.autoRoute ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">自动重定向 ${heldPill()}</div>
              <div class="switch-cell-sub">auto-redirect</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="tun.autoRedirect" ${t.autoRedirect ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">自动检测出口网卡 ${heldPill()}</div>
              <div class="switch-cell-sub">auto-detect-interface</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="tun.autoDetectInterface" ${t.autoDetectInterface ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">启用 GSO 分段卸载</div>
              <div class="switch-cell-sub">gso</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="tun.gso" ${t.gso ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
        </div>
        <div class="form-grid" style="margin-bottom: 12px">
          <div class="field">
            <label>协议栈 (stack) ${heldPill()}</label>
            <select class="select" data-bind="tun.stack">
              ${['mixed', 'system', 'gvisor'].map((st) => `<option value="${st}" ${t.stack === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>网卡名称 (device) ${heldPill()}</label>
            <input class="input mono" data-bind="tun.device" value="${esc(t.device)}" />
          </div>
          <div class="field">
            <label>MTU ${heldPill()}</label>
            <input type="number" class="input mono" data-bind="tun.mtu" data-type="number" value="${esc(t.mtu)}" />
          </div>
          <div class="field">
            <label>GSO 最大尺寸 (gso-max-size)</label>
            <input type="number" class="input mono" data-bind="tun.gsoMaxSize" data-type="number" value="${esc(t.gsoMaxSize)}" />
          </div>
          <div class="field">
            <label>排除网卡 (exclude-interface，每行一个)</label>
            <textarea class="textarea mono" rows="2" data-lines="tun.excludeInterface">${esc((t.excludeInterface || []).join('\n'))}</textarea>
          </div>
          <div class="field">
            <label>DNS 劫持 (dns-hijack，每行一个) ${heldPill()}</label>
            <textarea class="textarea mono" rows="2" data-lines="tun.dnsHijack">${esc((t.dnsHijack || []).join('\n'))}</textarea>
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">Sniffer 域名嗅探与 NTP 时间同步</h3>
        </div>
        <div class="switch-grid">
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">强制对映射流量嗅探</div>
              <div class="switch-cell-sub">force-dns-mapping</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="snifferConfig.forceDnsMapping" ${s.forceDnsMapping ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">解析纯 IP 流量</div>
              <div class="switch-cell-sub">parse-pure-ip</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="snifferConfig.parsePureIp" ${s.parsePureIp ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">覆盖连接目标地址</div>
              <div class="switch-cell-sub">override-destination</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="snifferConfig.overrideDestination" ${s.overrideDestination ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">启用 NTP 校时</div>
              <div class="switch-cell-sub">ntp.enable</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="ntp.enable" ${n.enable ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">NTP 写入系统时间</div>
              <div class="switch-cell-sub">ntp.write-to-system</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="ntp.writeToSystem" ${n.writeToSystem ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="field">
            <label>NTP 服务器 (ntp.server)</label>
            <input class="input mono" data-bind="ntp.server" value="${esc(n.server)}" />
          </div>
        </div>
        <div class="form-grid-3" style="margin-bottom: 12px">
          <div class="field">
            <label>TLS 嗅探端口 (sniff.TLS)</label>
            <input class="input mono" data-bind="snifferConfig.tlsPorts" value="${esc(s.tlsPorts)}" placeholder="443, 8443" />
          </div>
          <div class="field">
            <label>HTTP 嗅探端口 (sniff.HTTP)</label>
            <input class="input mono" data-bind="snifferConfig.httpPorts" value="${esc(s.httpPorts)}" placeholder="80, 8080-8880" />
          </div>
          <div class="field">
            <label>QUIC 嗅探端口 (sniff.QUIC)</label>
            <input class="input mono" data-bind="snifferConfig.quicPorts" value="${esc(s.quicPorts)}" placeholder="443, 8443" />
          </div>
        </div>
        <div class="field">
          <label>Sniffer 跳过域名 (skip-domain，每行一个)</label>
          <textarea class="textarea mono" rows="2" data-lines="snifferConfig.skipDomain">${esc((s.skipDomain || []).join('\n'))}</textarea>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">GeoData 与 GeoX 数据库</h3>
        </div>
        <div class="switch-grid">
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">GeoData 模式</div>
              <div class="switch-cell-sub">geodata-mode</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.geodataMode" ${c.geodataMode ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="switch-cell">
            <div>
              <div class="switch-cell-title">Geo 数据库自动更新</div>
              <div class="switch-cell-sub">geo-auto-update</div>
            </div>
            <label class="switch">
              <input type="checkbox" data-bind="core.geoAutoUpdate" ${c.geoAutoUpdate ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>加载模式 (geodata-loader)</label>
            <select class="select" data-bind="core.geodataLoader">
              <option value="memconservative" ${c.geodataLoader === 'memconservative' ? 'selected' : ''}>memconservative</option>
              <option value="standard" ${c.geodataLoader === 'standard' ? 'selected' : ''}>standard</option>
            </select>
          </div>
          <div class="field">
            <label>自动更新间隔 (geo-update-interval 小时)</label>
            <input type="number" class="input mono" data-bind="core.geoUpdateInterval" data-type="number" value="${esc(c.geoUpdateInterval)}" />
          </div>
          <div class="field span-2">
            <label>geoip</label>
            <input class="input mono" data-bind="core.geoxGeoip" value="${esc(c.geoxGeoip)}" />
          </div>
          <div class="field span-2">
            <label>geosite</label>
            <input class="input mono" data-bind="core.geoxGeosite" value="${esc(c.geoxGeosite)}" />
          </div>
          <div class="field span-2">
            <label>mmdb</label>
            <input class="input mono" data-bind="core.geoxMmdb" value="${esc(c.geoxMmdb)}" />
          </div>
          <div class="field span-2">
            <label>asn</label>
            <input class="input mono" data-bind="core.geoxAsn" value="${esc(c.geoxAsn)}" />
          </div>
        </div>
      </div>
    `
  }

  function renderExcludedNodesCardMarkup(analysis) {
    if (!analysis || !analysis.excluded || analysis.excluded.length === 0) return ''
    return `
      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">被高倍率规则过滤的节点 (&gt; ${esc(state.args.globalRatioLimit)}x)</h3>
        </div>
        <div class="chip-group">
          ${analysis.excluded
            .map((item) => `<span class="pill pill-amber">${esc(item.name)} (${item.ratio}x)</span>`)
            .join('')}
        </div>
      </div>
    `
  }

  function renderNodesSection() {
    const analysis = lastPreviewResult ? lastPreviewResult.analysis : { kept: [], excluded: [] }

    elEditor.innerHTML = `
      <div class="pane-header">
        <div>
          <h2 class="pane-title">模拟订阅节点</h2>
          <p class="pane-desc">仅用于右侧预览（不写入脚本），支持粘贴节点名或 Clash YAML <code>proxies</code>。</p>
        </div>
        <button class="btn btn-sm" id="btn-reset-sample-nodes">恢复示例节点</button>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3 class="section-card-title">节点输入列表</h3>
          <div class="chip-group">
            <span id="nodes-kept-pill" class="pill pill-green">保留 ${analysis.kept.length} 个</span>
            <span id="nodes-excluded-pill" class="pill ${analysis.excluded.length > 0 ? 'pill-amber' : 'pill-gray'}">倍率过滤 ${analysis.excluded.length} 个</span>
          </div>
        </div>
        <textarea class="textarea mono" rows="15" data-bind="sampleNodesText" placeholder="每行一个节点名称，例如：\n🇭🇰 香港 01 | IEPL 1x\n🇺🇸 美国 01 | 洛杉矶 1.5x">${esc(state.sampleNodesText)}</textarea>
      </div>

      <div id="nodes-excluded-wrap">${renderExcludedNodesCardMarkup(analysis)}</div>
    `
  }

  // ===== Render Right Preview Pane =====
  function renderPreview() {
    // Update tab highlight
    elPreviewTabs.querySelectorAll('.tab-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === activePreviewTab)
    })

    if (!lastPreviewResult || !lastPreviewResult.ok) {
      elPreviewExtra.innerHTML = ''
      elPreviewBody.innerHTML = `
        <div class="error-banner">
          <strong>脚本执行报错：</strong>${esc(lastPreviewResult?.error || '未知错误')}
        </div>
        <div class="code-box-wrap">
          <div class="code-box-head"><span>当前生成的 global_script.js</span></div>
          <pre class="code-pre">${esc(lastScriptCode)}</pre>
        </div>
      `
      return
    }

    if (activePreviewTab === 'groups') renderPreviewGroups()
    else if (activePreviewTab === 'rules') renderPreviewRules()
    else if (activePreviewTab === 'yaml') renderPreviewYaml()
    else if (activePreviewTab === 'js') renderPreviewJs()
  }

  function getVisiblePreviewGroups() {
    const groups = lastPreviewResult?.config?.['proxy-groups'] || []
    const q = groupSearch.trim().toLowerCase()
    return groups.filter((g) => !q || g.name.toLowerCase().includes(q))
  }

  function renderPreviewGroupsListMarkup(visibleGroups) {
    if (visibleGroups.length === 0) {
      return `<div class="empty-state">暂无匹配的代理组${!state.args.enable ? '（脚本未启用）' : ''}</div>`
    }
    return `
      <div class="verge-group-list">
        ${visibleGroups.map((g) => renderVergeGroupCard(g)).join('')}
      </div>
    `
  }

  function updateExpandAllButton(visibleGroups) {
    const allExpanded = visibleGroups.length > 0 && visibleGroups.every((g) => expandedPreviewGroups.has(g.name))
    const btn = document.getElementById('btn-toggle-expand-all')
    if (btn) {
      btn.textContent = allExpanded ? '全部收起' : '全部展开'
    } else {
      elPreviewExtra.innerHTML = `
        <button class="btn btn-sm btn-ghost" id="btn-toggle-expand-all">${allExpanded ? '全部收起' : '全部展开'}</button>
      `
    }
  }

  function renderDiagnosticsBanner() {
    const visible = (lastDiagnostics || []).filter((item) => !String(item.code || '').startsWith('shadow-'))
    if (visible.length === 0) return ''
    const hasError = visible.some((d) => d.level === 'error')
    return `
      <div class="diag-banner ${hasError ? 'is-error' : 'is-warn'}">
        <div class="diag-head">
          <strong>${hasError ? '配置静态诊断异常' : '配置静态诊断提示'} (${visible.length})</strong>
        </div>
        <ul class="diag-list">
          ${visible
            .map(
              (d) =>
                `<li><span class="pill ${d.level === 'error' ? 'pill-red' : 'pill-amber'}">${d.level === 'error' ? '错误' : '提示'}</span><span>${esc(d.message)}</span></li>`
            )
            .join('')}
        </ul>
      </div>
    `
  }

  function renderPreviewGroups() {
    const cfg = lastPreviewResult.config
    const groups = cfg['proxy-groups'] || []
    const visibleGroups = getVisiblePreviewGroups()
    const allExpanded = visibleGroups.length > 0 && visibleGroups.every((g) => expandedPreviewGroups.has(g.name))

    elPreviewExtra.innerHTML = `
      <button class="btn btn-sm btn-ghost" id="btn-toggle-expand-all">${allExpanded ? '全部收起' : '全部展开'}</button>
    `

    const excludedCount = lastPreviewResult.analysis.excluded.length
    const disabledBanner = !state.args.enable
      ? `<div class="error-banner is-warn"><code>enable = false</code>，脚本将直接返回原始订阅。</div>`
      : ''

    const modeHint =
      vergeMode === 'direct'
        ? `<div class="verge-summary-bar is-mode-direct">直连模式模拟：绕过规则直接放行流量。</div>`
        : vergeMode === 'global'
          ? `<div class="verge-summary-bar is-mode-global">全局模式模拟：流量走 GLOBAL，下方仍可检查各策略组。</div>`
          : ''

    elPreviewBody.innerHTML = `
      <div class="verge-header">
        <div class="verge-title">代理组</div>
        <div class="verge-mode-switch" role="group" aria-label="代理模式模拟">
          <button class="verge-mode-btn ${vergeMode === 'rule' ? 'active' : ''}" data-verge-mode="rule">规则</button>
          <button class="verge-mode-btn ${vergeMode === 'global' ? 'active' : ''}" data-verge-mode="global">全局</button>
          <button class="verge-mode-btn ${vergeMode === 'direct' ? 'active' : ''}" data-verge-mode="direct">直连</button>
        </div>
      </div>

      ${disabledBanner}
      ${renderDiagnosticsBanner()}
      ${modeHint}

      <div class="verge-summary-bar">
        <div class="verge-summary-stats">
          <span><strong>${groups.length}</strong> 策略组</span>
          <span>·</span>
          <span><strong>${lastPreviewResult.analysis.kept.length}</strong> 可用节点</span>
          ${excludedCount > 0 ? `<span>·</span><span style="color:var(--warning)">已过滤 <strong>${excludedCount}</strong> 高倍率</span>` : ''}
        </div>
        <input id="preview-group-search" class="input" style="width: 155px; height: 26px; font-size: 12px" placeholder="过滤代理组..." value="${esc(groupSearch)}" />
      </div>

      <div id="preview-group-list-wrap">
        ${renderPreviewGroupsListMarkup(visibleGroups)}
      </div>
    `
  }

  function renderVergeGroupCard(g) {
    const isExpanded = expandedPreviewGroups.has(g.name)
    const proxies = g.proxies || []
    const typeLabel =
      g.type === 'url-test'
        ? 'URLTest'
        : g.type === 'fallback'
          ? 'Fallback'
          : g.type === 'load-balance'
            ? 'LoadBalance'
            : 'Selector'
    const isUrlTest = g.type === 'url-test'
    const currentSelected =
      simulatedSelections[g.name] && proxies.includes(simulatedSelections[g.name])
        ? simulatedSelections[g.name]
        : proxies[0] || '-'
    const specialNames = new Set([
      state.builtinProxies?.directName || '直连',
      state.builtinProxies?.rejectName || '拒绝',
      state.systemGroups?.defaultGroup?.name || '默认节点',
      state.systemGroups?.cnGroup?.name || '国内网站',
      'DIRECT',
      'REJECT',
    ])

    return `
      <div class="verge-group-card ${isExpanded ? 'is-expanded' : ''}">
        <div class="verge-group-row" data-verge-toggle="${esc(g.name)}">
          <div class="verge-group-left">
            <div class="verge-group-icon">${renderIconThumb(g.icon, g.name)}</div>
            <div class="verge-group-meta">
              <div class="verge-group-name">${esc(g.name)}</div>
              <div class="verge-group-sub">
                <span class="verge-type-tag ${isUrlTest ? 'is-urltest' : ''}">${typeLabel}</span>
                <span class="verge-selected-now">${esc(currentSelected)}</span>
              </div>
            </div>
          </div>
          <div class="verge-group-right">
            <div class="verge-mini-icons" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="15" y2="12"/><line x1="4" y1="17" x2="10" y2="17"/></svg>
            </div>
            <span class="verge-count-badge">${proxies.length}</span>
            <span class="verge-chevron">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </div>
        </div>
        ${
          isExpanded
            ? `
          <div class="verge-nodes-panel">
            <div class="verge-nodes-grid">
              ${proxies
                .map((pName) => {
                  const selected = pName === currentSelected
                  const isSpecial = specialNames.has(pName)
                  return `
                    <button class="verge-node-item ${selected ? 'is-selected' : ''}" data-verge-group="${esc(g.name)}" data-verge-proxy="${esc(pName)}">
                      <div class="verge-node-name" title="${esc(pName)}">${esc(pName)}</div>
                      <div class="verge-node-meta">
                        <span>${isSpecial ? '内置/策略组' : isUrlTest ? '节点' : '策略引用'}</span>
                        <span class="verge-node-delay">${pseudoDelay(pName)}</span>
                      </div>
                    </button>
                  `
                })
                .join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>
    `
  }

  function renderRuleTesterResultMarkup(simResult) {
    if (!ruleTestQuery.trim()) return ''
    if (!simResult || !simResult.matched) {
      return '<div class="rule-test-result is-miss">未命中静态规则（请输入有效域名、URL 或端口，如 <code>downloads.cursor.com</code> / <code>port:22</code>）。</div>'
    }
    const m = simResult.matched
    const chainHtml = simResult.chain.map((step) => `<span class="rule-chain-step">${esc(step)}</span>`).join('<span class="rule-chain-arrow">→</span>')
    const dynCount = simResult.passedDynamic.length
    const dynNote =
      dynCount > 0
        ? `<div class="rule-test-note">此前经过 ${dynCount} 条 <code>GEOSITE</code> / <code>GEOIP</code> / <code>RULE-SET</code> 规则（若命中规则库将优先分流）。</div>`
        : ''
    return `
      <div class="rule-test-result">
        <div class="rule-test-hit">
          <span class="pill pill-green">命中 #${m.idx}</span>
          <code class="rule-test-raw">${esc(m.raw)}</code>
        </div>
        ${simResult.chain.length > 0 ? `<div class="rule-chain">${chainHtml}</div>` : ''}
        ${dynNote}
      </div>
    `
  }

  function renderPreviewRulesTableMarkup(matchedRuleIdx) {
    const cfg = lastPreviewResult?.config || {}
    const rules = cfg.rules || []
    const q = ruleSearch.trim().toLowerCase()
    const validTargets = new Set([
      'DIRECT',
      'REJECT',
      'REJECT-DROP',
      'PASS',
      'COMPATIBLE',
      ...(cfg['proxy-groups'] || []).map((g) => g.name),
      ...(cfg.proxies || []).map((p) => p.name),
    ])

    const filtered = rules
      .map((raw, idx) => {
        const parts = String(raw).split(',')
        const type = parts[0] || ''
        const target = parts.length >= 3 ? parts[2] : parts[1] || ''
        const payload = parts.length >= 3 ? parts[1] : parts[0] === 'MATCH' ? '*' : parts[1] || ''
        return { idx: idx + 1, raw, type, payload, target }
      })
      .filter((r) => !q || r.raw.toLowerCase().includes(q))

    const directName = state.builtinProxies?.directName || '直连'
    const rejectName = state.builtinProxies?.rejectName || '拒绝'
    const rejectGroups = new Set(state.services.filter((s) => s.reject).map((s) => s.name))

    if (filtered.length === 0) {
      return '<div class="empty-state" style="border:none">无匹配的分流规则</div>'
    }

    return filtered
      .map((r) => {
        const isDead = r.target && !validTargets.has(r.target)
        const isHit = matchedRuleIdx && r.idx === matchedRuleIdx
        const targetCls = isDead
          ? 'is-reject'
          : r.target === directName || r.target === 'DIRECT'
            ? 'is-direct'
            : r.target === rejectName || r.target === 'REJECT' || rejectGroups.has(r.target)
              ? 'is-reject'
              : ''
        return `
          <div class="rule-row ${isHit ? 'is-matched' : ''}">
            <span class="rule-idx">#${r.idx}</span>
            <span class="rule-type">${esc(r.type)}</span>
            <span class="rule-payload" title="${esc(r.raw)}">${esc(r.payload)}</span>
            <span class="rule-target ${targetCls}" ${isDead ? 'title="目标策略组或节点未定义"' : ''}>${esc(r.target)}${isDead ? ' !' : ''}</span>
          </div>
        `
      })
      .join('')
  }

  function renderPreviewRules() {
    const cfg = lastPreviewResult.config
    const rules = cfg.rules || []
    const providers = cfg['rule-providers'] || {}
    const providerEntries = Object.entries(providers)
    const simResult = ruleTestQuery.trim() ? simulateRuleMatch(ruleTestQuery, cfg, simulatedSelections) : null

    elPreviewExtra.innerHTML = `<span class="pill pill-blue">${rules.length} 规则 / ${providerEntries.length} 规则集</span>`

    elPreviewBody.innerHTML = `
      ${renderDiagnosticsBanner()}

      <div class="section-card rule-tester-card">
        <div class="section-card-head" style="margin-bottom: 8px">
          <h3 class="section-card-title">分流命中测试</h3>
          <div class="chip-group">
            <button class="chip" data-test-sample="downloads.cursor.com">downloads.cursor.com</button>
            <button class="chip" data-test-sample="gemini.google.com">gemini.google.com</button>
            <button class="chip" data-test-sample="api.openai.com">api.openai.com</button>
            <button class="chip" data-test-sample="port:22">port:22</button>
          </div>
        </div>
        <input id="preview-rule-tester" class="input mono" placeholder="输入域名、URL 或端口测试命中，例如 api.cursor.sh / https://claude.ai / port:22..." value="${esc(ruleTestQuery)}" />
        <div id="preview-rule-test-result">${renderRuleTesterResultMarkup(simResult)}</div>
      </div>

      <div class="verge-search-row">
        <input id="preview-rule-search" class="input" placeholder="搜索规则（如 GEOSITE、国外AI、22、RULE-SET）..." value="${esc(ruleSearch)}" />
      </div>

      ${
        providerEntries.length > 0
          ? `
        <div class="section-card" style="padding: 12px 14px; margin-bottom: 12px">
          <div class="section-card-head" style="margin-bottom: 8px">
            <h3 class="section-card-title">生效的 Rule-Providers (${providerEntries.length})</h3>
          </div>
          <div class="chip-group">
            ${providerEntries
              .map(([k, p]) => `<span class="pill pill-gray" title="${esc(p.url)}">${esc(k)} (${esc(p.format)}/${esc(p.behavior)})</span>`)
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      <div class="rules-table" id="preview-rules-table">
        ${renderPreviewRulesTableMarkup(simResult?.matched?.idx)}
      </div>
    `
  }

  function renderPreviewYaml() {
    const yamlText = toYaml(lastPreviewResult.config)
    const lineCount = yamlText.split('\n').length

    elPreviewExtra.innerHTML = `<button class="btn btn-sm" id="btn-copy-yaml">复制 YAML</button>`
    elPreviewBody.innerHTML = `
      <div class="code-box-wrap">
        <div class="code-box-head">
          <span>main(config) 运行输出（Mihomo YAML 预览）</span>
          <span>${lineCount} 行</span>
        </div>
        <pre class="code-pre">${esc(yamlText)}</pre>
      </div>
    `
  }

  function renderPreviewJs() {
    const lineCount = lastScriptCode.split('\n').length
    elPreviewExtra.innerHTML = `<button class="btn btn-sm" id="btn-copy-js-inline">复制源码</button>`
    elPreviewBody.innerHTML = `
      <div class="code-box-wrap">
        <div class="code-box-head">
          <span>global_script.js（可直接粘贴至 Clash Verge 全局扩展脚本）</span>
          <span>${lineCount} 行</span>
        </div>
        <pre class="code-pre">${esc(lastScriptCode)}</pre>
      </div>
    `
  }

  // ===== Icon Picker Modal =====
  function openIconPicker(onSelect) {
    iconPickerCallback = onSelect
    iconPickerCategory = '全部'
    iconPickerQuery = ''
    elIconSearch.value = ''
    renderIconPicker()
    elIconModal.classList.remove('hidden')
    elIconSearch.focus()
  }

  function closeIconPicker() {
    elIconModal.classList.add('hidden')
    iconPickerCallback = null
  }

  function renderIconPicker() {
    const cats = ['全部', '服务', '流媒体', '社交', '开发', '系统', '地区']
    elIconCats.innerHTML = cats
      .map(
        (cat) => `
          <button class="chip" style="${cat === iconPickerCategory ? 'border-color:var(--accent);color:var(--accent);background:var(--accent-soft)' : ''}" data-icon-cat="${cat}">${cat}</button>
        `
      )
      .join('')

    const q = iconPickerQuery.trim().toLowerCase()
    const items = QURE_ICONS.filter((it) => {
      if (iconPickerCategory !== '全部' && it.category !== iconPickerCategory) return false
      if (q && !it.name.toLowerCase().includes(q) && !it.url.toLowerCase().includes(q)) return false
      return true
    })

    elIconGrid.innerHTML = items
      .map(
        (it) => `
          <button class="icon-tile" data-icon-url="${esc(it.url)}">
            <img src="${esc(resolvePreviewIcon(it.url))}" alt="" loading="lazy" />
            <span title="${esc(it.name)}">${esc(it.name)}</span>
          </button>
        `
      )
      .join('')
  }

  // ===== Path Binding Helper =====
  function setByPath(obj, path, val) {
    const parts = path.split('.')
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur[parts[i]]
    }
    cur[parts[parts.length - 1]] = val
  }

  // ===== Clipboard & File Helpers =====
  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`已复制${label}`)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      document.body.removeChild(ta)
      showToast(ok ? `已复制${label}` : '复制失败，请手动选中复制')
    }
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(`已下载 ${filename}`)
  }

  // ===== Global Event Delegation =====
  elNav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav]')
    if (!btn) return
    activeSection = btn.dataset.nav
    renderNav()
    renderEditor()
  })

  elPreviewTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]')
    if (!btn) return
    activePreviewTab = btn.dataset.tab
    renderPreview()
  })

  elPreviewExtra.addEventListener('click', (e) => {
    if (e.target.closest('#btn-toggle-expand-all')) {
      const visibleGroups = getVisiblePreviewGroups()
      const visibleNames = visibleGroups.map((g) => g.name)
      const allOpen = visibleNames.length > 0 && visibleNames.every((n) => expandedPreviewGroups.has(n))
      if (allOpen) {
        visibleNames.forEach((n) => expandedPreviewGroups.delete(n))
      } else {
        visibleNames.forEach((n) => expandedPreviewGroups.add(n))
      }
      const listWrap = document.getElementById('preview-group-list-wrap')
      if (listWrap) {
        listWrap.innerHTML = renderPreviewGroupsListMarkup(visibleGroups)
        updateExpandAllButton(visibleGroups)
      } else {
        renderPreviewGroups()
      }
    } else if (e.target.closest('#btn-copy-yaml')) {
      copyText(toYaml(lastPreviewResult.config), '输出 YAML')
    } else if (e.target.closest('#btn-copy-js-inline')) {
      copyText(lastScriptCode, ' global_script.js')
    }
  })

  elPreviewBody.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-verge-mode]')
    if (modeBtn) {
      vergeMode = modeBtn.dataset.vergeMode
      renderPreviewGroups()
      return
    }

    const toggleRow = e.target.closest('[data-verge-toggle]')
    if (toggleRow) {
      const gName = toggleRow.dataset.vergeToggle
      if (expandedPreviewGroups.has(gName)) expandedPreviewGroups.delete(gName)
      else expandedPreviewGroups.add(gName)
      renderPreviewGroups()
      return
    }

    const sampleBtn = e.target.closest('[data-test-sample]')
    if (sampleBtn) {
      ruleTestQuery = sampleBtn.dataset.testSample
      const tester = document.getElementById('preview-rule-tester')
      if (tester) tester.value = ruleTestQuery
      const simResult = simulateRuleMatch(ruleTestQuery, lastPreviewResult?.config, simulatedSelections)
      const resEl = document.getElementById('preview-rule-test-result')
      if (resEl) resEl.innerHTML = renderRuleTesterResultMarkup(simResult)
      const rulesTable = document.getElementById('preview-rules-table')
      if (rulesTable) rulesTable.innerHTML = renderPreviewRulesTableMarkup(simResult?.matched?.idx)
      return
    }

    const selectBtn = e.target.closest('[data-verge-group][data-verge-proxy]')
    if (selectBtn) {
      const gName = selectBtn.dataset.vergeGroup
      const pName = selectBtn.dataset.vergeProxy
      simulatedSelections[gName] = pName
      renderPreviewGroups()
      showToast(`已模拟切换「${gName}」→「${pName}」`)
    }
  })

  elPreviewBody.addEventListener('input', (e) => {
    if (e.target.id === 'preview-group-search') {
      groupSearch = e.target.value
      const visibleGroups = getVisiblePreviewGroups()
      const listWrap = document.getElementById('preview-group-list-wrap')
      if (listWrap) {
        listWrap.innerHTML = renderPreviewGroupsListMarkup(visibleGroups)
        updateExpandAllButton(visibleGroups)
      }
    } else if (e.target.id === 'preview-rule-search') {
      ruleSearch = e.target.value
      const simResult = ruleTestQuery.trim()
        ? simulateRuleMatch(ruleTestQuery, lastPreviewResult?.config, simulatedSelections)
        : null
      const rulesTable = document.getElementById('preview-rules-table')
      if (rulesTable) {
        rulesTable.innerHTML = renderPreviewRulesTableMarkup(simResult?.matched?.idx)
      }
    } else if (e.target.id === 'preview-rule-tester') {
      ruleTestQuery = e.target.value
      const simResult = ruleTestQuery.trim()
        ? simulateRuleMatch(ruleTestQuery, lastPreviewResult?.config, simulatedSelections)
        : null
      const resEl = document.getElementById('preview-rule-test-result')
      if (resEl) resEl.innerHTML = renderRuleTesterResultMarkup(simResult)
      const rulesTable = document.getElementById('preview-rules-table')
      if (rulesTable) rulesTable.innerHTML = renderPreviewRulesTableMarkup(simResult?.matched?.idx)
    }
  })

  // Editor Input Events (Preserve Focus — Only Recompute Right Preview!)
  elEditor.addEventListener('input', (e) => {
    const el = e.target

    if (el.id === 'service-search-input') {
      serviceSearch = el.value
      const listEl = document.getElementById('service-entity-list')
      if (listEl) {
        listEl.innerHTML = renderServicesListMarkup()
      }
      return
    }

    if (el.dataset.bind) {
      let val = el.type === 'checkbox' ? el.checked : el.value
      if (el.dataset.type === 'number') val = el.value.trim() === '' ? '' : Number(el.value)
      setByPath(state, el.dataset.bind, val)
      recomputePreview()
      if (el.dataset.bind === 'exportOptions.includeVergeManaged') {
        renderEditor()
        return
      }
      if (activeSection === 'nodes' && lastPreviewResult) {
        // Update stats & excluded nodes card without stealing textarea focus
        const keptPill = document.getElementById('nodes-kept-pill')
        const excPill = document.getElementById('nodes-excluded-pill')
        const excWrap = document.getElementById('nodes-excluded-wrap')
        const analysis = lastPreviewResult.analysis
        if (keptPill) keptPill.textContent = `保留 ${analysis.kept.length} 个`
        if (excPill) {
          excPill.className = `pill ${analysis.excluded.length > 0 ? 'pill-amber' : 'pill-gray'}`
          excPill.textContent = `倍率过滤 ${analysis.excluded.length} 个`
        }
        if (excWrap) excWrap.innerHTML = renderExcludedNodesCardMarkup(analysis)
      } else if (
        activeSection === 'general' &&
        (el.dataset.bind === 'args.excludeHighPercentage' ||
          el.dataset.bind === 'args.multiplierRegex' ||
          el.dataset.bind === 'args.multiplierFlags' ||
          el.dataset.bind === 'args.globalRatioLimit')
      ) {
        const valid = lastPreviewResult?.analysis?.multiplierValid !== false
        const regexPill = document.getElementById('multiplier-regex-pill')
        if (regexPill) {
          regexPill.className = `pill ${valid ? 'pill-green' : 'pill-red'}`
          regexPill.textContent = valid ? '正则有效' : '正则语法错误'
        }
        const excCount = lastPreviewResult ? lastPreviewResult.analysis.excluded.length : 0
        const excPill = document.getElementById('multiplier-excluded-pill')
        if (excPill) {
          excPill.className = `pill ${excCount > 0 ? 'pill-amber' : 'pill-gray'}`
          excPill.textContent = `当前模拟订阅已过滤 ${excCount} 个节点`
        }
      }
      return
    }

    if (el.dataset.lines) {
      const lines = el.value.split(/\r?\n/)
      setByPath(state, el.dataset.lines, lines)
      recomputePreview()
      return
    }

    if (el.dataset.csv) {
      const items = el.value
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      setByPath(state, el.dataset.csv, items)
      recomputePreview()
      return
    }

    if (el.dataset.builtinProv) {
      const [idxStr, field] = el.dataset.builtinProv.split(':')
      state.builtinProviders[Number(idxStr)][field] = el.value
      recomputePreview()
      return
    }

    if (el.dataset.svcField) {
      const [idxStr, field] = el.dataset.svcField.split(':')
      const idx = Number(idxStr)
      state.services[idx][field] = el.value
      recomputePreview()
      refreshServiceCardHeaders()
      if (field === 'name') {
        const slot = document.getElementById(`svc-sync-slot-${idx}`)
        if (slot) slot.innerHTML = renderServiceRuleSyncSlot(state.services[idx], idx)
      }
      return
    }

    if (el.dataset.svcRules) {
      const idx = Number(el.dataset.svcRules)
      state.services[idx].rules = el.value.split(/\r?\n/)
      recomputePreview()
      refreshServiceCardHeaders()
      const slot = document.getElementById(`svc-sync-slot-${idx}`)
      if (slot) slot.innerHTML = renderServiceRuleSyncSlot(state.services[idx], idx)
      return
    }

    if (el.dataset.svcProv) {
      const [idxStr, pIdxStr, field] = el.dataset.svcProv.split(':')
      state.services[Number(idxStr)].providers[Number(pIdxStr)][field] = el.value
      recomputePreview()
      return
    }

    if (el.dataset.regField) {
      const [idxStr, field] = el.dataset.regField.split(':')
      state.regions[Number(idxStr)][field] = el.value
      recomputePreview()
      refreshRegionCardHeaders()
      return
    }

    if (el.dataset.dnsPolicy) {
      const [idxStr, field] = el.dataset.dnsPolicy.split(':')
      state.dnsExtra.nameserverPolicy[Number(idxStr)][field] = el.value
      recomputePreview()
      return
    }
  })

  // Editor Change Events (Checkboxes & Selects that need structural UI refresh)
  elEditor.addEventListener('change', (e) => {
    const el = e.target

    if (el.dataset.svcToggle !== undefined) {
      const idx = Number(el.dataset.svcToggle)
      state.services[idx].enabled = el.checked
      recomputePreview()
      renderServicesSection()
      return
    }

    if (el.dataset.svcBool) {
      const [idxStr, field] = el.dataset.svcBool.split(':')
      state.services[Number(idxStr)][field] = el.checked
      recomputePreview()
      renderServicesSection()
      return
    }

    if (el.dataset.regToggle !== undefined) {
      const idx = Number(el.dataset.regToggle)
      state.regions[idx].enabled = el.checked
      recomputePreview()
      renderRegionsSection()
      return
    }
  })

  // Editor Click Events
  elEditor.addEventListener('click', (e) => {
    const t = e.target

    const ghBtn = t.closest('[data-set-ghproxy]')
    if (ghBtn) {
      state.args.githubProxy = ghBtn.dataset.setGhproxy
      recomputePreview()
      renderGeneralSection()
      return
    }

    const dnsModeBtn = t.closest('[data-dns-mode]')
    if (dnsModeBtn) {
      const modeId = dnsModeBtn.dataset.dnsMode
      state.args.mode = modeId
      const preset = DNS_MODES.find((m) => m.id === modeId)
      if (preset && preset.values) {
        Object.assign(state.args, preset.values)
      }
      recomputePreview()
      renderDnsSection()
      return
    }

    if (t.closest('#btn-add-builtin-prov')) {
      pushUndo('添加预置规则集')
      state.builtinProviders.push({
        key: 'custom-provider',
        behavior: 'classical',
        format: 'text',
        url: 'https://example.com/rules.list',
        path: './ruleset/custom/rules.list',
      })
      recomputePreview()
      renderDnsSection()
      return
    }

    const delBuiltinProv = t.closest('[data-del-builtin-prov]')
    if (delBuiltinProv) {
      pushUndo('删除预置规则集')
      state.builtinProviders.splice(Number(delBuiltinProv.dataset.delBuiltinProv), 1)
      recomputePreview()
      renderDnsSection()
      return
    }

    if (t.closest('#btn-add-dns-policy')) {
      pushUndo('添加 DNS 分流策略')
      state.dnsExtra.nameserverPolicy.push({ match: 'geosite:', target: '$foreignDNS' })
      recomputePreview()
      renderDnsSection()
      return
    }

    const delPolicy = t.closest('[data-del-dns-policy]')
    if (delPolicy) {
      pushUndo('删除 DNS 分流策略')
      state.dnsExtra.nameserverPolicy.splice(Number(delPolicy.dataset.delDnsPolicy), 1)
      recomputePreview()
      renderDnsSection()
      return
    }

    // Service actions
    if (t.closest('[data-toggle-bundles]')) {
      bundlesOpen = !bundlesOpen
      bundleInfoId = ''
      renderServicesSection()
      return
    }

    const bundleInfo = t.closest('[data-bundle-info]')
    if (bundleInfo) {
      const id = bundleInfo.dataset.bundleInfo
      bundleInfoId = bundleInfoId === id ? '' : id
      renderServicesSection()
      return
    }

    const bundleAction = t.closest('[data-bundle-action]')
    if (bundleAction) {
      const bundle = SERVICE_BUNDLES.find((item) => item.id === bundleAction.dataset.bundleId)
      const mode = bundleAction.dataset.bundleAction
      if (bundle && (mode === 'split' || mode === 'merge')) {
        pushUndo(mode === 'split' ? `细分「${bundle.title}」` : `合并「${bundle.title}」`)
        applyServiceBundle(state, bundle.id, mode)
        openServiceIdx = -1
        openServiceOriginalName = ''
        recomputePreview()
        renderServicesSection()
        showToast(mode === 'split' ? `已把「${bundle.title}」拆成 ${bundle.splitKeys.length} 组` : `已合并为「${bundle.mergedName}」`)
      }
      return
    }

    const svcPreset = t.closest('[data-svc-preset]')
    if (svcPreset) {
      const p = svcPreset.dataset.svcPreset
      const dailyKeys = new Set(['openai', 'media', 'social', ...FOREIGN_AI_SPLIT_KEYS, 'youtube', 'netflix', 'telegram', 'ads', 'apple', 'google', 'github', 'microsoft', 'discord', 'x', 'steam', 'netease'])
      const devKeys = new Set(['openai', ...FOREIGN_AI_SPLIT_KEYS, 'google', 'github', 'microsoft', 'ads'])
      if (p === 'devLean') {
        pushUndo('应用「开发精简」预设')
        applyDevLeanPreset(state)
        openServiceIdx = -1
        openServiceOriginalName = ''
        recomputePreview()
        renderServicesSection()
        showToast('已应用「开发精简」预设（Cursor 下载直连，默认与 AI 优先 SG）')
        return
      }
      pushUndo('切换服务组预设')
      state.services.forEach((s) => {
        if (p === 'all') s.enabled = true
        else if (p === 'none') s.enabled = false
        else if (p === 'daily') s.enabled = dailyKeys.has(s.key)
        else if (p === 'dev') s.enabled = devKeys.has(s.key)
      })
      recomputePreview()
      renderServicesSection()
      return
    }

    if (t.closest('#btn-add-service')) {
      pushUndo('新增服务组')
      const existingKeys = new Set(state.services.map((s) => s.key))
      let n = state.services.length + 1
      let id = 'custom_' + n
      while (existingKeys.has(id)) {
        n += 1
        id = 'custom_' + n
      }
      const existingNames = new Set(state.services.map((s) => s.name))
      let svcName = '自定义服务'
      let nameIdx = 2
      while (existingNames.has(svcName)) {
        svcName = `自定义服务 ${nameIdx}`
        nameIdx += 1
      }
      state.services.unshift({
        key: id,
        name: svcName,
        enabled: true,
        preferRegion: '',
        icon: window.YaNetDefaults.QURE_BASE + 'Global.png',
        url: 'https://www.gstatic.com/generate_204',
        reject: false,
        directFirst: false,
        rules: [`DOMAIN-SUFFIX,example.com,${svcName}`],
        providers: [],
      })
      openServiceIdx = 0
      openServiceOriginalName = svcName
      recomputePreview()
      renderServicesSection()
      return
    }

    const syncSvcRules = t.closest('[data-sync-svc-rules]')
    if (syncSvcRules) {
      const idx = Number(syncSvcRules.dataset.syncSvcRules)
      const svc = state.services[idx]
      const oldName = openServiceOriginalName
      const newName = String(svc?.name || '').trim()
      if (svc && oldName && newName && oldName !== newName) {
        pushUndo(`同步「${newName}」规则目标`)
        let replaced = 0
        svc.rules = (svc.rules || []).map((line) => {
          const parts = String(line || '').split(',')
          const type = (parts[0] || '').trim().toUpperCase()
          const targetIdx = type === 'MATCH' ? 1 : 2
          if (parts.length > targetIdx && parts[targetIdx].trim() === oldName) {
            parts[targetIdx] = newName
            replaced += 1
            return parts.join(',')
          }
          return line
        })
        openServiceOriginalName = newName
        recomputePreview()
        renderServicesSection()
        showToast(`已将 ${replaced} 条规则目标同步为「${newName}」`)
      }
      return
    }

    if (t.closest('[data-fix-service-order]')) {
      fixServiceOrder()
      return
    }

    const toggleSvcOpen = t.closest('[data-toggle-svc-open]')
    if (toggleSvcOpen) {
      const idx = Number(toggleSvcOpen.dataset.toggleSvcOpen)
      openServiceIdx = openServiceIdx === idx ? -1 : idx
      openServiceOriginalName = openServiceIdx >= 0 ? String(state.services[openServiceIdx]?.name || '').trim() : ''
      renderServicesSection()
      return
    }

    const moveSvc = t.closest('[data-move-svc]')
    if (moveSvc) {
      const [idx, dir] = moveSvc.dataset.moveSvc.split(':').map(Number)
      const target = idx + dir
      if (target >= 0 && target < state.services.length) {
        pushUndo('调整服务组顺序')
        const [item] = state.services.splice(idx, 1)
        state.services.splice(target, 0, item)
        if (openServiceIdx === idx) openServiceIdx = target
        else if (openServiceIdx === target) openServiceIdx = idx
        recomputePreview()
        renderServicesSection()
        toastServiceOrder(item.name, item.key)
      }
      return
    }

    const addSvcProv = t.closest('[data-add-svc-prov]')
    if (addSvcProv) {
      pushUndo('添加服务规则集')
      const idx = Number(addSvcProv.dataset.addSvcProv)
      const svc = state.services[idx]
      const existingKeys = new Set(
        state.services.flatMap((s) => (s.providers || []).map((p) => p.key))
      )
      const basePrefix = String(svc.key || 'custom').replace(/[^a-zA-Z0-9_-]/g, '') || 'custom'
      let n = (svc.providers || []).length + 1
      let provKey = `${basePrefix}-ruleset-${n}`
      while (existingKeys.has(provKey)) {
        n += 1
        provKey = `${basePrefix}-ruleset-${n}`
      }
      svc.providers.push({
        key: provKey,
        url: 'https://example.com/rules.list',
        path: `./ruleset/custom/${provKey}.list`,
        format: 'text',
        behavior: 'classical',
      })
      recomputePreview()
      renderServicesSection()
      return
    }

    const delSvcProv = t.closest('[data-del-svc-prov]')
    if (delSvcProv) {
      pushUndo('删除服务规则集')
      const [idx, pIdx] = delSvcProv.dataset.delSvcProv.split(':').map(Number)
      state.services[idx].providers.splice(pIdx, 1)
      recomputePreview()
      renderServicesSection()
      return
    }

    const delSvc = t.closest('[data-del-svc]')
    if (delSvc) {
      const idx = Number(delSvc.dataset.delSvc)
      pushUndo(`删除服务组「${state.services[idx]?.name || ''}」`)
      state.services.splice(idx, 1)
      openServiceIdx = -1
      openServiceOriginalName = ''
      recomputePreview()
      renderServicesSection()
      showToast('已删除服务组（可点击顶栏撤销）')
      return
    }

    // Region actions
    const regPreset = t.closest('[data-reg-preset]')
    if (regPreset) {
      pushUndo('切换地区分组预设')
      const p = regPreset.dataset.regPreset
      const corePrefixes = new Set(['HK', 'US', 'JP', 'SG', 'TW'])
      state.regions.forEach((r) => {
        if (p === 'all') r.enabled = true
        else if (p === 'none') r.enabled = false
        else if (p === 'core') r.enabled = corePrefixes.has(r.name.substring(0, 2))
      })
      recomputePreview()
      renderRegionsSection()
      return
    }

    if (t.closest('#btn-add-region')) {
      pushUndo('新增地区分组')
      const extraRegionTemplates = [
        { name: 'FR法国', regex: '法国|🇫🇷|fr|france', icon: 'France.png' },
        { name: 'NL荷兰', regex: '荷兰|🇳🇱|nl|netherlands|amsterdam', icon: 'World_Map.png' },
        { name: 'IN印度', regex: '印度|🇮🇳|in|india', icon: 'India.png' },
        { name: 'AR阿根廷', regex: '阿根廷|🇦🇷|ar|argentina', icon: 'Argentina.png' },
        { name: 'RU俄罗斯', regex: '俄罗斯|🇷🇺|ru|russia', icon: 'Russia.png' },
      ]
      const existingNames = new Set(state.regions.map((r) => r.name))
      const nextTpl = extraRegionTemplates.find((tpl) => !existingNames.has(tpl.name))
      let newRegion
      if (nextTpl) {
        newRegion = {
          name: nextTpl.name,
          regex: nextTpl.regex,
          flags: 'i',
          icon: window.YaNetDefaults.QURE_BASE + nextTpl.icon,
          enabled: true,
        }
      } else {
        let n = state.regions.length + 1
        let regName = `R${n}自定义地区`
        while (existingNames.has(regName)) {
          n += 1
          regName = `R${n}自定义地区`
        }
        newRegion = {
          name: regName,
          regex: 'custom',
          flags: 'i',
          icon: window.YaNetDefaults.QURE_BASE + 'World_Map.png',
          enabled: true,
        }
      }
      state.regions.push(newRegion)
      openRegionIdx = state.regions.length - 1
      recomputePreview()
      renderRegionsSection()
      return
    }

    const toggleRegOpen = t.closest('[data-toggle-reg-open]')
    if (toggleRegOpen) {
      const idx = Number(toggleRegOpen.dataset.toggleRegOpen)
      openRegionIdx = openRegionIdx === idx ? -1 : idx
      renderRegionsSection()
      return
    }

    const moveReg = t.closest('[data-move-reg]')
    if (moveReg) {
      const [idx, dir] = moveReg.dataset.moveReg.split(':').map(Number)
      const target = idx + dir
      if (target >= 0 && target < state.regions.length) {
        pushUndo('调整地区顺序')
        const [item] = state.regions.splice(idx, 1)
        state.regions.splice(target, 0, item)
        if (openRegionIdx === idx) openRegionIdx = target
        else if (openRegionIdx === target) openRegionIdx = idx
        recomputePreview()
        renderRegionsSection()
      }
      return
    }

    const delReg = t.closest('[data-del-reg]')
    if (delReg) {
      const idx = Number(delReg.dataset.delReg)
      pushUndo(`删除地区「${state.regions[idx]?.name || ''}」`)
      state.regions.splice(idx, 1)
      openRegionIdx = -1
      recomputePreview()
      renderRegionsSection()
      showToast('已删除地区分组（可点击顶栏撤销）')
      return
    }

    // Icon Picker trigger
    const pickIconBtn = t.closest('[data-pick-icon]')
    if (pickIconBtn) {
      const [kind, targetKey] = pickIconBtn.dataset.pickIcon.split(':')
      const idx = Number(targetKey)
      openIconPicker((url) => {
        if (kind === 'service') {
          state.services[idx].icon = url
          recomputePreview()
          renderServicesSection()
        } else if (kind === 'region') {
          state.regions[idx].icon = url
          recomputePreview()
          renderRegionsSection()
        } else if (kind === 'sys') {
          state.systemGroups[targetKey].icon = url
          recomputePreview()
          renderSystemGroupsSection()
        }
      })
      return
    }

    if (t.closest('#btn-reset-sample-nodes')) {
      pushUndo('恢复默认示例节点')
      state.sampleNodesText = window.YaNetDefaults.SAMPLE_NODES_TEXT
      recomputePreview()
      renderNodesSection()
      showToast('已恢复默认示例节点')
    }
  })

  // ===== Drag-and-drop sorting for Services & Regions =====
  function clearDropIndicators() {
    elEditor.querySelectorAll('.entity-card.is-drop-before, .entity-card.is-drop-after').forEach((el) => {
      el.classList.remove('is-drop-before', 'is-drop-after')
    })
  }

  function reorderListByDrag(type, fromIdx, targetIdx, pos) {
    const list = type === 'service' ? state.services : type === 'region' ? state.regions : null
    if (!list) return false
    if (fromIdx < 0 || fromIdx >= list.length || targetIdx < 0 || targetIdx >= list.length) return false
    if (fromIdx === targetIdx) return false

    const rawInsert = pos === 'before' ? targetIdx : targetIdx + 1
    const insertIdx = fromIdx < rawInsert ? rawInsert - 1 : rawInsert
    if (insertIdx === fromIdx) return false

    const openItem =
      type === 'service'
        ? openServiceIdx >= 0
          ? list[openServiceIdx]
          : null
        : openRegionIdx >= 0
          ? list[openRegionIdx]
          : null

    pushUndo(`调整「${list[fromIdx]?.name || ''}」排序`)
    const [moved] = list.splice(fromIdx, 1)
    list.splice(insertIdx, 0, moved)

    if (type === 'service') {
      openServiceIdx = openItem ? list.indexOf(openItem) : -1
    } else {
      openRegionIdx = openItem ? list.indexOf(openItem) : -1
    }

    recomputePreview()
    if (type === 'service') renderServicesSection()
    else renderRegionsSection()
    if (type === 'service') toastServiceOrder(moved.name, moved.key)
    else showToast(`已调整「${moved.name}」排序`)
    return true
  }

  elEditor.addEventListener('dragstart', (e) => {
    const head = e.target.closest('.entity-head[draggable="true"]')
    if (!head) return
    if (e.target.closest('button, input, label, select, textarea')) {
      e.preventDefault()
      return
    }
    const card = head.closest('.entity-card[data-drag-type]')
    if (!card) return
    dragState = {
      type: card.dataset.dragType,
      fromIdx: Number(card.dataset.dragIdx),
      targetIdx: -1,
      pos: 'before',
    }
    card.classList.add('is-dragging')
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      try {
        e.dataTransfer.setData('text/plain', `${dragState.type}:${dragState.fromIdx}`)
        e.dataTransfer.setDragImage(head, 24, 20)
      } catch {
        // ignore in synthetic drag events
      }
    }
  })

  elEditor.addEventListener('dragover', (e) => {
    if (!dragState) return
    const listEl = e.target.closest('.entity-list')
    if (!listEl) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

    const card = e.target.closest('.entity-card[data-drag-type]')
    if (!card || card.dataset.dragType !== dragState.type) return
    const targetIdx = Number(card.dataset.dragIdx)

    clearDropIndicators()
    if (targetIdx === dragState.fromIdx) {
      dragState.targetIdx = -1
      return
    }
    const rect = card.getBoundingClientRect()
    const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    dragState.targetIdx = targetIdx
    dragState.pos = pos
    card.classList.add(pos === 'before' ? 'is-drop-before' : 'is-drop-after')
  })

  elEditor.addEventListener('dragleave', (e) => {
    if (!dragState) return
    const listEl = e.target.closest('.entity-list')
    if (listEl && !listEl.contains(e.relatedTarget)) {
      clearDropIndicators()
    }
  })

  elEditor.addEventListener('drop', (e) => {
    if (!dragState) return
    const card = e.target.closest('.entity-card[data-drag-type]')
    e.preventDefault()
    const { type, fromIdx } = dragState
    let targetIdx = dragState.targetIdx
    let pos = dragState.pos
    if (card && card.dataset.dragType === type) {
      targetIdx = Number(card.dataset.dragIdx)
      const rect = card.getBoundingClientRect()
      pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    }
    clearDropIndicators()
    elEditor.querySelectorAll('.entity-card.is-dragging').forEach((el) => el.classList.remove('is-dragging'))
    dragState = null
    if (targetIdx >= 0) {
      reorderListByDrag(type, fromIdx, targetIdx, pos)
    }
  })

  elEditor.addEventListener('dragend', () => {
    clearDropIndicators()
    elEditor.querySelectorAll('.entity-card.is-dragging').forEach((el) => el.classList.remove('is-dragging'))
    dragState = null
  })

  // ===== Topbar Actions =====
  if (elBtnUndo) {
    elBtnUndo.addEventListener('click', performUndo)
  }

  if (elBtnTheme) {
    elBtnTheme.addEventListener('click', toggleTheme)
  }

  if (elBtnShareUrl) {
    elBtnShareUrl.addEventListener('click', async () => {
      try {
        const payload = await encodeStateToSharePayload(state)
        const base =
          typeof location !== 'undefined' && location.origin && location.origin !== 'null'
            ? location.origin + location.pathname
            : 'https://yibiner.github.io/clash-verge-rule-studio/'
        const shareUrl = `${base}#cfg=${payload}`
        await copyText(shareUrl, `配置分享链接 (${shareUrl.length} 字符)`)
      } catch (err) {
        showToast('生成分享链接失败：' + (err?.message || String(err)))
      }
    })
  }

  document.getElementById('btn-copy-js').addEventListener('click', () => {
    copyText(lastScriptCode, ' global_script.js')
  })

  document.getElementById('btn-download-js').addEventListener('click', () => {
    downloadFile(lastScriptCode, 'global_script.js', 'application/javascript;charset=utf-8')
  })

  document.getElementById('btn-export-json').addEventListener('click', () => {
    downloadFile(JSON.stringify(state, null, 2), 'clash-verge-rule-studio-backup.json', 'application/json;charset=utf-8')
  })

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('确定恢复为默认分流规则配置吗？当前所有修改将被覆盖。')) return
    pushUndo('重置为默认配置')
    state = createDefaultState()
    openServiceIdx = -1
    openServiceOriginalName = ''
    openRegionIdx = -1
    simulatedSelections = {}
    recomputePreview()
    renderEditor()
    showToast('已恢复默认配置（可点击顶栏撤销）')
  })

  // Import Modal
  document.getElementById('btn-import').addEventListener('click', () => {
    elImportTextarea.value = ''
    elImportFile.value = ''
    elImportModal.classList.remove('hidden')
  })

  function closeImportModal() {
    elImportModal.classList.add('hidden')
  }

  document.getElementById('import-modal-close').addEventListener('click', closeImportModal)
  document.getElementById('import-cancel').addEventListener('click', closeImportModal)
  elImportModal.addEventListener('click', (e) => {
    if (e.target === elImportModal) closeImportModal()
  })

  elImportFile.addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      elImportTextarea.value = String(reader.result || '')
    }
    reader.readAsText(file)
  })

  document.getElementById('import-confirm').addEventListener('click', () => {
    const raw = elImportTextarea.value.trim()
    if (!raw) {
      showToast('请先选择文件或粘贴内容')
      return
    }
    try {
      const nextState = parseExistingScript(raw)
      pushUndo('导入外部配置')
      state = nextState
      openServiceIdx = -1
      openServiceOriginalName = ''
      openRegionIdx = -1
      recomputePreview()
      renderEditor()
      closeImportModal()
      showToast('导入成功，已更新可视化配置')
    } catch (err) {
      alert(err.message || String(err))
    }
  })

  // Icon Modal Events
  document.getElementById('icon-modal-close').addEventListener('click', closeIconPicker)
  elIconModal.addEventListener('click', (e) => {
    if (e.target === elIconModal) closeIconPicker()
  })
  elIconSearch.addEventListener('input', (e) => {
    iconPickerQuery = e.target.value
    renderIconPicker()
  })
  elIconCats.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-icon-cat]')
    if (!btn) return
    iconPickerCategory = btn.dataset.iconCat
    renderIconPicker()
  })
  elIconGrid.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-icon-url]')
    if (!tile) return
    if (iconPickerCallback) iconPickerCallback(tile.dataset.iconUrl)
    closeIconPicker()
  })

  // About Modal Events
  function closeAboutModal() {
    if (elAboutModal) elAboutModal.classList.add('hidden')
  }
  if (elBtnAbout && elAboutModal) {
    elBtnAbout.addEventListener('click', () => {
      elAboutModal.classList.remove('hidden')
    })
    const btnAboutClose = document.getElementById('about-modal-close')
    const btnAboutOk = document.getElementById('about-modal-ok')
    if (btnAboutClose) btnAboutClose.addEventListener('click', closeAboutModal)
    if (btnAboutOk) btnAboutOk.addEventListener('click', closeAboutModal)
    elAboutModal.addEventListener('click', (e) => {
      if (e.target === elAboutModal) closeAboutModal()
    })
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeIconPicker()
      closeImportModal()
      closeAboutModal()
      return
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : ''
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return
      if (undoStack.length > 0) {
        e.preventDefault()
        performUndo()
      }
    }
  })

  // ===== Boot =====
  applyTheme(getPreferredTheme())
  updateUndoButton()
  recomputePreview()
  renderEditor()
  loadStateFromUrlHash()
})()
