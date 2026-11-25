import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function read(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error('Check failed: ' + msg)
  }
}

// 1. Verify syntax of all browser JS files
for (const file of ['defaults.js', 'generator.js', 'app.js', 'presets/dev-lean/global_script.js']) {
  new vm.Script(read(file), { filename: file })
}

// Load defaults.js & generator.js in a clean browser-like VM context
const sandbox = { console, URL, RegExp, Date, Math, JSON, Object, Array, Set, Map, Number, String, Boolean, Error }
sandbox.window = sandbox
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(read('defaults.js'), sandbox, { filename: 'defaults.js' })
vm.runInContext(read('generator.js'), sandbox, { filename: 'generator.js' })

const { YaNetDefaults, YaNetGenerator } = sandbox
assert(YaNetDefaults && YaNetGenerator, 'YaNetDefaults and YaNetGenerator exported')

// 2. Multiplier regex test suite
const def = YaNetDefaults.createDefaultState()
const re = new RegExp(def.args.multiplierRegex, def.args.multiplierFlags)
const multCases = [
  ['🇭🇰 香港 01 | IEPL x1', 1],
  ['🇭🇰 香港 03 | IPLC x3', 3],
  ['🇺🇸 美国 02 | 圣何塞 GPT x1.5', 1.5],
  ['🇺🇸 美国 03 | 纽约家宽 倍率5', 5],
  ['🇺🇸 美国 03 | 倍率: 3.5', 3.5],
  ['🇺🇸 美国 03 | 倍率：10', 10],
  ['🇭🇰 香港 01 | IPLC ×3', 3],
  ['🇭🇰 香港 01 | IPLC x10', 10],
  ['🇭🇰 香港 01 | IPLC x20.5', 20.5],
  ['🇭🇰 香港 01 | IEPL 1x', 1],
  ['🇺🇸 美国 01 | 洛杉矶 1.5x', 1.5],
  ['🇺🇸 美国 01 | 洛杉矶 0.5x', 0.5],
  ['🇺🇸 美国 01 | 洛杉矶 x0.5', 0.5],
  ['🇺🇸 美国 01 | 免费 0x', 0],
  ['🇺🇸 美国 01 | 10倍', 10],
  ['🇺🇸 美国 01 | 1.5 倍', 1.5],
  ['🇺🇸 美国 01 | [3x]', 3],
  ['🇺🇸 美国 01 | (x3)', 3],
  ['香港x3', 3],
  ['香港10x', 10],
  ['🇺🇸 美国 01 | Netflix5', null],
  ['🇯🇵 日本 02 X-Ray', null],
  ['🇯🇵 日本 02X-Ray', null],
  ['🇯🇵 日本 01 | v2rayX3', null],
  ['🇭🇰 香港 01 | IEPL', null],
]
for (const [name, expected] of multCases) {
  const m = re.exec(name)
  const raw = m ? (m[1] ?? m[2]) : null
  const got = raw !== null && raw !== undefined ? parseFloat(raw) : null
  assert(got === expected, `multiplierRegex on "${name}": expected ${expected}, got ${got}`)
}

// 3. Generated script idempotency, null safety, dns.ipv6, githubProxy, region order & preferRegion
const st = YaNetDefaults.createDefaultState()
st.args.githubProxy = 'https://ghfast.top'
st.regions = [st.regions[2], st.regions[4], st.regions[0], st.regions[1]] // JP, SG, HK, US
const code = YaNetGenerator.generateGlobalScript(st)
assert(!code.includes('\n\n\n'), 'Generated code has no consecutive blank lines')

