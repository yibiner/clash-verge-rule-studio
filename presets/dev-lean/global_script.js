/***
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

const _skipIps = "10.0.0.0/8;100.64.0.0/10;127.0.0.0/8;169.254.0.0/16;172.16.0.0/12;192.168.0.0/16;198.18.0.0/16;FC00::/7;FE80::/10;::1/128"

// DNS 配置
const _chinaDohDns = "https://doh.pub/dns-query;https://dns.alidns.com/dns-query"
const _foreignDohDns = "https://dns.google/dns-query;https://dns.adguard-dns.com/dns-query"
const _chinaIpDns = "119.29.29.29;223.5.5.5"
const _foreignIpDns = "8.8.8.8;94.140.14.14"

const defaultArgs = {
  enable: true,
  ruleSet: "ai_cursor;ai_gemini;ai_openai;ai_claude;ai_grok;ai_other;youtube;google;github;microsoft;apple;whatsapp;telegram;line;spotify;biliintl;tiktok;mediaHMT;games;ads",
  regionSet: "all",
  interfaceName: "",
  excludeHighPercentage: true,
  globalRatioLimit: 2,
  skipIps: _skipIps,
  defaultDNS: "119.29.29.29;223.5.5.5",
  directDNS: "119.29.29.29;223.5.5.5",
  chinaDNS: "https://doh.pub/dns-query;https://dns.alidns.com/dns-query",
  foreignDNS: "https://dns.google/dns-query;https://dns.adguard-dns.com/dns-query",
  dns: true,
  sniffer: false,
  mode: "default",
  ipv6: false,
  logLevel: "error",
  githubProxy: "",
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
  if (/^https?:\/\/(github\.com|raw\.githubusercontent\.com|gist\.githubusercontent\.com)\//i.test(url)) {
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
  "ai_cursor": false,
  "ai_gemini": false,
  "ai_openai": false,
  "ai_claude": false,
  "ai_grok": false,
  "ai_copilot": false,
  "ai_other": false,
  "youtube": false,
  "google": false,
  "github": false,
  "microsoft": false,
  "apple": false,
  "whatsapp": false,
  "telegram": false,
  "line": false,
  "spotify": false,
  "biliintl": false,
  "tiktok": false,
  "mediaHMT": false,
  "games": false,
  "ads": false,
  "bahamut": false,
  "netflix": false,
  "disney": false,
  "pixiv": false,
  "hbo": false,
  "primevideo": false,
  "hulu": false,
  "japan": false,
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
  "DST-PORT,22,直连",
  "DST-PORT,3389,直连",
  "DST-PORT,5938,直连",
  "DST-PORT,7070,直连",
  "DST-PORT,19966,直连",
  "DST-PORT,21114-21119,直连",
  "DST-PORT,4118,直连",
  "DST-PORT,7654,直连",
  "DST-PORT,9118,直连",
  "DST-PORT,50000-50100,直连",
  "DST-PORT,5353,直连",
  "GEOSITE,category-collaborate-cn,直连",
  "GEOSITE,category-container,默认节点",
  "RULE-SET,applications,下载软件",
]

// 地区定义
const allRegionDefinitions = [
  {
    name: "HK香港",
    regex: /港|🇭🇰|hk|hongkong|hong kong/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hong_Kong.png",
  },
  {
    name: "US美国",
    regex: /(?!.*aus)(?=.*(美|🇺🇸|us(?!t)|usa|american|united states)).*/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_States.png",
  },
  {
    name: "JP日本",
    regex: /日本|🇯🇵|jp|japan/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Japan.png",
  },
  {
    name: "KR韩国",
    regex: /韩|🇰🇷|kr|korea/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Korea.png",
  },
  {
    name: "SG新加坡",
    regex: /新加坡|🇸🇬|sg|singapore/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Singapore.png",
  },
  {
    name: "CN中国大陆",
    regex: /中国|🇨🇳|cn|china/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China_Map.png",
  },
  {
    name: "TW台湾省",
    regex: /台湾|台灣|🇹🇼|tw|taiwan|tai wan/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China.png",
  },
  {
    name: "GB英国",
    regex: /英|🇬🇧|uk|united kingdom|great britain/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_Kingdom.png",
  },
  {
    name: "DE德国",
    regex: /德国|🇩🇪|de|germany/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Germany.png",
  },
  {
    name: "MY马来西亚",
    regex: /马来|🇲🇾|my|malaysia/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Malaysia.png",
  },
  {
    name: "TK土耳其",
    regex: /土耳其|🇹🇷|tk|turkey/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Turkey.png",
  },
  {
    name: "CA加拿大",
    regex: /加拿大|🇨🇦|ca|canada/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Canada.png",
  },
  {
    name: "AU澳大利亚",
    regex: /澳大利亚|🇦🇺|au|australia|sydney/i,
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Australia.png",
  },
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
  listen: "0.0.0.0:1053",
  'log-level': logLevel,
  'prefer-h3': false,
  'use-hosts': true,
  'use-system-hosts': true,
  'respect-rules': true,
  'enhanced-mode': "fake-ip",
  'fake-ip-range': "198.18.0.0/16",
  'fake-ip-filter-mode': "whitelist",
  'fake-ip-filter': [
    "geosite:jetbrains-ai",
    "geosite:category-ai-!cn",
    "geosite:category-ai-chat-!cn",
    "geosite:category-games-!cn",
    "geosite:category-cdn-!cn",
    "geosite:telegram",
    "geosite:google",
    "geosite:amazon",
    "geosite:category-bank-jp",
    "geosite:category-communication",
    "geosite:gfw",
  ],
  nameserver: chinaDNS,
  'default-nameserver': defaultDNS,
  'direct-nameserver': directDNS,
  'proxy-server-nameserver': chinaDNS,
  'nameserver-policy': {
    "geosite:private": "system",
    "geosite:tld-cn,cn,steam@cn,category-games@cn,microsoft@cn,apple@cn,category-game-platforms-download@cn,category-public-tracker": chinaDNS,
    "geosite:gfw,jetbrains-ai,category-ai-!cn,category-ai-chat-!cn": foreignDNS,
  },
}

