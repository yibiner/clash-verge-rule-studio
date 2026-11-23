;(function (global) {
  'use strict'

  const MULTIPLIER_REGEX =
    /(?<![a-zA-Z0-9.])(?:(?:[xX×✕✖⨉]|倍率[:：]?)\s*([1-9]\d*(?:\.\d+)?|0(?:\.\d+)?)|([1-9]\d*(?:\.\d+)?|0(?:\.\d+)?)(?:[xX×✕✖⨉](?![a-zA-Z])|\s*倍))/i

  function jsStr(str) {
    return JSON.stringify(String(str ?? ''))
  }

  function numOr(val, fallback) {
    if (val === '' || val === null || val === undefined) return fallback
    const n = Number(val)
    return Number.isFinite(n) ? n : fallback
  }

  function sanitizeFlags(flags) {
    // Strip stateful g/y flags to avoid lastIndex drift across loops
    const dedup = Array.from(new Set(String(flags ?? 'i').replace(/[^imsu]/g, '').split('')))
    return dedup.join('')
  }

  function formatRegexLiteral(pattern, flags) {
    const cleanFlags = sanitizeFlags(flags)
    try {
      return new RegExp(pattern || '(?!)', cleanFlags).toString()
    } catch {
      return '/(?!)/i'
    }
  }

  function buildRuleSetString(services) {
    const enabled = services.filter((s) => s.enabled)
    if (enabled.length === services.length && services.length > 0) return 'all'
    return enabled.map((s) => s.key).join(';')
  }

  function buildRegionSetString(regions) {
    const enabled = regions.filter((r) => r.enabled)
    if (enabled.length === regions.length && regions.length > 0) return 'all'
    return enabled.map((r) => r.name.substring(0, 2)).join(';')
  }

  function parseSnifferPorts(str) {
    return String(str || '')
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (/^\d+$/.test(s) ? Number(s) : s))
  }

  function buildProxiesArrayExpr(tokens, names) {
    const items = (tokens || [])
      .map((t) => String(t || '').trim())
      .filter(Boolean)
    const parts = []
    let hasOther = false
    for (const token of items) {
      if (token === '$regions') {
        parts.push('...regionGroupNames')
      } else if (token === '$other') {
        hasOther = true
        parts.push(jsStr(names.other))
      } else if (token === '$default') {
        parts.push(jsStr(names.default))
      } else if (token === '$cn') {
        parts.push(jsStr(names.cn))
      } else if (token === '$direct' || token === '直连') {
        parts.push(jsStr(names.direct))
      } else if (token === '$reject' || token === '拒绝') {
        parts.push(jsStr(names.reject))
      } else {
        parts.push(jsStr(token))
      }
    }
    const expr = `[${parts.join(', ')}]`
    if (hasOther) {
      return `${expr}.filter((n) => n !== ${jsStr(names.other)} || otherProxies.length > 0)`
    }
    return expr
  }

  function generateGlobalScript(state) {
    const {
      args,
      core,
      tun,
      snifferConfig,
      ntp,
      dnsExtra,
      builtinProviders,
      builtinProxies,
      systemGroups,
      initialRules,
      fallbackRules,
      regions,
      services,
    } = state
    const ruleSetStr = buildRuleSetString(services)
    const regionSetStr = buildRegionSetString(regions)

    const names = {
      default: systemGroups.defaultGroup.name || '默认节点',
      other: systemGroups.otherGroup.name || '其他节点',
      download: systemGroups.downloadGroup.name || '下载软件',
      otherForeign: systemGroups.otherForeignGroup.name || '其他外网',
      cn: systemGroups.cnGroup.name || '国内网站',
      direct: builtinProxies.directName || '直连',
      reject: builtinProxies.rejectName || '拒绝',
    }

    const builtinProviderLines = (builtinProviders || [])
      .filter((p) => p.key && p.key.trim())
      .map((p) => {
        return [
          `  ${jsStr(p.key.trim())}: {`,
          `    ...ruleProviderCommon,`,
          `    behavior: ${jsStr(p.behavior || 'classical')},`,
          `    format: ${jsStr(p.format || 'text')},`,
          `    url: ${jsStr(p.url || '')},`,
          `    path: ${jsStr(p.path || '')},`,
          `  },`,
        ].join('\n')
      })
      .join('\n')

    const corsOrigins = (core.corsAllowOrigins || []).map((x) => x.trim()).filter(Boolean)
    const tlsPorts = parseSnifferPorts(snifferConfig.tlsPorts)
    const httpPorts = parseSnifferPorts(snifferConfig.httpPorts)
    const quicPorts = parseSnifferPorts(snifferConfig.quicPorts)

    const ruleOptionsLines = services.map((s) => `  ${JSON.stringify(s.key)}: false,`).join('\n')

    const initialRulesLines = initialRules
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => `  ${jsStr(r)},`)
      .join('\n')

    const fallbackRulesLines = fallbackRules
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => `    ${jsStr(r)},`)
      .join('\n')

    const regionLines = regions
      .map((r) => {
        return [
          '  {',
          `    name: ${jsStr(r.name)},`,
          `    regex: ${formatRegexLiteral(r.regex, r.flags)},`,
          `    icon: ${jsStr(r.icon)},`,
          '  },',
        ].join('\n')
      })
      .join('\n')

    const serviceLines = services
      .map((svc) => {
        const lines = [
          '  {',
          `    key: ${jsStr(svc.key)},`,
          `    name: ${jsStr(svc.name)},`,
          `    icon: ${jsStr(svc.icon)},`,
        ]
        if (svc.url && svc.url.trim()) {
          lines.push(`    url: ${jsStr(svc.url.trim())},`)
        }
        const rulesClean = (svc.rules || []).map((r) => r.trim()).filter(Boolean)
        lines.push(`    rules: [`)
        rulesClean.forEach((r) => lines.push(`      ${jsStr(r)},`))
        lines.push(`    ],`)

        if (Array.isArray(svc.providers) && svc.providers.length > 0) {
          lines.push(`    providers: [`)
          svc.providers.forEach((p) => {
            lines.push('      {')
            lines.push(`        key: ${jsStr(p.key)},`)
            lines.push(`        url: ${jsStr(p.url)},`)
            lines.push(`        path: ${jsStr(p.path)},`)
            lines.push(`        format: ${jsStr(p.format || 'text')},`)
            lines.push(`        behavior: ${jsStr(p.behavior || 'classical')},`)
            lines.push('      },')
          })
          lines.push(`    ],`)
        }
        if (svc.reject) {
          lines.push(`    reject: true,`)
        }
        if (svc.directFirst) {
          lines.push(`    directFirst: true,`)
        }
        if (svc.preferRegion) {
          lines.push(`    preferRegion: ${jsStr(svc.preferRegion)},`)
        }
        lines.push('  },')
        return lines.join('\n')
      })
      .join('\n')

    const fakeIpFilterLines = (dnsExtra.fakeIpFilter || [])
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => `    ${jsStr(x)},`)
      .join('\n')

    const policyLines = (dnsExtra.nameserverPolicy || [])
      .filter((p) => p.match && p.match.trim())
      .map((p) => {
        let valExpr
        const t = String(p.target || '').trim()
        if (t === '$chinaDNS') valExpr = 'chinaDNS'
        else if (t === '$foreignDNS') valExpr = 'foreignDNS'
        else if (t === '$directDNS') valExpr = 'directDNS'
        else if (t === '$defaultDNS') valExpr = 'defaultDNS'
        else if (t.includes(';')) valExpr = JSON.stringify(t.split(';').map((s) => s.trim()).filter(Boolean))
        else valExpr = jsStr(t)
        return `    ${jsStr(p.match.trim())}: ${valExpr},`
      })
      .join('\n')

    const effectiveMode = args.mode === 'custom' ? '' : args.mode
    const includeVergeManaged = Boolean(state.exportOptions && state.exportOptions.includeVergeManaged)
    const tunExcludeInterface = JSON.stringify((tun.excludeInterface || []).map((x) => x.trim()).filter(Boolean))
    const tunDnsHijack = JSON.stringify((tun.dnsHijack || []).map((x) => x.trim()).filter(Boolean))
    const vergeManagedHead = includeVergeManaged
      ? `  config['allow-lan'] = ${Boolean(core.allowLan)}`
      : `  // 未写入 Clash Verge 接管字段：mode、ipv6、allow-lan、unified-delay、端口、external-controller、secret、external-controller-cors，以及 TUN 设置页中的协议栈、网卡、路由、DNS 劫持、严格路由、MTU。
  // 这些值以 Clash Verge 设置页为准。其他客户端需要脚本写入时，打开工作台的「导出时写入 Clash Verge 接管字段」。`
    const vergeManagedBody = includeVergeManaged
      ? `  config['mode'] = 'rule'
  config['ipv6'] = !!ipv6
  config['external-controller'] = ${jsStr(core.externalController)}
  config['external-controller-cors'] = {
    'allow-origins': ${JSON.stringify(corsOrigins.length ? corsOrigins : ['*'])},
    'allow-private-network': ${Boolean(core.corsAllowPrivateNetwork)},
  }
  config['secret'] = ${jsStr(core.secret)}
  config['port'] = ${numOr(core.port, 7890)}
  config['socks-port'] = ${numOr(core.socksPort, 7891)}
  config['mixed-port'] = ${numOr(core.mixedPort, 7892)}
  config['redir-port'] = ${numOr(core.redirPort, 7893)}
  config['tproxy-port'] = ${numOr(core.tproxyPort, 7894)}
`
      : ''
    const vergeManagedDelay = includeVergeManaged ? `  config['unified-delay'] = ${Boolean(core.unifiedDelay)}\n` : ''
    const dnsIpv6Line = includeVergeManaged ? `  ipv6: !!ipv6,\n` : ''
    const dnsIpv6Preserve = includeVergeManaged
      ? ''
      : `  if (config.dns && Object.prototype.hasOwnProperty.call(config.dns, 'ipv6')) {
    finalDnsConfig.ipv6 = config.dns.ipv6
  }
`
    const tunAssignment = includeVergeManaged
      ? `  config['tun'] = {
    enable: ${Boolean(tun.enable)},
    stack: ${jsStr(tun.stack)},
    device: ${jsStr(tun.device)},
    'auto-route': ${Boolean(tun.autoRoute)},
    'auto-redirect': ${Boolean(tun.autoRedirect)},
    'auto-detect-interface': ${Boolean(tun.autoDetectInterface)},
    'strict-route': ${Boolean(tun.strictRoute)},
    mtu: ${numOr(tun.mtu, 1500)},
    gso: ${Boolean(tun.gso)},
    'gso-max-size': ${numOr(tun.gsoMaxSize, 65536)},
    'exclude-interface': ${tunExcludeInterface},
    'route-exclude-address': skipIps.filter((ip) => ip !== '198.18.0.0/16'),
    'dns-hijack': ${tunDnsHijack},
  }`
      : `  config['tun'] = {
    ...(config['tun'] && typeof config['tun'] === 'object' ? config['tun'] : {}),
    gso: ${Boolean(tun.gso)},
    'gso-max-size': ${numOr(tun.gsoMaxSize, 65536)},
    'exclude-interface': ${tunExcludeInterface},
  }`

    return `/***
 * Clash Verge Rev / Mihomo Party 分流规则脚本
 * 由 Clash Verge 分流规则工作台生成
 * https://github.com/yibiner/clash-verge-rule-studio
 *
 * 规则结构参考 dahaha-365/YaNet
 * https://github.com/dahaha-365/YaNet
 */

function stringToArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val !== 'string') return []
  return val
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

// --- 1. 静态配置区域 ---

const _skipIps = ${jsStr(args.skipIps)}

// DNS 配置
const _chinaDohDns = ${jsStr(global.YaNetDefaults.DNS_CONSTANTS.chinaDohDns)}
const _foreignDohDns = ${jsStr(global.YaNetDefaults.DNS_CONSTANTS.foreignDohDns)}
const _chinaIpDns = ${jsStr(global.YaNetDefaults.DNS_CONSTANTS.chinaIpDns)}
const _foreignIpDns = ${jsStr(global.YaNetDefaults.DNS_CONSTANTS.foreignIpDns)}

const defaultArgs = {
  enable: ${Boolean(args.enable)},
  ruleSet: ${jsStr(ruleSetStr)},
  regionSet: ${jsStr(regionSetStr)},
  interfaceName: ${jsStr(args.interfaceName)},
  excludeHighPercentage: ${Boolean(args.excludeHighPercentage)},
  globalRatioLimit: ${numOr(args.globalRatioLimit, 2)},
  skipIps: _skipIps,
  defaultDNS: ${jsStr(args.defaultDNS)},
  directDNS: ${jsStr(args.directDNS)},
  chinaDNS: ${jsStr(args.chinaDNS)},
  foreignDNS: ${jsStr(args.foreignDNS)},
  dns: ${Boolean(args.dns)},
  sniffer: ${Boolean(args.sniffer)},
  mode: ${jsStr(effectiveMode)},
  ipv6: ${Boolean(args.ipv6)},
  logLevel: ${jsStr(args.logLevel || 'error')},
  githubProxy: ${jsStr(args.githubProxy)},
}

let args =
  typeof $arguments !== 'undefined' && $arguments && typeof $arguments === 'object' ? $arguments : defaultArgs

args = {
  ...defaultArgs,
  ...Object.fromEntries(
    Object.entries(args)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          const trimmed = value.trim()
          if (trimmed === 'true') return [key, true]
          if (trimmed === 'false') return [key, false]
          if (trimmed !== '' && !isNaN(trimmed) && String(Number(trimmed)) === trimmed) {
            return [key, Number(trimmed)]
          }
        }
        return [key, value]
      })
  ),
}

let {
  enable = args.enable ?? true,
  ruleSet = args.ruleSet ?? 'all',
  regionSet = args.regionSet ?? 'all',
  interfaceName = args.interfaceName ?? '',
  excludeHighPercentage = !!args.excludeHighPercentage,
  globalRatioLimit = args.globalRatioLimit ?? 2,
  skipIps = args.skipIps ?? _skipIps,
  defaultDNS = args.defaultDNS ?? _chinaIpDns,
  directDNS = args.directDNS ?? _chinaIpDns,
  chinaDNS = args.chinaDNS ?? _chinaDohDns,
  foreignDNS = args.foreignDNS ?? _foreignDohDns,
  dns = args.dns ?? false,
  sniffer = args.sniffer ?? false,
  mode = args.mode ?? '',
  ipv6 = args.ipv6 ?? false,
  logLevel = args.logLevel ?? 'error',
  githubProxy = args.githubProxy ?? '',
} = args

function applyGithubProxy(url) {
  if (!githubProxy || typeof url !== 'string') return url
  const prefix = githubProxy.endsWith('/') ? githubProxy : githubProxy + '/'
  if (/^https?:\\/\\/(github\\.com|raw\\.githubusercontent\\.com|gist\\.githubusercontent\\.com)\\//i.test(url)) {
    return prefix + url
  }
  return url
}

/**
 * 模式配置
 */
if (['securest', 'secure', 'default', 'fast', 'fastest'].includes(mode)) {
  switch (mode) {
    case 'securest':
      defaultDNS = _foreignIpDns
      directDNS = _foreignDohDns
      chinaDNS = _chinaDohDns
      foreignDNS = _foreignDohDns
      break
    case 'secure':
      defaultDNS = _foreignIpDns
      directDNS = _chinaDohDns
      chinaDNS = _chinaDohDns
      foreignDNS = _foreignDohDns
      break
    case 'fast':
      defaultDNS = _chinaIpDns
      directDNS = _chinaIpDns
      chinaDNS = _chinaIpDns
      foreignDNS = _foreignDohDns
      break
    case 'fastest':
      defaultDNS = _chinaIpDns
      directDNS = _chinaIpDns
      chinaDNS = _chinaIpDns
      foreignDNS = _foreignIpDns
      break
    default:
      defaultDNS = _chinaIpDns
      directDNS = _chinaIpDns
      chinaDNS = _chinaDohDns
      foreignDNS = _foreignDohDns
      break
  }
}

skipIps = stringToArray(skipIps)
defaultDNS = stringToArray(defaultDNS)
directDNS = stringToArray(directDNS)
chinaDNS = stringToArray(chinaDNS)
foreignDNS = stringToArray(foreignDNS)

/**
 * 分流规则开关
 */
let ruleOptions = {
${ruleOptionsLines}
}

if (ruleSet === 'all') {
  Object.keys(ruleOptions).forEach((key) => (ruleOptions[key] = true))
} else if (typeof ruleSet === 'string') {
  const enabledKeys = ruleSet.split(';').map((s) => s.trim()).filter(Boolean)
  enabledKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(ruleOptions, key)) {
      ruleOptions[key] = true
    }
  })
}

// 初始规则
const rules = [
${initialRulesLines}
]

// 地区定义
const allRegionDefinitions = [
${regionLines}
]

let regionDefinitions = []
if (regionSet === 'all') {
  regionDefinitions = allRegionDefinitions
} else if (typeof regionSet === 'string') {
  const enabledRegions = regionSet.split(';').map((s) => s.trim()).filter(Boolean)
  regionDefinitions = allRegionDefinitions.filter((r) => {
    const prefix = r.name.substring(0, 2)
    return enabledRegions.includes(prefix)
  })
}

const dnsConfig = {
  enable: !!dns,
  listen: ${jsStr(dnsExtra.listen)},
${dnsIpv6Line}  'log-level': logLevel,
  'prefer-h3': ${Boolean(dnsExtra.preferH3)},
  'use-hosts': ${Boolean(dnsExtra.useHosts)},
  'use-system-hosts': ${Boolean(dnsExtra.useSystemHosts)},
  'respect-rules': ${Boolean(dnsExtra.respectRules)},
  'enhanced-mode': ${jsStr(dnsExtra.enhancedMode)},
  'fake-ip-range': ${jsStr(dnsExtra.fakeIpRange)},
  'fake-ip-filter-mode': ${jsStr(dnsExtra.fakeIpFilterMode)},
  'fake-ip-filter': [
${fakeIpFilterLines}
  ],
  nameserver: chinaDNS,
  'default-nameserver': defaultDNS,
  'direct-nameserver': directDNS,
  'proxy-server-nameserver': chinaDNS,
  'nameserver-policy': {
${policyLines}
  },
}

// 通用配置
const ruleProviderCommon = {
  type: 'http',
  format: ${jsStr(core.ruleProviderFormat || 'yaml')},
  interval: ${numOr(core.ruleProviderInterval, 86400)},
}
const groupBaseOption = {
  interval: ${numOr(core.groupInterval, 300)},
  timeout: ${numOr(core.groupTimeout, 3000)},
  url: ${jsStr(core.groupUrl)},
  lazy: ${Boolean(core.groupLazy)},
  'max-failed-times': ${numOr(core.groupMaxFailedTimes, 3)},
  hidden: ${Boolean(core.groupHidden)},
}

// 预定义 Rule Providers
const ruleProviders = {
${builtinProviderLines}
}

// 倍率正则预编译
const multiplierRegex = ${formatRegexLiteral(args.multiplierRegex, args.multiplierFlags)}

// --- 2. 服务规则数据结构 ---
const serviceConfigs = [
${serviceLines}
]

// --- 3. 主入口 ---

function main(config) {
  if (!enable) return config

  const proxies = config?.proxies || []
  const proxyCount = proxies.length
  const proxyProviderCount =
    config?.['proxy-providers'] && typeof config['proxy-providers'] === 'object'
      ? Object.keys(config['proxy-providers']).length
      : 0

  if (proxyCount === 0 && proxyProviderCount === 0) {
    throw new Error('配置文件中未找到任何代理')
  }

  // 3.1 覆盖基础配置
${vergeManagedHead}
  config['bind-address'] = ${jsStr(core.bindAddress)}
${vergeManagedBody}  config['external-ui'] = ${jsStr(core.externalUi)}
  config['external-ui-url'] = applyGithubProxy(${jsStr(core.externalUiUrl)})
  const finalDnsConfig = { ...dnsConfig }
${dnsIpv6Preserve}  if (config.dns?.['proxy-server-nameserver']) {
    finalDnsConfig['proxy-server-nameserver'] = config.dns['proxy-server-nameserver']
  }
  if (config.dns?.['proxy-server-nameserver-policy']) {
    finalDnsConfig['proxy-server-nameserver-policy'] = config.dns['proxy-server-nameserver-policy']
  }
  config['dns'] = finalDnsConfig
  config['profile'] = {
    'store-selected': ${Boolean(core.profileStoreSelected)},
    'store-fake-ip': ${Boolean(core.profileStoreFakeIp)},
  }
${vergeManagedDelay}  config['tcp-concurrent'] = ${Boolean(core.tcpConcurrent)}
  config['keep-alive-interval'] = ${numOr(core.keepAliveInterval, 1800)}
  config['find-process-mode'] = ${jsStr(core.findProcessMode)}
  config['geodata-mode'] = ${Boolean(core.geodataMode)}
  config['geodata-loader'] = ${jsStr(core.geodataLoader)}
  config['geo-auto-update'] = ${Boolean(core.geoAutoUpdate)}
  config['geo-update-interval'] = ${numOr(core.geoUpdateInterval, 24)}

  if (interfaceName.length > 0) {
    config['interface-name'] = interfaceName
  }

  config['sniffer'] = {
    enable: sniffer,
    'force-dns-mapping': ${Boolean(snifferConfig.forceDnsMapping)},
    'parse-pure-ip': ${Boolean(snifferConfig.parsePureIp)},
    'override-destination': ${Boolean(snifferConfig.overrideDestination)},
    sniff: {
      TLS: {
        ports: ${JSON.stringify(tlsPorts)},
      },
      HTTP: {
        ports: ${JSON.stringify(httpPorts)},
      },
      QUIC: {
        ports: ${JSON.stringify(quicPorts)},
      },
    },
    'skip-src-address': skipIps.filter((ip) => ip !== '198.18.0.0/16'),
    'skip-domain': ${JSON.stringify((snifferConfig.skipDomain || []).map((x) => x.trim()).filter(Boolean))},
  }

  config['ntp'] = {
    enable: ${Boolean(ntp.enable)},
    'write-to-system': ${Boolean(ntp.writeToSystem)},
    server: ${jsStr(ntp.server)},
  }
${tunAssignment}
  config['geox-url'] = {
    geoip: applyGithubProxy(${jsStr(core.geoxGeoip)}),
    geosite: applyGithubProxy(${jsStr(core.geoxGeosite)}),
    mmdb: applyGithubProxy(${jsStr(core.geoxMmdb)}),
    asn: applyGithubProxy(${jsStr(core.geoxAsn)}),
  }

  if (!Array.isArray(config.proxies)) {
    config.proxies = []
  }

  config.proxies.push({
    name: ${jsStr(names.direct)},
    type: 'direct',
    udp: ${Boolean(builtinProxies.directUdp)},
    'routing-mark': ${numOr(builtinProxies.directRoutingMark, 5555)},
  })

  config.proxies.push({
    name: ${jsStr(names.reject)},
    type: 'reject',
    udp: ${Boolean(builtinProxies.rejectUdp)},
  })

  // 3.2 高效代理分类 (单次遍历)
  const regionGroups = {}
  regionDefinitions.forEach(
    (r) =>
      (regionGroups[r.name] = {
        ...r,
        proxies: [],
      })
  )
  const otherProxies = []

  for (let i = 0; i < proxyCount; i++) {
    const proxy = proxies[i]
    const name = proxy.name
    let matched = false

    // 检查倍率
    if (excludeHighPercentage) {
      const match = multiplierRegex.exec(name)
      const ratioStr = match ? (match[1] ?? match[2]) : null
      if (ratioStr !== null && ratioStr !== undefined) {
        const ratio = parseFloat(ratioStr)
        if (Number.isFinite(ratio) && ratio > globalRatioLimit) {
          continue
        }
      }
    }

    // 尝试匹配地区
    for (const region of regionDefinitions) {
      if (region.regex.test(name)) {
        regionGroups[region.name].proxies.push(name)
        matched = true
        break
      }
    }

    if (!matched) {
      otherProxies.push(name)
    }
  }

  const generatedRegionGroups = []
  regionDefinitions.forEach((r) => {
    const groupData = regionGroups[r.name]
    if (groupData.proxies.length > 0) {
      generatedRegionGroups.push({
        ...groupBaseOption,
        name: r.name,
        type: 'url-test',
        tolerance: ${numOr(core.regionTolerance, 50)},
        icon: r.icon,
        proxies: groupData.proxies,
      })
    }
  })

  const regionGroupNames = generatedRegionGroups.map((g) => g.name)

  function preferRegionFirst(list, prefix) {
    const tag = String(prefix || '')
    if (!tag) return list
    const hit = list.find((name) => String(name).substring(0, tag.length) === tag)
    if (!hit) return list
    return [hit, ...list.filter((name) => name !== hit)]
  }

  if (otherProxies.length > 0) {
    generatedRegionGroups.push({
      ...groupBaseOption,
      name: ${jsStr(names.other)},
      type: ${jsStr(systemGroups.otherGroup.type || 'select')},
      proxies: otherProxies,
      icon: ${jsStr(systemGroups.otherGroup.icon || '')},
    })
  }

  // 3.3 构建功能策略组
  const finalRules = [...rules]
  const finalRuleProviders = Object.fromEntries(
    Object.entries(ruleProviders).map(([key, p]) => [
      key,
      { ...p, url: applyGithubProxy(p.url) },
    ])
  )
  const functionalGroups = []

  functionalGroups.push({
    ...groupBaseOption,
    name: ${jsStr(names.default)},
    type: ${jsStr(systemGroups.defaultGroup.type || 'select')},
    proxies: preferRegionFirst(${buildProxiesArrayExpr(systemGroups.defaultGroup.proxies, names)}, ${jsStr(systemGroups.defaultGroup.preferRegion ?? 'SG')}),
    icon: ${jsStr(systemGroups.defaultGroup.icon || '')},
  })

  serviceConfigs.forEach((svc) => {
    if (ruleOptions[svc.key]) {
      finalRules.push(...svc.rules)

      if (Array.isArray(svc.providers)) {
        svc.providers.forEach((p) => {
          finalRuleProviders[p.key] = {
            ...ruleProviderCommon,
            behavior: p.behavior,
            format: p.format,
            url: applyGithubProxy(p.url),
            path: p.path,
          }
        })
      }

      let groupProxies
      const preferPrefix = svc.preferRegion || ''
      if (svc.reject) {
        groupProxies = [${jsStr(names.reject)}, ${jsStr(names.direct)}, ${jsStr(names.default)}]
      } else if (svc.directFirst || svc.key === 'biliintl' || svc.key === 'bahamut') {
        groupProxies = [${jsStr(names.default)}, ${jsStr(names.direct)}, ...regionGroupNames]
      } else {
        groupProxies = [${jsStr(names.default)}, ...regionGroupNames, ${jsStr(names.direct)}]
      }
      if (!svc.reject && preferPrefix) {
        groupProxies = preferRegionFirst(groupProxies, preferPrefix)
      }

      functionalGroups.push({
        ...groupBaseOption,
        name: svc.name,
        type: 'select',
        proxies: groupProxies,
        ...(svc.url ? { url: svc.url } : {}),
        icon: svc.icon,
      })
    }
  })

  // 3.4 添加通用兜底策略组
  finalRules.push(
${fallbackRulesLines}
  )

  functionalGroups.push(
    {
      ...groupBaseOption,
      name: ${jsStr(names.download)},
      type: ${jsStr(systemGroups.downloadGroup.type || 'select')},
      proxies: ${buildProxiesArrayExpr(systemGroups.downloadGroup.proxies, names)},
      icon: ${jsStr(systemGroups.downloadGroup.icon || '')},
    },
    {
      ...groupBaseOption,
      name: ${jsStr(names.otherForeign)},
      type: ${jsStr(systemGroups.otherForeignGroup.type || 'select')},
      proxies: ${buildProxiesArrayExpr(systemGroups.otherForeignGroup.proxies, names)},
      icon: ${jsStr(systemGroups.otherForeignGroup.icon || '')},
    },
    {
      ...groupBaseOption,
      name: ${jsStr(names.cn)},
      type: ${jsStr(systemGroups.cnGroup.type || 'select')},
      proxies: ${buildProxiesArrayExpr(systemGroups.cnGroup.proxies, names)},${
        systemGroups.cnGroup.url && systemGroups.cnGroup.url.trim()
          ? `\n      url: ${jsStr(systemGroups.cnGroup.url.trim())},`
          : ''
      }
      icon: ${jsStr(systemGroups.cnGroup.icon || '')},
    }
  )

  // 3.5 组装最终结果
  config['proxy-groups'] = [
    ...functionalGroups,
    ...generatedRegionGroups,
  ]

  config['rules'] = finalRules
  config['rule-providers'] = finalRuleProviders

  return config
}
`
  }

  /**
   * 解析用户输入的模拟节点文本（支持每行一个节点名，或直接粘贴 Clash YAML 的 proxies 片段）
   */
  function parseSampleNodes(rawText) {
    const lines = String(rawText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))

    const hasYamlProxyLines = lines.some((l) =>
      /^proxies\s*:$|^-\s*name\s*:|\{[^}]*(?:^|[\s{,])name\s*:/i.test(l)
    )

    const proxies = []
    const seen = new Set()

    for (const line of lines) {
      let name = ''
      let type = 'ss'

      // 匹配 Clash YAML 行内对象格式: - { name: "xxx", type: vmess, ... }
      const inlineName =
        line.includes('{') && line.includes('}')
          ? line.match(/(?:^|[\s{,])name\s*:\s*(?:"([^"]+)"|'([^']+)'|([^,}]+))/)
          : null
      if (inlineName) {
        name = (inlineName[1] || inlineName[2] || inlineName[3] || '').trim()
        const inlineType = line.match(/(?:^|[\s{,])type\s*:\s*(['"]?)([a-zA-Z0-9_-]+)\1/)
        if (inlineType) type = inlineType[2]
      } else if (/^-\s*name\s*:\s*/i.test(line)) {
        name = line.replace(/^-\s*name\s*:\s*/i, '').replace(/^['"]|['"]$/g, '').trim()
      } else if (hasYamlProxyLines && /^name\s*:\s*/i.test(line)) {
        name = line.replace(/^name\s*:\s*/i, '').replace(/^['"]|['"]$/g, '').trim()
      } else if (hasYamlProxyLines) {
        continue
      } else {
        name = line.replace(/^-\s*/, '').trim()
      }

      if (name && !seen.has(name)) {
        seen.add(name)
        proxies.push({
          name,
          type,
          server: 'example.com',
          port: 443,
        })
      }
    }

    return proxies
  }

  /**
   * 统计倍率过滤情况与各地区匹配结果
   */
  function analyzeNodes(proxies, state) {
    const exclude = Boolean(state.args.excludeHighPercentage)
    const limit = numOr(state.args.globalRatioLimit, 2)
    const kept = []
    const excluded = []
    const regionCounts = {}

    let multRe = MULTIPLIER_REGEX
    let multiplierValid = true
    try {
      multRe = new RegExp(state.args.multiplierRegex || MULTIPLIER_REGEX.source, sanitizeFlags(state.args.multiplierFlags))
    } catch {
      multiplierValid = false
      multRe = /(?!)/i
    }

    const compiledRegions = []
    for (const r of state.regions) {
      regionCounts[r.name] = { count: 0, valid: true, matches: [] }
      try {
        const re = new RegExp(r.regex, sanitizeFlags(r.flags))
        compiledRegions.push({ region: r, re })
      } catch {
        regionCounts[r.name].valid = false
      }
    }

    for (const p of proxies) {
      const m = multRe.exec(p.name)
      const ratioStr = m ? (m[1] ?? m[2]) : null
      const parsedRatio = ratioStr !== null && ratioStr !== undefined ? parseFloat(ratioStr) : null
      const ratio = parsedRatio !== null && Number.isFinite(parsedRatio) ? parsedRatio : null
      if (exclude && ratio !== null && ratio > limit) {
        excluded.push({ name: p.name, ratio })
        continue
      }
      kept.push({ name: p.name, ratio })

      for (const { region: r, re } of compiledRegions) {
        if (!r.enabled) continue
        if (re.test(p.name)) {
          regionCounts[r.name].count++
          regionCounts[r.name].matches.push(p.name)
          break
        }
      }
    }

    return { kept, excluded, regionCounts, multiplierValid }
  }

  /**
   * 在浏览器中真实运行生成的 global_script.js 的 main(config)
   */
  function executeScriptPreview(scriptCode, sampleNodesText, state) {
    const proxies = parseSampleNodes(sampleNodesText)
    const analysis = analyzeNodes(proxies, state)

    const inputConfig = {
      proxies: proxies.map((p) => ({ ...p })),
      'proxy-groups': [],
      rules: [],
    }

    try {
      const runner = new Function(
        '__inputConfig',
        `"use strict";\n${scriptCode}\nif (typeof main !== 'function') { throw new Error('脚本中未找到 main(config) 函数'); }\nreturn main(__inputConfig);`
      )
      const result = runner(inputConfig)
      return {
        ok: true,
        config: result,
        error: null,
        inputCount: proxies.length,
        analysis,
      }
    } catch (err) {
      return {
        ok: false,
        config: null,
        error: err && err.message ? err.message : String(err),
        inputCount: proxies.length,
        analysis,
      }
    }
  }

  /**
   * 零依赖轻量 YAML 序列化器（用于预览最终 Mihomo YAML）
   */
  function yamlScalar(val) {
    if (val === null || val === undefined) return 'null'
    if (typeof val === 'boolean') return String(val)
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'null'
    const s = String(val)
    if (
      s === '' ||
      /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
      /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s) ||
      /^[-?](?:\s|$)/.test(s) ||
      /[:#\[\]{},&*!?|>'"%@`\n\r\t\\]/.test(s) ||
      /^\s|\s$/.test(s)
    ) {
      return JSON.stringify(s)
    }
    return s
  }

  function isNonEmptyYamlCollection(v) {
    if (v === null || typeof v !== 'object') return false
    if (Array.isArray(v)) return v.length > 0
    return Object.entries(v).some(([, item]) => item !== undefined)
  }

  function toYaml(value, level = 0) {
    const pad = '  '.repeat(level)
    if (value === null || value === undefined || typeof value !== 'object') {
      return yamlScalar(value)
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]'
      return value
        .map((item) => {
          if (item !== null && typeof item === 'object') {
            if (Array.isArray(item)) {
              return `${pad}-\n${toYaml(item, level + 1)}`
            }
            const entries = Object.entries(item).filter(([, v]) => v !== undefined)
            if (entries.length === 0) return `${pad}- {}`
            const [firstKey, firstVal] = entries[0]
            let firstLine
            if (isNonEmptyYamlCollection(firstVal)) {
              firstLine = `${pad}- ${yamlScalar(firstKey)}:\n${toYaml(firstVal, level + 2)}`
            } else {
              firstLine = `${pad}- ${yamlScalar(firstKey)}: ${toYaml(firstVal, level + 2)}`
            }
            const rest = entries
              .slice(1)
              .map(([k, v]) => {
                if (isNonEmptyYamlCollection(v)) {
                  return `${pad}  ${yamlScalar(k)}:\n${toYaml(v, level + 2)}`
                }
                return `${pad}  ${yamlScalar(k)}: ${toYaml(v, level + 2)}`
              })
              .join('\n')
            return rest ? `${firstLine}\n${rest}` : firstLine
          }
          return `${pad}- ${yamlScalar(item)}`
        })
        .join('\n')
    }

    const entries = Object.entries(value).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return '{}'
    return entries
      .map(([k, v]) => {
        if (isNonEmptyYamlCollection(v)) {
          return `${pad}${yamlScalar(k)}:\n${toYaml(v, level + 1)}`
        }
        return `${pad}${yamlScalar(k)}: ${toYaml(v, level + 1)}`
      })
      .join('\n')
  }

  /**
   * 从已有的 global_script.js 提取配置回填到编辑器
   */
  function parseExistingScript(jsText) {
    const base = global.YaNetDefaults.createDefaultState()

    // 尝试作为 JSON 配置文件导入
    const trimmed = String(jsText || '').trim()
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed)
      if (parsed && parsed.args && Array.isArray(parsed.services) && Array.isArray(parsed.regions)) {
        return global.YaNetDefaults.mergeStateWithDefaults(parsed)
      }
      throw new Error('JSON 文件结构不匹配编辑器格式')
    }

    // 作为 global_script.js 提取关键变量
    try {
      const extractor = new Function(
        `"use strict";\n${jsText}\nreturn {\n  defaultArgs: typeof defaultArgs !== 'undefined' ? defaultArgs : null,\n  ruleOptions: typeof ruleOptions !== 'undefined' ? ruleOptions : null,\n  rules: typeof rules !== 'undefined' ? rules : null,\n  allRegionDefinitions: typeof allRegionDefinitions !== 'undefined' ? allRegionDefinitions : null,\n  serviceConfigs: typeof serviceConfigs !== 'undefined' ? serviceConfigs : null,\n  dnsConfig: typeof dnsConfig !== 'undefined' ? dnsConfig : null,\n  chinaDNS: typeof chinaDNS !== 'undefined' ? chinaDNS : null,\n  foreignDNS: typeof foreignDNS !== 'undefined' ? foreignDNS : null,\n  directDNS: typeof directDNS !== 'undefined' ? directDNS : null,\n  defaultDNS: typeof defaultDNS !== 'undefined' ? defaultDNS : null,\n  ruleProviderCommon: typeof ruleProviderCommon !== 'undefined' ? ruleProviderCommon : null,\n  groupBaseOption: typeof groupBaseOption !== 'undefined' ? groupBaseOption : null,\n  ruleProviders: typeof ruleProviders !== 'undefined' ? ruleProviders : null,\n  multiplierRegex: typeof multiplierRegex !== 'undefined' ? multiplierRegex : null,\n};`
      )
      const data = extractor()

      if (data.defaultArgs) {
        Object.assign(base.args, {
          enable: data.defaultArgs.enable ?? base.args.enable,
          interfaceName: data.defaultArgs.interfaceName ?? base.args.interfaceName,
          excludeHighPercentage: data.defaultArgs.excludeHighPercentage ?? base.args.excludeHighPercentage,
          globalRatioLimit: data.defaultArgs.globalRatioLimit ?? base.args.globalRatioLimit,
          skipIps: data.defaultArgs.skipIps ?? base.args.skipIps,
          defaultDNS: data.defaultArgs.defaultDNS ?? base.args.defaultDNS,
          directDNS: data.defaultArgs.directDNS ?? base.args.directDNS,
          chinaDNS: data.defaultArgs.chinaDNS ?? base.args.chinaDNS,
          foreignDNS: data.defaultArgs.foreignDNS ?? base.args.foreignDNS,
          dns: data.defaultArgs.dns ?? base.args.dns,
          sniffer: data.defaultArgs.sniffer ?? base.args.sniffer,
          mode: data.defaultArgs.mode || 'custom',
          ipv6: data.defaultArgs.ipv6 ?? base.args.ipv6,
          logLevel: data.defaultArgs.logLevel ?? base.args.logLevel,
          githubProxy: data.defaultArgs.githubProxy ?? base.args.githubProxy,
        })
      }

      if (Array.isArray(data.allRegionDefinitions)) {
        const regionSet = data.defaultArgs?.regionSet ?? 'all'
        const enabledPrefixes = regionSet === 'all' ? null : String(regionSet).split(';').map((s) => s.trim())
        base.regions = data.allRegionDefinitions.map((r) => ({
          name: r.name || '未命名地区',
          regex: r.regex instanceof RegExp ? r.regex.source : String(r.regex || ''),
          flags: r.regex instanceof RegExp ? r.regex.flags : 'i',
          icon: r.icon || '',
          enabled: enabledPrefixes === null ? true : enabledPrefixes.includes(String(r.name || '').substring(0, 2)),
        }))
      }

      if (Array.isArray(data.serviceConfigs)) {
        const opts = data.ruleOptions || {}
        base.services = data.serviceConfigs.map((svc) => ({
          key: svc.key || 'custom',
          name: svc.name || svc.key || '未命名服务',
          enabled: Object.prototype.hasOwnProperty.call(opts, svc.key) ? Boolean(opts[svc.key]) : true,
          icon: svc.icon || '',
          url: svc.url || '',
          reject: Boolean(svc.reject),
          directFirst: Boolean(svc.directFirst || svc.key === 'biliintl' || svc.key === 'bahamut'),
          preferRegion: svc.preferRegion || '',
          rules: Array.isArray(svc.rules) ? [...svc.rules] : [],
          providers: Array.isArray(svc.providers) ? svc.providers.map((p) => ({ ...p })) : [],
        }))
      }

      if (Array.isArray(data.rules)) {
        base.initialRules = [...data.rules]
      }

      if (data.dnsConfig) {
        if (data.dnsConfig.listen) base.dnsExtra.listen = data.dnsConfig.listen
        if (data.dnsConfig['enhanced-mode']) base.dnsExtra.enhancedMode = data.dnsConfig['enhanced-mode']
        if (data.dnsConfig['fake-ip-range']) base.dnsExtra.fakeIpRange = data.dnsConfig['fake-ip-range']
        if (data.dnsConfig['fake-ip-filter-mode']) base.dnsExtra.fakeIpFilterMode = data.dnsConfig['fake-ip-filter-mode']
        if (typeof data.dnsConfig['prefer-h3'] === 'boolean') base.dnsExtra.preferH3 = data.dnsConfig['prefer-h3']
        if (typeof data.dnsConfig['use-hosts'] === 'boolean') base.dnsExtra.useHosts = data.dnsConfig['use-hosts']
        if (typeof data.dnsConfig['use-system-hosts'] === 'boolean') base.dnsExtra.useSystemHosts = data.dnsConfig['use-system-hosts']
        if (typeof data.dnsConfig['respect-rules'] === 'boolean') base.dnsExtra.respectRules = data.dnsConfig['respect-rules']
        if (Array.isArray(data.dnsConfig['fake-ip-filter'])) {
          base.dnsExtra.fakeIpFilter = [...data.dnsConfig['fake-ip-filter']]
        }
        if (data.dnsConfig['nameserver-policy'] && typeof data.dnsConfig['nameserver-policy'] === 'object') {
          const sameArr = (a, b) =>
            Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
          base.dnsExtra.nameserverPolicy = Object.entries(data.dnsConfig['nameserver-policy']).map(([match, val]) => {
            let target
            if (val === data.chinaDNS) target = '$chinaDNS'
            else if (val === data.foreignDNS) target = '$foreignDNS'
            else if (val === data.directDNS) target = '$directDNS'
            else if (val === data.defaultDNS) target = '$defaultDNS'
            else if (sameArr(val, data.chinaDNS)) target = '$chinaDNS'
            else if (sameArr(val, data.foreignDNS)) target = '$foreignDNS'
            else if (sameArr(val, data.directDNS)) target = '$directDNS'
            else if (sameArr(val, data.defaultDNS)) target = '$defaultDNS'
            else if (Array.isArray(val)) target = val.join(';')
            else target = String(val ?? '')
            return { match, target }
          })
        }
      }

      if (data.ruleProviderCommon) {
        if (data.ruleProviderCommon.format) base.core.ruleProviderFormat = data.ruleProviderCommon.format
        if (data.ruleProviderCommon.interval !== undefined) base.core.ruleProviderInterval = Number(data.ruleProviderCommon.interval)
      }

      if (data.groupBaseOption) {
        if (data.groupBaseOption.interval !== undefined) base.core.groupInterval = Number(data.groupBaseOption.interval)
        if (data.groupBaseOption.timeout !== undefined) base.core.groupTimeout = Number(data.groupBaseOption.timeout)
        if (data.groupBaseOption.url) base.core.groupUrl = data.groupBaseOption.url
        if (typeof data.groupBaseOption.lazy === 'boolean') base.core.groupLazy = data.groupBaseOption.lazy
        if (data.groupBaseOption['max-failed-times'] !== undefined) {
          base.core.groupMaxFailedTimes = Number(data.groupBaseOption['max-failed-times'])
        }
        if (typeof data.groupBaseOption.hidden === 'boolean') base.core.groupHidden = data.groupBaseOption.hidden
      }

      if (data.ruleProviders && typeof data.ruleProviders === 'object') {
        const entries = Object.entries(data.ruleProviders)
        base.builtinProviders = entries.map(([key, p]) => ({
          key,
          behavior: p.behavior || 'classical',
          format: p.format || 'text',
          url: p.url || '',
          path: p.path || '',
        }))
      }

      if (data.multiplierRegex instanceof RegExp) {
        base.args.multiplierRegex = data.multiplierRegex.source
        base.args.multiplierFlags = data.multiplierRegex.flags || 'i'
      }

      return base
    } catch (err) {
      throw new Error('解析 JS 脚本失败：' + (err && err.message ? err.message : String(err)))
    }
  }

  /**
   * 静态诊断配置合法性（死引用、未定义 RULE-SET、重名策略组、规则抢占顺序等）
   */
  function diagnoseConfig(state, previewResult) {
    const diagnostics = []
    if (!state) return diagnostics

    // 1. 正则语法检查
    if (previewResult?.analysis?.multiplierValid === false) {
      diagnostics.push({
        level: 'error',
        code: 'invalid-multiplier-regex',
        message: '倍率识别正则语法错误，高倍率节点过滤将不生效。',
      })
    }
    const regionCounts = previewResult?.analysis?.regionCounts || {}
    for (const r of state.regions || []) {
      if (regionCounts[r.name]?.valid === false) {
        diagnostics.push({
          level: 'error',
          code: 'invalid-region-regex',
          message: `地区分组「${r.name}」的正则表达式语法错误。`,
        })
      }
    }

    // 2. 服务组 key 检查
    const keyCounts = new Map()
    for (const svc of state.services || []) {
      const k = String(svc.key || '').trim()
      if (!k) {
        diagnostics.push({
          level: 'error',
          code: 'empty-service-key',
          message: `服务组「${svc.name || '未命名'}」的 key 不能为空。`,
        })
      } else {
        keyCounts.set(k, (keyCounts.get(k) || 0) + 1)
      }
    }
    for (const [k, count] of keyCounts.entries()) {
      if (count > 1) {
        diagnostics.push({
          level: 'error',
          code: 'duplicate-service-key',
          message: `存在 ${count} 个服务组共用相同的 key「${k}」，开关状态会互相覆盖。`,
        })
      }
    }

    // 3. 服务顺序抢占检查
    const enabledServices = (state.services || []).filter((s) => s.enabled)
    const posOf = (key) => enabledServices.findIndex((s) => s.key === key)
    const googlePos = posOf('google')
    if (googlePos >= 0) {
      for (const [k, label] of [
        ['youtube', 'YouTube'],
        ['ai_gemini', 'Gemini'],
      ]) {
        const p = posOf(k)
        if (p > googlePos) {
          diagnostics.push({
            level: 'warn',
            code: 'shadow-google',
            message: `「谷歌服务」排在「${label}」之前，GEOSITE,google 可能会提前抢占「${label}」的流量。`,
          })
        }
      }
    }
    const aiOtherPos = posOf('ai_other')
    if (aiOtherPos >= 0) {
      for (const k of ['ai_openai', 'ai_claude', 'ai_gemini', 'ai_cursor', 'ai_grok', 'ai_copilot']) {
        const p = posOf(k)
        if (p > aiOtherPos) {
          diagnostics.push({
            level: 'warn',
            code: 'shadow-ai-other',
            message: `「其他国外AI」排在「${enabledServices[p].name}」之前，兜底规则可能抢占细分 AI 流量。`,
          })
        }
      }
    }
    const copilotPos = posOf('ai_copilot')
    if (copilotPos >= 0) {
      for (const [k, label] of [
        ['github', 'Github'],
        ['microsoft', '微软服务'],
      ]) {
        const p = posOf(k)
        if (p >= 0 && p < copilotPos) {
          diagnostics.push({
            level: 'warn',
            code: 'shadow-copilot',
            message: `「${label}」排在「Copilot」之前，可能抢占 Copilot 相关域名。`,
          })
        }
      }
    }

    // 4. 运行产物校验（重名组、死引用、未定义 rule-provider、MATCH 之后不可达规则）
    if (previewResult && previewResult.ok && previewResult.config && state.args?.enable !== false) {
      const cfg = previewResult.config
      const groups = cfg['proxy-groups'] || []
      const proxies = cfg.proxies || []
      const providers = cfg['rule-providers'] || {}
      const rules = cfg.rules || []

      const groupNameCounts = new Map()
      for (const g of groups) {
        groupNameCounts.set(g.name, (groupNameCounts.get(g.name) || 0) + 1)
      }
      for (const [name, count] of groupNameCounts.entries()) {
        if (count > 1) {
          diagnostics.push({
            level: 'error',
            code: 'duplicate-group-name',
            message: `生成了 ${count} 个重名策略组「${name}」，Mihomo 加载配置时会报错。`,
          })
        }
      }

      const validTargets = new Set([
        'DIRECT',
        'REJECT',
        'REJECT-DROP',
        'PASS',
        'COMPATIBLE',
        ...groups.map((g) => g.name),
        ...proxies.map((p) => p.name),
      ])
      const deadTargets = new Set()
      const deadGroupRefs = new Set()
      const missingProviders = new Set()
      let matchSeenAt = -1

      for (const g of groups) {
        for (const pName of g.proxies || []) {
          if (pName && !validTargets.has(pName)) {
            deadGroupRefs.add(`${g.name} → ${pName}`)
          }
        }
      }

      rules.forEach((raw, idx) => {
        const parts = String(raw || '').split(',').map((s) => s.trim())
        const type = (parts[0] || '').toUpperCase()
        if (matchSeenAt >= 0 && idx > matchSeenAt) {
          // Reported once below
        } else if (type === 'MATCH') {
          matchSeenAt = idx
        }

        const target = type === 'MATCH' ? parts[1] : parts[2]
        if (target && !validTargets.has(target)) {
          deadTargets.add(target)
        }
        if (type === 'RULE-SET' && parts[1] && !Object.prototype.hasOwnProperty.call(providers, parts[1])) {
          missingProviders.add(parts[1])
        }
      })

      for (const ref of deadGroupRefs) {
        diagnostics.push({
          level: 'error',
          code: 'dead-group-proxy',
          message: `策略组引用了不存在的候选代理/分组「${ref}」。`,
        })
      }

      for (const target of deadTargets) {
        diagnostics.push({
          level: 'error',
          code: 'dead-rule-target',
          message: `存在规则指向未定义的策略组/节点「${target}」（请检查是否改名或关闭了对应服务组）。`,
        })
      }
      for (const prov of missingProviders) {
        diagnostics.push({
          level: 'error',
          code: 'missing-rule-provider',
          message: `规则引用了未定义的 RULE-SET「${prov}」。`,
        })
      }
      if (matchSeenAt >= 0 && matchSeenAt < rules.length - 1) {
        diagnostics.push({
          level: 'warn',
          code: 'rules-after-match',
          message: `第 #${matchSeenAt + 1} 条 MATCH 兜底规则之后还有 ${rules.length - 1 - matchSeenAt} 条规则，它们永远不会被命中。`,
        })
      }
    }

    return diagnostics
  }

  /**
   * 模拟域名/端口的分流规则命中与最终路由链
   */
  function parseMatchQuery(rawQuery) {
    const trimmed = String(rawQuery || '').trim()
    if (!trimmed) return null

    // 纯端口号或 port:22
    const portOnly = trimmed.match(/^(?:port\s*[:=]\s*)?(\d{1,5})$/i)
    if (portOnly) {
      const port = Number(portOnly[1])
      if (port >= 1 && port <= 65535) {
        return { raw: trimmed, host: '', port }
      }
    }

    let cleaned = trimmed
    let port = null
    if (/^https?:\/\//i.test(cleaned)) {
      const scheme = cleaned.toLowerCase().startsWith('https://') ? 'https' : 'http'
      cleaned = cleaned.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]
      port = scheme === 'https' ? 443 : 80
    } else {
      cleaned = cleaned.split(/[/?#]/)[0]
    }

    const hostPort = cleaned.match(/^([^:\s]+):(\d{1,5})$/)
    if (hostPort) {
      const p = Number(hostPort[2])
      return {
        raw: trimmed,
        host: hostPort[1].toLowerCase().replace(/\.$/, ''),
        port: p >= 1 && p <= 65535 ? p : port,
      }
    }

    return {
      raw: trimmed,
      host: cleaned.toLowerCase().replace(/\.$/, ''),
      port,
    }
  }

  function matchPortRule(port, payload) {
    if (port === null || port === undefined) return false
    const segments = String(payload || '').split('/')
    for (const seg of segments) {
      const s = seg.trim()
      if (!s) continue
      const range = s.match(/^(\d+)-(\d+)$/)
      if (range) {
        const lo = Number(range[1])
        const hi = Number(range[2])
        if (port >= lo && port <= hi) return true
      } else if (/^\d+$/.test(s) && port === Number(s)) {
        return true
      }
    }
    return false
  }

  function simulateRuleMatch(rawQuery, config, simulatedSelections) {
    const parsed = parseMatchQuery(rawQuery)
    if (!parsed || !config) return null

    const rules = config.rules || []
    const groupsByName = new Map((config['proxy-groups'] || []).map((g) => [g.name, g]))
    const selections = simulatedSelections || {}
    const passedDynamic = []
    let matched = null

    for (let i = 0; i < rules.length; i++) {
      const raw = String(rules[i] || '')
      const parts = raw.split(',').map((s) => s.trim())
      const type = (parts[0] || '').toUpperCase()
      const payload = type === 'MATCH' ? '*' : parts[1] || ''
      const target = type === 'MATCH' ? parts[1] || '' : parts[2] || ''

      if (type === 'DOMAIN' && parsed.host && parsed.host === payload.toLowerCase()) {
        matched = { idx: i + 1, raw, type, payload, target }
        break
      }
      if (type === 'DOMAIN-SUFFIX' && parsed.host) {
        const suf = payload.toLowerCase().replace(/^\./, '')
        if (parsed.host === suf || parsed.host.endsWith('.' + suf)) {
          matched = { idx: i + 1, raw, type, payload, target }
          break
        }
      }
      if (type === 'DOMAIN-KEYWORD' && parsed.host && payload && parsed.host.includes(payload.toLowerCase())) {
        matched = { idx: i + 1, raw, type, payload, target }
        break
      }
      if (type === 'DST-PORT' && matchPortRule(parsed.port, payload)) {
        matched = { idx: i + 1, raw, type, payload, target }
        break
      }
      if (type === 'MATCH') {
        matched = { idx: i + 1, raw, type, payload: '*', target }
        break
      }
      if (type === 'GEOSITE' || type === 'GEOIP' || type === 'RULE-SET') {
        passedDynamic.push({ idx: i + 1, raw, type, payload, target })
      }
    }

    const chain = []
    if (matched && matched.target) {
      const visited = new Set()
      let cur = matched.target
      while (cur && !visited.has(cur)) {
        visited.add(cur)
        chain.push(cur)
        const group = groupsByName.get(cur)
        if (!group || !Array.isArray(group.proxies) || group.proxies.length === 0) break
        cur = selections[cur] && group.proxies.includes(selections[cur]) ? selections[cur] : group.proxies[0]
      }
    }

    return {
      query: parsed.raw,
      host: parsed.host,
      port: parsed.port,
      matched,
      passedDynamic,
      chain,
    }
  }

  global.YaNetGenerator = {
    generateGlobalScript,
    parseSampleNodes,
    analyzeNodes,
    executeScriptPreview,
    diagnoseConfig,
    simulateRuleMatch,
    toYaml,
    parseExistingScript,
  }
})(window)