const mainFn = new Function(code + '\nreturn main;')()
const sampleProxies = [
  { name: '🇭🇰 香港 01 | x1', type: 'ss' },
  { name: '🇯🇵 日本 01 | 1.5x', type: 'ss' },
  { name: '🇸🇬 新加坡 01 | ×2', type: 'ss' },
  { name: '🇺🇸 美国 01 | x10', type: 'ss' },
  { name: '🇳🇱 荷兰 01 | 1x', type: 'ss' },
]
const cfg1 = mainFn({ proxies: sampleProxies.map((p) => ({ ...p })), 'proxy-providers': null, dns: { ipv6: true } })
const cfg2 = mainFn({ proxies: sampleProxies.map((p) => ({ ...p })), 'proxy-providers': null, dns: {} })
assert(cfg1.rules.length === cfg2.rules.length, 'main(config) is idempotent across calls')
assert(cfg1.dns.ipv6 === true, 'Preserves config.dns.ipv6 when includeVergeManaged=false')
assert(!Object.prototype.hasOwnProperty.call(cfg2.dns, 'ipv6'), 'Omits dns.ipv6 when absent and includeVergeManaged=false')
assert(
  cfg1['external-ui-url'] === 'https://ghfast.top/https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip',
  'githubProxy trailing slash normalized'
)
assert(cfg1['rule-providers'].applications.url.startsWith('https://ghfast.top/https://github.com/'), 'githubProxy applied to GitHub provider')
assert(cfg1['rule-providers']['hk-media'].url === 'https://ruleset.skk.moe/Clash/non_ip/stream_hk.txt', 'githubProxy skips non-GitHub URL')
const regionOrder = cfg1['proxy-groups'].slice(-4).map((g) => g.name)
assert(
  JSON.stringify(regionOrder) === JSON.stringify(['JP日本', 'SG新加坡', 'HK香港', '其他节点']),
  'Region order preserved: ' + JSON.stringify(regionOrder)
)

// 4. preferRegion can be cleared (no hardcoded sgFirstKeys override)
const stAi = YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState())
const openaiSvc = stAi.services.find((s) => s.key === 'ai_openai')
openaiSvc.preferRegion = ''
const aiPreview = YaNetGenerator.executeScriptPreview(YaNetGenerator.generateGlobalScript(stAi), stAi.sampleNodesText, stAi)
const openaiGroup = aiPreview.config['proxy-groups'].find((g) => g.name === 'OpenAI')
assert(openaiGroup.proxies[0] === '默认节点', 'Clearing preferRegion on ai_openai stops forcing SG first')

// 5. parseSampleNodes, toYaml, parseExistingScript
const parsedYaml = YaNetGenerator.parseSampleNodes(
  [
    'proxies:',
    '  - { type: vless, servername: www.microsoft.com, name: "🇭🇰 香港, 01" }',
    '  - name: "🇯🇵 日本 01"',
    '    type: vless',
    '    sni: example.com',
    '    flow: xtls-rprx-vision',
    '    alpn:',
    '      - h2',
  ].join('\n')
)
assert(parsedYaml.length === 2 && parsedYaml[0].name === '🇭🇰 香港, 01' && parsedYaml[1].name === '🇯🇵 日本 01', 'parseSampleNodes handles YAML')

const yml = YaNetGenerator.toYaml({ dash: '- hi', empty: { a: undefined }, inf: Infinity })
assert(yml.includes('dash: "- hi"') && yml.includes('empty: {}') && yml.includes('inf: null'), 'toYaml edge cases')

const stImport = YaNetDefaults.createDefaultState()
stImport.builtinProviders = []
const reimported = YaNetGenerator.parseExistingScript(YaNetGenerator.generateGlobalScript(stImport))
assert(reimported.builtinProviders.length === 0, 'parseExistingScript preserves empty ruleProviders')
assert(reimported.dnsExtra.nameserverPolicy.length === 3 && reimported.dnsExtra.nameserverPolicy[1].target === '$chinaDNS', 'parseExistingScript round-trips nameserver-policy')

// 6. diagnoseConfig & simulateRuleMatch
const stLean = YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState())
const leanCode = YaNetGenerator.generateGlobalScript(stLean)
const leanPrev = YaNetGenerator.executeScriptPreview(leanCode, stLean.sampleNodesText, stLean)
assert(leanPrev.ok, 'dev-lean preview executes cleanly')
assert(YaNetGenerator.diagnoseConfig(stLean, leanPrev).length === 0, 'dev-lean preset has 0 diagnostics')

const hitCursorDl = YaNetGenerator.simulateRuleMatch('downloads.cursor.com', leanPrev.config)
assert(hitCursorDl.matched && hitCursorDl.matched.target === '直连', 'downloads.cursor.com matches 直连')

