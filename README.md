# Customer Letter Assistant

A local, privacy-friendly tool that turns the customer list page of **OKKI / Xiaoman CRM (小满 CRM)** into personalized multilingual sales letters — powered by your local [Claude Code](https://claude.com/claude-code) CLI.

> 本地运行的外贸开发信助手：抓取 OKKI（小满）「我的客户」列表当前页 → 按客户国家自动选择语言 → 用本地 Claude Code 生成个性化开发信 → 生成可一键复制的本地网页。数据只保存在你自己的电脑上。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 功能 / Features

- **只抓当前页**：不翻页、不点客户详情，只读取列表里已显示的字段。
- **多语言**：拉美西语 / 巴西葡语全文，欧洲、中东、俄语、日韩、东南亚「本地语主题 + 开场 + 英文正文」，英语市场纯英文，并附中文对照。
- **个性化**：根据公司官网 / 公开搜索结果写开场，找不到就写通用但不出错的版本，不编造。
- **本地报告**：生成 HTML 页面，主题、正文、中文对照每一格都有「复制」按钮；可展开 English backup。
- **安全**：不自动发邮件、不连接任何第三方服务器、代码里不含任何 API Key；客户数据只写本机。
- **可配置**：公司资料、跳过规则、数据目录全部在 `config.json` 里改。

---

## 工作原理 / How it works

```
Chrome 扩展（MV3）
   │  在 OKKI 客户列表页抓取当前页字段
   ▼
本地 Node 服务 127.0.0.1:8788   ← 数据落盘为 JSONL
   │  检测到新数据后分批调用
   ▼
本地 Claude Code CLI（无窗口）  ← 按 marketing-prompt.md 生成营销信
   │
   ▼
本地 HTML 报告（每格一键复制）
```

- 扩展只注入 `https://crm.xiaoman.cn/*`。
- 服务只监听 `127.0.0.1:8788`，不对外开放。
- 营销信由**本机已登录的 Claude Code CLI** 生成，不需要在项目里填写任何 API Key。

---

## 环境要求 / Requirements

| 项目 | 要求 |
|---|---|
| 系统 | Windows 10 / 11 |
| 浏览器 | Chrome（支持 Manifest V3） |
| Node.js | ≥ 18 |
| Claude Code CLI | 已安装并完成登录（命令行能直接运行 `claude`） |

检查是否就绪：

```bash
node -v
claude --version
```

---

## 快速开始 / Quick start

1. **下载项目**
   ```bash
   git clone https://github.com/sayonara333666/okki-sales-letter.git
   ```
   或者点 GitHub 页面右上角 **Code → Download ZIP**，解压到任意目录。

2. **填写公司资料**

   打开 `config.json`，把 `profile` 里的示例信息换成你自己的：

   ```json
   "profile": {
     "companyName": "Your Company Name",
     "companyNameLocal": "你的公司全称",
     "brand": "Your Brand",
     "location": "Your City, Your Country",
     "shippingPort": "Your Port",
     "products": "your main products",
     "certifications": "",
     "contactName": "[Your Name]",
     "contactTitle": "Sales Manager",
     "phone": "+00 000 000 0000",
     "email": "sales@example.com",
     "website": ""
   }
   ```

   - 营销信里的「我们是谁」和名片都从这个对象读取。
   - 保持示例占位也能跑，只是生成的信会很通用。
   - **不想让真实公司资料出现在 Git 里？** 新建 `config.local.json` 填同样的 `profile` 即可，它会覆盖 `config.json`，并且已被 `.gitignore` 排除：

   ```json
   {
     "profile": {
       "companyName": "Your Company Name",
       "companyNameLocal": "你的公司全称",
       "contactName": "Your Name",
       "phone": "+00 000 000 0000",
       "email": "sales@example.com"
     }
   }
   ```

3. **启动本地服务**

   双击 `启动Customer Letter Assistant.bat`，保持窗口打开。

4. **加载 Chrome 扩展**

   打开 `chrome://extensions` → 打开右上角「开发者模式」→「加载已解压的扩展程序」→ 选择本项目文件夹。

5. **抓取并生成**

   - 打开 OKKI「我的客户 / 客户管理」列表页；
   - **按「创建时间 ↓」排序**（不要按最近联系时间，否则发信后客户会跳页）；
   - 点左下角紫色的「Customer Letter Assistant」面板 → **抓取当前页客户**；
   - 等分析完成，会自动打开生成的营销信网页。

6. **复制使用**

   在报告页点每格的「复制」按钮，粘贴到你的邮箱。发送前请核对公司信息，并把 `[Your Name]` 换成你的签名。

---

## 配置说明 / Configuration

`config.json` 常用项：

| 键 | 默认值 | 说明 |
|---|---|---|
| `profile` | 示例占位 | 公司资料，用于营销信和名片 |
| `dataDir` | `""` | 空 = 当前用户桌面 `Customer Letter Assistant Data`；也可填相对/绝对路径 |
| `skipTags` | `["第一次发送营销信"]` | 客户标签包含这些词时跳过 |
| `skipIfEdmSent` | `true` | 最近发过 EDM 的客户跳过，避免重复打扰 |
| `catalogImage` | `产品目录.png` | 报告侧边「复制产品目录」用的图片，文件不存在则不显示按钮 |
| `claude.command` | `claude` | Claude Code CLI 命令名或完整路径 |
| `claude.model` | `""` | 留空用默认模型 |
| `autoAnalyze.enabled` | `true` | 是否自动分析新抓取的数据 |

> 产品目录图片属于公司资料，**没有随仓库提供**。需要的话，把你的目录图命名为 `产品目录.png` 放进项目根目录即可（该文件已被 `.gitignore` 排除，不会误提交）。

---

## 数据与隐私 / Data & privacy

- 客户原始数据、生成缓存、HTML 报告都在数据目录里，默认是桌面 `Customer Letter Assistant Data`。
- `.gitignore` 已排除：`*客户页面.jsonl`、`营销信缓存.json`、`营销信填写.json`、`客户营销信_*.html`、产品目录图片等。
- 项目**不包含也不需要**任何 API Key：模型调用的是你本机已登录的 Claude Code CLI。
- 不自动发邮件；没有 SMTP 配置，也不保存邮箱账号。

---

## 已知限制 / Limitations

- 页面解析是按 OKKI（小满）当前列表结构写的；对方改版后可能需要更新 `content.js` 里的选择器。
- 只处理当前页，不翻页。
- 美国 / 美属地区默认跳过（可在 `marketing-prompt.md` 中调整规则）。
- 生成的营销信是草稿，**发送前请人工核对**，不要承诺未经确认的认证、产能或交期。
- 使用前请遵守 OKKI / 小满的服务条款与当地数据法规。

---

## 目录结构 / Project structure

```
.
├─ manifest.json              Chrome 扩展配置（MV3）
├─ background.js              Service Worker：转发抓取数据
├─ content.js                 页面抓取脚本（OKKI 客户列表）
├─ banner.js                  启动横幅
├─ config.js / config.json    配置加载与默认值
├─ server.js                  本地 HTTP 服务（127.0.0.1:8788）
├─ watcher.js                 监听新数据 → 调用 Claude Code
├─ report.js                  生成营销信 HTML 报告
├─ format.js                  统一 Dear / Best regards 格式
├─ marketing-prompt.md        营销信生成规则
├─ service.js                 启动入口
├─ tools/                     保存与批次处理工具
├─ 使用说明.md                 中文使用说明
├─ 使用前请先阅读.txt           快速上手
├─ 技术文档.md                 技术细节
└─ 启动Customer Letter Assistant.bat
```

---

## 贡献 / Contributing

欢迎提 Issue 和 Pull Request。提交前请确认：

- 不要提交任何客户数据、公司内部资料或 API Key；
- 代码风格与现有文件保持一致；
- 涉及页面解析的改动，请说明测试过的 OKKI 页面结构。

---

## 许可证 / License

[MIT](LICENSE)