// 通用配置
const ruleProviderCommon = {
  type: 'http',
  format: "yaml",
  interval: 86400,
}
const groupBaseOption = {
  interval: 300,
  timeout: 3000,
  url: "https://www.gstatic.com/generate_204",
  lazy: true,
  'max-failed-times': 3,
  hidden: false,
}

// 预定义 Rule Providers
const ruleProviders = {
  "applications": {
    ...ruleProviderCommon,
    behavior: "classical",
    format: "text",
    url: "https://github.com/DustinWin/ruleset_geodata/raw/refs/heads/mihomo-ruleset/applications.list",
    path: "./ruleset/DustinWin/applications.list",
  },
}

// 倍率正则预编译
const multiplierRegex = /(?<![a-zA-Z0-9.])(?:(?:[xX×✕✖⨉]|倍率[:：]?)\s*([1-9]\d*(?:\.\d+)?|0(?:\.\d+)?)|([1-9]\d*(?:\.\d+)?|0(?:\.\d+)?)(?:[xX×✕✖⨉](?![a-zA-Z])|\s*倍))/i

// --- 2. 服务规则数据结构 ---
const serviceConfigs = [
  {
    key: "ai_cursor",
    name: "Cursor",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Bot.png",
    url: "https://api2.cursor.sh/",
    rules: [
      "DOMAIN,downloads.cursor.com,直连",
      "DOMAIN-SUFFIX,cursor.sh,Cursor",
      "DOMAIN-SUFFIX,cursor.com,Cursor",
      "DOMAIN-SUFFIX,cursor-cdn.com,Cursor",
      "DOMAIN-SUFFIX,cursorapi.com,Cursor",
    ],
    preferRegion: "SG",
  },
  {
    key: "ai_gemini",
    name: "Gemini",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Google_Search.png",
    url: "https://gemini.google.com/",
    rules: [
      "DOMAIN-SUFFIX,gemini.google.com,Gemini",
      "DOMAIN-SUFFIX,aistudio.google.com,Gemini",
      "DOMAIN-SUFFIX,makersuite.google.com,Gemini",
      "DOMAIN-SUFFIX,generativelanguage.googleapis.com,Gemini",
      "DOMAIN-SUFFIX,proactivebackend-pa.googleapis.com,Gemini",
      "DOMAIN-SUFFIX,alkalimakersuite-pa.clients6.google.com,Gemini",
      "DOMAIN-SUFFIX,deepmind.com,Gemini",
      "DOMAIN-SUFFIX,deepmind.google,Gemini",
      "DOMAIN-SUFFIX,notebooklm.google.com,Gemini",
      "DOMAIN-SUFFIX,labs.google,Gemini",
      "DOMAIN-SUFFIX,jules.google.com,Gemini",
      "DOMAIN-SUFFIX,bard.google.com,Gemini",
      "DOMAIN-SUFFIX,ai.google.dev,Gemini",
      "DOMAIN-SUFFIX,antigravity.google,Gemini",
      "DOMAIN-SUFFIX,antigravity.google.com,Gemini",
      "DOMAIN-SUFFIX,antigravity-unleash.goog,Gemini",
      "DOMAIN-SUFFIX,cloudcode-pa.googleapis.com,Gemini",
      "DOMAIN-SUFFIX,daily-cloudcode-pa.googleapis.com,Gemini",
      "DOMAIN-SUFFIX,daily-cloudcode-pa.sandbox.googleapis.com,Gemini",
    ],
    preferRegion: "SG",
  },
  {
    key: "ai_openai",
    name: "OpenAI",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/ChatGPT.png",
    url: "https://chatgpt.com/cdn-cgi/trace",
    rules: [
      "DOMAIN-SUFFIX,openai.com,OpenAI",
      "DOMAIN-SUFFIX,chatgpt.com,OpenAI",
      "DOMAIN-SUFFIX,oaistatic.com,OpenAI",
      "DOMAIN-SUFFIX,oaiusercontent.com,OpenAI",
      "DOMAIN-SUFFIX,sora.com,OpenAI",
      "DOMAIN,openaiapi-site.azureedge.net,OpenAI",
      "DOMAIN,openaicom-api-bdcpf8c6d2e9atf6.z01.azurefd.net,OpenAI",
      "DOMAIN,openaicomproductionae4b.blob.core.windows.net,OpenAI",
      "DOMAIN,production-openaicom-storage.azureedge.net,OpenAI",
    ],
    preferRegion: "SG",
  },
  {
    key: "ai_claude",
    name: "Claude",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/AI.png",
    url: "https://claude.ai/cdn-cgi/trace",
    rules: [
      "DOMAIN-SUFFIX,anthropic.com,Claude",
      "DOMAIN-SUFFIX,claude.ai,Claude",
      "DOMAIN-SUFFIX,claude.com,Claude",
      "DOMAIN-SUFFIX,claudeusercontent.com,Claude",
      "DOMAIN-SUFFIX,clau.de,Claude",
      "DOMAIN,servd-anthropic-website.b-cdn.net,Claude",
    ],
    preferRegion: "SG",
  },
  {
    key: "ai_grok",
    name: "Grok",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Twitter.png",
    url: "https://grok.com/",
    rules: [
      "DOMAIN-SUFFIX,x.ai,Grok",
      "DOMAIN-SUFFIX,grok.com,Grok",
      "DOMAIN-SUFFIX,grok.x.com,Grok",
    ],
    preferRegion: "SG",
  },
  {
    key: "ai_copilot",
    name: "Copilot",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Copilot.png",
    url: "https://api.githubcopilot.com/",
    rules: [
      "DOMAIN-SUFFIX,githubcopilot.com,Copilot",
      "DOMAIN-SUFFIX,copilot.github.com,Copilot",
      "DOMAIN-SUFFIX,copilot.microsoft.com,Copilot",
      "DOMAIN-SUFFIX,copilot.cloud.microsoft,Copilot",
      "DOMAIN-SUFFIX,copilot.live.com,Copilot",
      "DOMAIN,sydney.bing.com,Copilot",
      "DOMAIN,edgeservices.bing.com,Copilot",
    ],
  },
  {
    key: "ai_other",
    name: "其他国外AI",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/AI.png",
    url: "https://www.perplexity.ai/",
    rules: [
      "GEOSITE,jetbrains-ai,其他国外AI",
      "GEOSITE,category-ai-!cn,其他国外AI",
      "GEOSITE,category-ai-chat-!cn,其他国外AI",
      "DOMAIN-SUFFIX,meta.ai,其他国外AI",
      "DOMAIN-SUFFIX,meta.com,其他国外AI",
      "DOMAIN-SUFFIX,perplexity.ai,其他国外AI",
      "DOMAIN-SUFFIX,poe.com,其他国外AI",
    ],
    preferRegion: "SG",
  },
  {
    key: "youtube",
    name: "YouTube",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/YouTube.png",
    url: "https://www.youtube.com/s/desktop/494dd881/img/favicon.ico",
    rules: [
      "GEOSITE,youtube,YouTube",
    ],
  },
  {
    key: "google",
    name: "谷歌服务",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Google_Search.png",
    url: "https://www.google.com/generate_204",
    rules: [
      "GEOSITE,google,谷歌服务",
    ],
  },
  {
    key: "github",
    name: "Github",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/GitHub.png",
    url: "https://github.com/robots.txt",
    rules: [
      "GEOSITE,github,Github",
    ],
  },
  {
    key: "microsoft",
    name: "微软服务",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Microsoft.png",
    url: "https://www.msftconnecttest.com/connecttest.txt",
    rules: [
      "GEOSITE,microsoft@cn,国内网站",
      "GEOSITE,microsoft,微软服务",
    ],
  },
  {
    key: "apple",
    name: "苹果服务",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Apple_2.png",
    url: "https://www.apple.com/library/test/success.html",
    rules: [
      "GEOSITE,apple-cn,苹果服务",
    ],
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/WhatsApp.png",
    url: "https://web.whatsapp.com/data/manifest.json",
    rules: [
      "GEOSITE,whatsapp,WhatsApp",
    ],
  },
  {
    key: "telegram",
    name: "Telegram",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Telegram.png",
    url: "https://www.telegram.org/img/website_icon.svg",
    rules: [
      "GEOSITE,telegram,Telegram",
      "GEOIP,telegram,Telegram,no-resolve",
    ],
  },
  {
    key: "line",
    name: "Line",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Line.png",
    url: "https://line.me/page-data/app-data.json",
    rules: [
      "GEOSITE,line,Line",
    ],
  },
  {
    key: "spotify",
    name: "Spotify",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Spotify.png",
    url: "https://spclient.wg.spotify.com/signup/public/v1/account",
    rules: [
      "GEOSITE,spotify,Spotify",
    ],
  },
  {
    key: "biliintl",
    name: "哔哩哔哩东南亚",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/bilibili_3.png",
    url: "https://www.bilibili.tv/",
    rules: [
      "GEOSITE,biliintl,哔哩哔哩东南亚",
    ],
    directFirst: true,
  },
  {
    key: "tiktok",
    name: "Tiktok",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/TikTok.png",
    url: "https://www.tiktok.com/",
    rules: [
      "GEOSITE,tiktok,Tiktok",
    ],
  },
  {
    key: "mediaHMT",
    name: "港澳台媒体",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/TVB.png",
    url: "https://viu.tv/",
    rules: [
      "RULE-SET,hk-media,港澳台媒体",
      "RULE-SET,tw-media,港澳台媒体",
    ],
    providers: [
      {
        key: "hk-media",
        url: "https://ruleset.skk.moe/Clash/non_ip/stream_hk.txt",
        path: "./ruleset/ruleset.skk.moe/stream_hk.txt",
        format: "text",
        behavior: "classical",
      },
      {
        key: "tw-media",
        url: "https://ruleset.skk.moe/Clash/non_ip/stream_tw.txt",
        path: "./ruleset/ruleset.skk.moe/stream_tw.txt",
        format: "text",
        behavior: "classical",
      },
    ],
  },
  {
    key: "games",
    name: "游戏专用",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Game.png",
    rules: [
      "GEOSITE,category-games@cn,国内网站",
      "GEOSITE,category-games,游戏专用",
    ],
  },
  {
    key: "ads",
    name: "广告过滤",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Advertising.png",
    rules: [
      "GEOSITE,category-ads-all,广告过滤",
      "RULE-SET,adblockmihomo,广告过滤",
    ],
    providers: [
      {
        key: "adblockmihomo",
        url: "https://github.com/217heidai/adblockfilters/raw/refs/heads/main/rules/adblockmihomo.mrs",
        path: "./ruleset/adblockfilters/adblockmihomo.mrs",
        format: "mrs",
        behavior: "domain",
      },
    ],
    reject: true,
  },
  {
    key: "bahamut",
    name: "巴哈姆特",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Bahamut.png",
    url: "https://ani.gamer.com.tw/ajax/getdeviceid.php",
    rules: [
      "GEOSITE,bahamut,巴哈姆特",
    ],
    directFirst: true,
  },
  {
    key: "netflix",
    name: "NETFLIX",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Netflix.png",
    url: "https://api.fast.com/netflix/speedtest/v2?https=true",
    rules: [
      "GEOSITE,netflix,NETFLIX",
    ],
  },
  {
    key: "disney",
    name: "Disney+",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Disney+.png",
    url: "https://disney.api.edge.bamgrid.com/devices",
    rules: [
      "GEOSITE,disney,Disney+",
    ],
  },
  {
    key: "pixiv",
    name: "Pixiv",
    icon: "https://play-lh.googleusercontent.com/8pFuLOHF62ADcN0ISUAyEueA5G8IF49mX_6Az6pQNtokNVHxIVbS1L2NM62H-k02rLM=w240-h480-rw",
    url: "https://www.pixiv.net/",
    rules: [
      "GEOSITE,pixiv,Pixiv",
    ],
  },
  {
    key: "hbo",
    name: "HBO",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/HBO.png",
    url: "https://www.hbo.com/favicon.ico",
    rules: [
      "GEOSITE,hbo,HBO",
    ],
  },
  {
    key: "primevideo",
    name: "Prime Video",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Prime_Video.png",
    url: "https://m.media-amazon.com/images/G/01/digital/video/web/logo-min-remaster.png",
    rules: [
      "GEOSITE,primevideo,Prime Video",
    ],
  },
  {
    key: "hulu",
    name: "Hulu",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hulu.png",
    url: "https://auth.hulu.com/v4/web/password/authenticate",
    rules: [
      "GEOSITE,hulu,Hulu",
    ],
  },
  {
    key: "japan",
    name: "日本网站",
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/JP.png",
    url: "https://r.r10s.jp/com/img/home/logo/touch.png",
    rules: [
      "RULE-SET,category-bank-jp,日本网站",
      "GEOIP,jp,日本网站,no-resolve",
    ],
    providers: [
      {
        key: "category-bank-jp",
        url: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-bank-jp.mrs",
        path: "./ruleset/MetaCubeX/category-bank-jp.mrs",
        format: "mrs",
        behavior: "domain",
      },
    ],
  },
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
  // 未写入 Clash Verge 接管字段：mode、ipv6、allow-lan、unified-delay、端口、external-controller、secret、external-controller-cors，以及 TUN 设置页中的协议栈、网卡、路由、DNS 劫持、严格路由、MTU。
  // 这些值以 Clash Verge 设置页为准。其他客户端需要脚本写入时，打开工作台的「导出时写入 Clash Verge 接管字段」。
  config['bind-address'] = "*"
  config['external-ui'] = "ui"
  config['external-ui-url'] = applyGithubProxy("https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip")
  const finalDnsConfig = { ...dnsConfig }
  if (config.dns && Object.prototype.hasOwnProperty.call(config.dns, 'ipv6')) {
    finalDnsConfig.ipv6 = config.dns.ipv6
  }
  if (config.dns?.['proxy-server-nameserver']) {
    finalDnsConfig['proxy-server-nameserver'] = config.dns['proxy-server-nameserver']
  }
  if (config.dns?.['proxy-server-nameserver-policy']) {
    finalDnsConfig['proxy-server-nameserver-policy'] = config.dns['proxy-server-nameserver-policy']
  }
  config['dns'] = finalDnsConfig
  config['profile'] = {
    'store-selected': true,
    'store-fake-ip': true,
  }
  config['tcp-concurrent'] = true
  config['keep-alive-interval'] = 1800
  config['find-process-mode'] = "strict"
  config['geodata-mode'] = false
  config['geodata-loader'] = "memconservative"
  config['geo-auto-update'] = true
  config['geo-update-interval'] = 24

  if (interfaceName.length > 0) {
    config['interface-name'] = interfaceName
  }

  config['sniffer'] = {
    enable: sniffer,
    'force-dns-mapping': true,
    'parse-pure-ip': true,
    'override-destination': true,
    sniff: {
      TLS: {
        ports: [443,8443],
      },
      HTTP: {
        ports: [80,"8080-8880"],
      },
      QUIC: {
        ports: [443,8443],
      },
    },
    'skip-src-address': skipIps.filter((ip) => ip !== '198.18.0.0/16'),
    'skip-domain': ["Mijia Cloud","+.oray.com"],
  }

  config['ntp'] = {
    enable: true,
    'write-to-system': false,
    server: "cn.ntp.org.cn",
  }
  config['tun'] = {
    ...(config['tun'] && typeof config['tun'] === 'object' ? config['tun'] : {}),
    gso: true,
    'gso-max-size': 65536,
    'exclude-interface': ["NodeBabyLink"],
  }
  config['geox-url'] = {
    geoip: applyGithubProxy("https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat"),
    geosite: applyGithubProxy("https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat"),
    mmdb: applyGithubProxy("https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb"),
    asn: applyGithubProxy("https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb"),
  }

  if (!Array.isArray(config.proxies)) {
    config.proxies = []
  }

  config.proxies.push({
    name: "直连",
    type: 'direct',
    udp: true,
    'routing-mark': 5555,
  })

  config.proxies.push({
    name: "拒绝",
    type: 'reject',
    udp: false,
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
        tolerance: 50,
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
      name: "其他节点",
      type: "select",
      proxies: otherProxies,
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/World_Map.png",
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
    name: "默认节点",
    type: "select",
    proxies: preferRegionFirst([...regionGroupNames, "其他节点", "直连"].filter((n) => n !== "其他节点" || otherProxies.length > 0), "SG"),
    icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Proxy.png",
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
        groupProxies = ["拒绝", "直连", "默认节点"]
      } else if (svc.directFirst || svc.key === 'biliintl' || svc.key === 'bahamut') {
        groupProxies = ["默认节点", "直连", ...regionGroupNames]
      } else {
        groupProxies = ["默认节点", ...regionGroupNames, "直连"]
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
    "GEOSITE,private,直连",
    "GEOSITE,category-public-tracker,直连",
    "GEOSITE,category-game-platforms-download@cn,直连",
    "GEOSITE,category-remote-control,直连",
    "GEOIP,private,直连,no-resolve",
    "GEOSITE,cn,直连",
    "GEOIP,cn,直连,no-resolve",
    "MATCH,其他外网",
  )

  functionalGroups.push(
    {
      ...groupBaseOption,
      name: "下载软件",
      type: "select",
      proxies: ["直连", "拒绝", "默认节点", "国内网站", ...regionGroupNames],
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Download.png",
    },
    {
      ...groupBaseOption,
      name: "其他外网",
      type: "select",
      proxies: ["默认节点", "国内网站", ...regionGroupNames],
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Streaming!CN.png",
    },
    {
      ...groupBaseOption,
      name: "国内网站",
      type: "select",
      proxies: ["直连", "默认节点", ...regionGroupNames],
      url: "https://wifi.vivo.com.cn/generate_204",
      icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/StreamingCN.png",
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