const hitGemini = YaNetGenerator.simulateRuleMatch('https://gemini.google.com/app', leanPrev.config)
assert(hitGemini.matched && hitGemini.matched.target === 'Gemini' && hitGemini.chain[1] === 'SG新加坡', 'gemini.google.com routes to Gemini -> SG新加坡')

const antigravityHosts = [
  'cloudcode-pa.googleapis.com',
  'daily-cloudcode-pa.googleapis.com',
  'aicode.googleapis.com',
  'agentaicode.googleapis.com',
  'businessaicode.googleapis.com',
  'aiplatform.googleapis.com',
  'us-central1-aiplatform.rep.googleapis.com',
  'generativelanguage.googleapis.com',
  'accounts.google.com',
  'oauth2.googleapis.com',
  'oauth2.mtls.googleapis.com',
  'www.googleapis.com',
  'www.mtls.googleapis.com',
  'auth.cloud.google',
  'sts.googleapis.com',
  'iamcredentials.googleapis.com',
  'antigravity.google',
  'ide.antigravity.google',
  'antigravity-hub-auto-updater-974169037036.us-central1.run.app',
  'antigravity-ide-auto-updater-974169037036.us-central1.run.app',
  'storage.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]
for (const host of antigravityHosts) {
  const hit = YaNetGenerator.simulateRuleMatch(host, leanPrev.config)
  assert(hit.matched && hit.matched.target === 'Gemini', `${host} routes to Gemini, got ${hit.matched && hit.matched.target}`)
}
const sandboxHit = YaNetGenerator.simulateRuleMatch('daily-cloudcode-pa.sandbox.googleapis.com', leanPrev.config)
assert(!(sandboxHit.matched && sandboxHit.matched.target === 'Gemini'), 'sandbox googleapis host stays out of Gemini')
const mapsHit = YaNetGenerator.simulateRuleMatch('maps.googleapis.com', leanPrev.config)
assert(!(mapsHit.matched && mapsHit.matched.target === 'Gemini'), 'maps.googleapis.com stays out of Gemini')

const hitX = YaNetGenerator.simulateRuleMatch('x.com', leanPrev.config)
assert(hitX.matched && hitX.matched.target === 'X', 'x.com routes to X')
const hitGrokX = YaNetGenerator.simulateRuleMatch('grok.x.com', leanPrev.config)
assert(hitGrokX.matched && hitGrokX.matched.target === 'Grok', 'grok.x.com stays on Grok, ahead of X')
const hitNetease = YaNetGenerator.simulateRuleMatch('music.163.com', leanPrev.config)
assert(hitNetease.matched && hitNetease.matched.target === '网易云音乐', 'music.163.com routes to 网易云音乐')

const leanRules = leanPrev.config.rules
const appleCnIdx = leanRules.findIndex((rule) => rule.startsWith('GEOSITE,apple-cn,直连'))
const appleIdx = leanRules.findIndex((rule) => rule.startsWith('GEOSITE,apple,苹果服务'))
assert(appleCnIdx >= 0 && appleIdx > appleCnIdx, 'apple-cn direct rule precedes the Apple group')
const adsIdx = leanRules.findIndex((rule) => rule.startsWith('GEOSITE,category-ads-all,'))
const youtubeIdx = leanRules.findIndex((rule) => rule.startsWith('GEOSITE,youtube,'))
const googleIdx = leanRules.findIndex((rule) => rule.startsWith('GEOSITE,google,'))
assert(adsIdx >= 0 && adsIdx < youtubeIdx && adsIdx < googleIdx, 'ads rules precede YouTube and Google')
const neteaseIdx = leanRules.findIndex((rule) => rule.startsWith('DOMAIN-SUFFIX,music.163.com,'))
const appleBeforeAds = leanRules.findIndex((rule) => rule.startsWith('GEOSITE,apple-cn,直连'))
assert(neteaseIdx >= 0 && neteaseIdx < adsIdx, 'NetEase rules precede the ad block')
assert(appleBeforeAds >= 0 && appleBeforeAds < adsIdx, 'Apple rules precede the ad block')
assert(leanRules.some((rule) => rule === 'GEOSITE,discord,Discord'), 'Discord geosite rule is present')
assert(leanRules.some((rule) => rule === 'GEOSITE,steam@cn,直连'), 'Steam CN rule is direct')
assert(leanRules.some((rule) => rule === 'GEOSITE,steam,Steam'), 'Steam geosite rule is present')
assert(!leanRules.some((rule) => rule.includes('日本网站') || rule.includes('GEOIP,jp')), 'Japan group is removed')
assert(!stLean.services.some((svc) => svc.key === 'japan'), 'Japan service is absent from dev-lean')

const mergedMedia = YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState())
YaNetDefaults.applyServiceBundle(mergedMedia, 'media', 'merge')
YaNetDefaults.applyServiceBundle(mergedMedia, 'social', 'merge')
YaNetDefaults.applyServiceBundle(mergedMedia, 'games', 'merge')
YaNetDefaults.applyServiceBundle(mergedMedia, 'dev', 'merge')
const mergedPrev = YaNetGenerator.executeScriptPreview(YaNetGenerator.generateGlobalScript(mergedMedia), mergedMedia.sampleNodesText, mergedMedia)
assert(mergedPrev.ok, 'merged bundles still execute')
assert(mergedPrev.config.rules.some((rule) => rule === 'GEOSITE,youtube,流媒体'), 'merged media keeps the YouTube rule')
const hitMergedX = YaNetGenerator.simulateRuleMatch('x.com', mergedPrev.config)
assert(hitMergedX.matched && hitMergedX.matched.target === '社交媒体', 'merged social catches x.com')
const hitMergedGrok = YaNetGenerator.simulateRuleMatch('grok.x.com', mergedPrev.config)
assert(hitMergedGrok.matched && hitMergedGrok.matched.target === 'Grok', 'grok.x.com stays on Grok after social merge')
assert(mergedPrev.config.rules.some((rule) => rule === 'GEOSITE,steam@cn,直连'), 'merged games keeps Steam CN direct')
assert(mergedPrev.config.rules.some((rule) => rule === 'GEOSITE,github,微软服务'), 'merged dev sends GitHub through 微软服务')
assert(YaNetGenerator.diagnoseConfig(mergedMedia, mergedPrev).length === 0, 'legal merged order has 0 diagnostics')
const defaultState = YaNetDefaults.createDefaultState()
const defaultPrev = YaNetGenerator.executeScriptPreview(
  YaNetGenerator.generateGlobalScript(defaultState),
  defaultState.sampleNodesText,
  defaultState
)
const hitDefaultGrok = YaNetGenerator.simulateRuleMatch('grok.x.com', defaultPrev.config)
assert(hitDefaultGrok.matched && hitDefaultGrok.matched.target === '国外AI', 'merged AI keeps grok.x.com off X')
YaNetDefaults.applyDevLeanPreset(mergedMedia)
assert(mergedMedia.services.some((svc) => svc.key === 'youtube') && !mergedMedia.services.some((svc) => svc.key === 'media'), 'dev-lean expands a merged media bundle')
assert(mergedMedia.services.filter((svc) => svc.key === 'youtube').length === 1, 'dev-lean does not duplicate YouTube')

