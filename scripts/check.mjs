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
