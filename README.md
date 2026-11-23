# Clash Verge Rule Studio

[![CI](https://github.com/yibiner/clash-verge-rule-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/yibiner/clash-verge-rule-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向开发者的纯静态、零依赖 **Clash Verge Rev / Mihomo** 全局扩展脚本（`global_script.js`）可视化分流规则工作台。

- **在线使用**：<https://yibiner.github.io/clash-verge-rule-studio/>
- **代码仓库**：<https://github.com/yibiner/clash-verge-rule-studio>

> 声明：本项目为独立开源社区工具，与 Clash Verge Rev / Mihomo / MetaCubeX 官方无隶属关系。

## 为什么做这个工具

手改 `global_script.js` 很容易遇到规则顺序互相抢占（例如 `GEOSITE,google` 抢占 `YouTube` / `Gemini`）、脚本覆写掉 Clash Verge 设置页中的端口与 TUN 开关、改完组名忘记同步规则目标等问题。本工作台直接在浏览器中运行生成的 `main(config)`，提供接近 Clash Verge 的实时预览与静态诊断，改完即复制/下载生效。

## 主要特性

- **默认尊重 Clash Verge 接管字段**：默认不写入端口、`allow-lan`、`ipv6`（含 `dns.ipv6`）、`mode`、`unified-delay`、`external-controller`、`secret` 及 TUN 常规配置，避免覆盖 Clash Verge 设置页；需要给 Mihomo Party 或纯 Mihomo 内核使用时，可在「内核与 TUN」顶部一键开启写入。
- **面向开发者的 AI 细分与精简预设**：
  - **海外 AI 细分**：一键拆分为 `OpenAI`、`Claude`、`Gemini`（含 Google Antigravity）、`Cursor`、`Grok`、`Copilot` 与 `其他国外AI` 兜底组，置顶防抢占，也支持一键合并回「国外AI」。
  - **开发精简预设**：YouTube 排在谷歌服务前，默认节点与拆分后的国外 AI 组优先新加坡（`SG`）；`downloads.cursor.com` 直连，其余 Cursor 域名走代理。对应导出快照见 [`presets/dev-lean/global_script.js`](presets/dev-lean/global_script.js)。
- **优先地区可视化配置**：支持为「默认节点」及任意服务分流组单独指定优先置顶地区（`preferRegion`），并支持服务组改名后一键同步规则目标。
- **拖拽排序与顺序保留**：服务分流组与地区分组均支持按住左侧手柄拖拽排序，生成脚本严格保留你配置的地区展示与匹配顺序。
- **真实执行预览、静态诊断与命中模拟**：
  - 内置模拟订阅节点（支持直接粘贴节点名或 Clash YAML `proxies` 片段），在浏览器中真实运行 `main(config)`，实时预览代理组、分流规则、输出 YAML 与生成 JS；
  - 自动进行静态诊断（死引用、未定义 `RULE-SET`、重名策略组、正则语法错误、规则顺序抢占警告）；
  - 内置**分流命中测试器**：输入域名、URL 或端口（如 `downloads.cursor.com`、`gemini.google.com`、`port:22`），高亮命中的规则行与完整代理链路。
- **高效编辑体验**：支持暗色/亮色主题切换、轻量撤销（`Ctrl/Cmd+Z`）、URL 压缩分享链接（`#cfg=...`），以及 JSON 完整备份与 `.js` 脚本导入；全部数据仅存本地 `localStorage`，不经过任何后端。

## 使用方法

### 1. 在线打开或本地运行

- **在线打开**：直接访问 <https://yibiner.github.io/clash-verge-rule-studio/>
- **本地运行**：克隆仓库后用任意静态服务启动，或直接双击打开 `index.html`：

```bash
git clone https://github.com/yibiner/clash-verge-rule-studio.git
cd clash-verge-rule-studio
python3 -m http.server 8080
```

### 2. 在 Clash Verge Rev 中应用

1. 在工作台左侧按需调整服务分流、地区分组、倍率过滤与 DNS / TUN 配置；
2. 建议先在右侧「分流规则」页检查是否存在静态诊断警告，并用命中测试验证关键域名；
3. 点击右上角 **「复制 JS」** 或 **「下载 global_script.js」**；
4. 打开 Clash Verge Rev → **订阅** → **全局扩展脚本**（右键编辑），粘贴并保存即可生效。

### 3. 备份、导入与 Sub-Store 传参

- **JSON 备份 vs 导入 `.js`**：
  - **备份 JSON** 可 100% 完整保存与还原工作台内的全部配置（含内核、TUN、系统策略组与导出开关）；
  - **导入 `.js`** 会提取脚本顶层的 `defaultArgs`、服务分流、地区定义、DNS 与 `ruleProviders` 配置（兼容 YaNet 风格脚本）。
- **Sub-Store `$arguments` 支持**：导出的脚本保留了 `$arguments` 覆盖机制，例如可通过传参动态覆盖 `mode=fast`、`globalRatioLimit=3`、`githubProxy=https://ghfast.top/`。

> 安全提示：导入外部 `.js` 脚本时会在浏览器本地执行脚本顶层代码以提取配置变量，请仅导入信任的脚本文件。

## 本地验证与开发

项目零构建依赖，修改 `defaults.js` 或 `generator.js` 后可使用 Node 运行内置自检脚本（验证正则、幂等性、诊断、命中模拟，以及 `presets/dev-lean/global_script.js` 快照一致性）：

```bash
node scripts/check.mjs
```

## 目录结构

```text
clash-verge-rule-studio/
├── index.html                        # 页面骨架与弹窗结构
├── styles.css                        # 亮色/暗色工作台与预览面板样式
├── defaults.js                       # 默认配置、Qure 图标列表与预设定义
├── generator.js                      # global_script.js 代码生成、预览执行、静态诊断、命中模拟与解析
├── app.js                            # 交互状态管理、撤销栈、分享链接、拖拽排序与实时渲染
├── favicon.svg                       # 原创分流路由站点图标
├── LICENSE                           # MIT 许可证
├── scripts/
│   └── check.mjs                     # 零依赖自动化校验与预设快照同步检查
└── presets/
    └── dev-lean/
        └── global_script.js          # 「开发精简」预设导出的脚本快照
```

## 上游数据源与致谢

为保证代理配置透明可审计，以下列出默认配置与生成脚本引用的全部外部资源：

| 项目 / 来源 | 用途 |
| --- | --- |
| [dahaha-365/YaNet](https://github.com/dahaha-365/YaNet) | 规则脚本结构与默认配置参考 |
| [Koolson/Qure](https://github.com/Koolson/Qure) | 策略组彩色图标集 |
| [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) | GeoIP / GeoSite / MMDB / ASN 数据库与 `category-bank-jp` 规则集 |
| [DustinWin/ruleset_geodata](https://github.com/DustinWin/ruleset_geodata) | `applications.list`（下载软件规则集） |
| [Sukka / ruleset.skk.moe](https://ruleset.skk.moe/) | 港澳台流媒体规则集（`stream_hk.txt` / `stream_tw.txt`） |
| [217heidai/adblockfilters](https://github.com/217heidai/adblockfilters) | `adblockmihomo.mrs`（广告过滤规则集） |
| [Zephyruso/zashboard](https://github.com/Zephyruso/zashboard) | 默认外部面板下载地址（`external-ui-url`） |

## License

本项目采用 [MIT License](LICENSE) 开源。