// Resetting media split on default or dev-lean keeps youtube after ads and preserves 0 violations
const resetDefaultMedia = YaNetDefaults.createDefaultState()
YaNetDefaults.applyServiceBundle(resetDefaultMedia, 'media', 'split')
assert(YaNetDefaults.serviceOrderViolations(resetDefaultMedia.services).length === 0, 'media split reset on default keeps 0 violations')
const resetLeanMedia = YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState())
YaNetDefaults.applyServiceBundle(resetLeanMedia, 'media', 'split')
assert(YaNetDefaults.serviceOrderViolations(resetLeanMedia.services).length === 0, 'media split reset on dev-lean keeps 0 violations')
const resetLeanKeys = resetLeanMedia.services.map((svc) => svc.key)
assert(resetLeanKeys.indexOf('netease') < resetLeanKeys.indexOf('ads'), 'media split reset preserves netease before ads')
assert(resetLeanKeys.indexOf('apple') < resetLeanKeys.indexOf('ads'), 'media split reset preserves apple before ads')

// Moving games before steam triggers shadow-games and repair fixes it
const stGamesOrder = YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState())
const gamesIdx = stGamesOrder.services.findIndex((svc) => svc.key === 'games')
const steamIdx = stGamesOrder.services.findIndex((svc) => svc.key === 'steam')
const [movedGames] = stGamesOrder.services.splice(gamesIdx, 1)
stGamesOrder.services.splice(steamIdx, 0, movedGames)
assert(YaNetDefaults.serviceOrderViolations(stGamesOrder.services).some((item) => item.code === 'shadow-games'), 'games before steam triggers shadow-games')
stGamesOrder.services = YaNetDefaults.repairServiceOrder(stGamesOrder.services)
assert(YaNetDefaults.serviceOrderViolations(stGamesOrder.services).length === 0, 'repairServiceOrder fixes shadow-games')

