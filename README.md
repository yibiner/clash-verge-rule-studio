# Clash Verge 分流规则工作台

纯静态、零依赖的可视化 **Clash Verge Rev / Mihomo Party** 全局扩展脚本（`global_script.js`）配置与分流规则编辑工具。

- **在线使用**：<https://yibiner.github.io/clash-verge-rule-studio/>
- **代码仓库**：<https://github.com/yibiner/clash-verge-rule-studio>

## 主要特性

- **可视化全量配置**：覆盖基础开关与高倍率节点过滤、服务分流策略组、地区自动分组（URLTest）、系统策略组、DNS 模式与分流策略、内置/关联 `rule-providers`，以及端口、TUN、Sniffer、NTP、GeoX 等内核参数。
- **海外 AI 细分一键预设**：在「服务分流组」支持一键拆分为 `OpenAI`、`Claude`、`Gemini`（含 Google Antigravity）、`Cursor`、`Grok`、`Copilot` 与 `其他国外AI` 兜底组，自动置顶避免被通用规则抢占，也支持一键合并回「国外AI」。
- **拖拽排序**：服务分流组与地区分组支持按住左侧手柄拖拽调整顺序，实时同步规则优先级与代理组展示顺序。
- **真实执行预览**：内置模拟订阅节点并在浏览器中直接运行生成的 `main(config)`，实时预览 Clash Verge 风格代理组、分流规则、最终 YAML 与生成的 `global_script.js`。
- **导入与本地存储**：支持导入已有 `global_script.js` 或 JSON 配置备份；所有配置仅存储在当前浏览器的 `localStorage`，不经过任何后端服务器。

## 使用方法

### 1. 在线打开或本地运行

- **在线打开**：直接访问 <https://yibiner.github.io/clash-verge-rule-studio/>
- **本地运行**：克隆仓库后在项目目录启动任意静态服务，或直接用浏览器打开 `index.html`：

```bash
git clone https://github.com/yibiner/clash-verge-rule-studio.git
cd clash-verge-rule-studio
python3 -m http.server 8080
```

### 2. 在 Clash Verge Rev 中应用

1. 在工作台左侧按需调整服务分流、地区分组、倍率过滤与 DNS / TUN 配置；
2. 点击右上角 **「复制 JS」** 或 **「下载 global_script.js」**；
3. 打开 Clash Verge Rev → **订阅** → **全局扩展脚本**（右键编辑），粘贴并保存即可生效。

> 安全提示：导入外部 `.js` 脚本时会在浏览器本地执行脚本顶层代码以提取配置变量，请仅导入信任的脚本文件。

## 目录结构

```text
clash-verge-rule-studio/
├── index.html      # 页面骨架与弹窗结构
├── styles.css      # 亮色工作台与预览面板样式
├── defaults.js     # 默认配置、Qure 图标列表与海外 AI 细分预设
├── generator.js    # global_script.js 代码生成、沙箱预览执行、YAML 序列化与脚本解析
├── app.js          # 交互状态管理、拖拽排序与实时预览渲染
└── favicon.svg     # 站点图标
```

## 致谢

- 规则结构与默认配置参考：[dahaha-365/YaNet](https://github.com/dahaha-365/YaNet)
- 策略组图标集：[Koolson/Qure](https://github.com/Koolson/Qure)
- GeoIP / GeoSite 规则数据：[MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)