const hitSsh = YaNetGenerator.simulateRuleMatch('port:22', leanPrev.config)
assert(hitSsh.matched && hitSsh.matched.type === 'DST-PORT' && hitSsh.matched.target === '直连', 'port:22 matches DST-PORT 直连')

// Trigger diagnostics: move Google above YouTube + add dead target rule
const stBad = YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState())
const gIdx = stBad.services.findIndex((s) => s.key === 'google')
const [gSvc] = stBad.services.splice(gIdx, 1)
stBad.services.unshift(gSvc)
stBad.initialRules.push('DOMAIN,broken.example.com,不存在的组')
stBad.systemGroups.downloadGroup.proxies.push('不存在的候选')
const badPrev = YaNetGenerator.executeScriptPreview(YaNetGenerator.generateGlobalScript(stBad), stBad.sampleNodesText, stBad)
const badDiags = YaNetGenerator.diagnoseConfig(stBad, badPrev)
assert(badDiags.some((d) => d.code === 'shadow-google'), 'diagnoseConfig detects Google shadowing YouTube/Gemini')

const stRepair = YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState())
const repairGoogle = stRepair.services.findIndex((svc) => svc.key === 'google')
const [repairAds] = stRepair.services.splice(stRepair.services.findIndex((svc) => svc.key === 'ads'), 1)
stRepair.services.splice(repairGoogle, 0, repairAds)
assert(YaNetDefaults.serviceOrderViolations(stRepair.services).some((item) => item.code === 'shadow-ads'), 'ads after YouTube is a violation')
const orderWithoutAds = stRepair.services.map((svc) => svc.key).filter((key) => key !== 'ads')
stRepair.services = YaNetDefaults.repairServiceOrder(stRepair.services)
assert(YaNetDefaults.serviceOrderViolations(stRepair.services).length === 0, 'repair clears order violations')
const repairedAds = stRepair.services.findIndex((svc) => svc.key === 'ads')
const repairedYt = stRepair.services.findIndex((svc) => svc.key === 'youtube')
const repairedGoogle = stRepair.services.findIndex((svc) => svc.key === 'google')
assert(repairedAds < repairedYt && repairedYt < repairedGoogle, 'repair puts ads before YouTube before Google')
assert(
  stRepair.services.map((svc) => svc.key).filter((key) => key !== 'ads').join('|') === orderWithoutAds.join('|'),
  'repair keeps every other group in place'
)
const legalOrder = YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState()).services.map((svc) => svc.key)
const repairedLegal = YaNetDefaults.repairServiceOrder(
  YaNetDefaults.applyDevLeanPreset(YaNetDefaults.createDefaultState()).services
).map((svc) => svc.key)
assert(legalOrder.join('|') === repairedLegal.join('|'), 'repair leaves a legal order unchanged')
assert(badDiags.some((d) => d.code === 'dead-rule-target'), 'diagnoseConfig detects dead rule target')
assert(badDiags.some((d) => d.code === 'dead-group-proxy'), 'diagnoseConfig detects dead proxy-group member')

// 7. Strict snapshot sync check for presets/dev-lean/global_script.js
const expectedSnapshot = leanCode.trimEnd() + '\n'
const actualSnapshot = read('presets/dev-lean/global_script.js').replace(/\r\n/g, '\n').trimEnd() + '\n'
assert(
  expectedSnapshot === actualSnapshot,
  'presets/dev-lean/global_script.js is out of sync with defaults.js + generator.js!'
)

console.log('All checks passed (syntax, unit tests, diagnostics, rule matcher, and dev-lean snapshot sync).')
