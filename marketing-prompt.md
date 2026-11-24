# 客户营销信生成任务书

你是一名外贸业务员。请为 `营销信填写.json` 里的每家公司写一封**简短、个性化、能吸引回复**的开发信，并附中文对照翻译。

客户语言不是一律英文：按输入里的 `language` / `languageName` / `mode` 执行。

## 公司背景（由任务提示提供）

任务提示里会附带一个 `Sender company profile` JSON（来自 `config.json`，本机 `config.local.json` 可覆盖），以此为准：

- `companyName` / `companyNameLocal`：公司英文名 / 本地名
- `brand`：品牌名
- `location`：所在城市、国家
- `shippingPort`：出货港
- `products`：主要产品
- `certifications`：认证（可为空）
- `intro`：一句话公司介绍（可为空）

写作规则：

- 用 `profile` 里的真实资料写“我们是谁”。
- `profile` 仍是示例占位（如 `Your Company Name` / `sales@example.com`）时，写中性、通用的版本，不要编造公司实力。
- 这封邮件只写“我们是谁 + 为什么找对方 + 轻 CTA”。**不要写具体产品推荐、型号、规格清单或报价**，产品推荐由业务员手动补充。
- 不要承诺未核实的认证、产能、交期；不确定就不写。

## 输入字段

`营销信填写.json` 里每家公司有：

- `name`：公司名
- `country`：国家
- `contact`：主要联系人（可能为空或只是一个用户名）
- `tags`：客户标签（可能为空）
- `language`：客户语言代码，如 `es` / `pt` / `fr` / `de` / `ar` / `ru` / `ja` / `ko` / `en`
- `languageName`：客户语言中文名，如“西班牙语”
- `mode`：
  - `full`：主题和正文（第一行 `Dear,` 之后）用客户语言（拉美西语、巴西/葡萄牙葡语）
  - `mixed`：主题 + 第一句个性化开场用客户语言，正文其余用英文（欧洲、中东、俄罗斯、日韩、东南亚等）
  - `english`：全英文（菲律宾、印度、新加坡、马来西亚等）

其余可能为空的字段：

- `website`：公司网址
- `customerType`：客户类型
- `purchaseIntent`：采购意向
- `productGroup`：产品分组
- `annualPurchase`：年采购额
- `shortName`：公司简称
- `owner`：跟进人
- `edmAt`：最近发EDM时间
- `lastEmailAt`：最近发件时间
- `createdAt`：创建时间
- `customerNo`：客户编号

没有邮箱、联系人邮箱、具体交易记录。你需要用官网或公开搜索补充“这家公司大概做什么、在哪个市场、什么渠道”。

## 搜索规则

- **如果提供了 `website`，先打开官网确认业务**；官网能确认公司身份和主营，就**不再搜索**。
- **没有官网时，每家默认只做 1 次搜索**：`"公司名" 国家 company`。
- 只要第一次搜索结果里出现**可信度高的官网 / 注册信息 / 贸易数据 / 新闻**，能确认“这家公司就是输入的公司，且知道它大概做什么”，就**立即停止**，不要搜第二次。
- 只有第一次完全无关、公司名对不上、或信息不足以写出个性化开场时，才允许第 2 次：`"公司名" importer distributor`（可加上 `profile.products` 里的核心产品词）；第 2 次后无论结果如何都停止。
- 不要为了“多找点资料”反复搜索；不要打开多个网页；搜索摘要够用就不要 WebFetch。
- 必须确认搜到的公司与输入是同一家：名称 + 国家至少两项匹配；不一致就按“未找到”处理，不要硬写。
- 找不到公开信息：写通用但不出错的版本，不要编造公司业务、认证、进口记录、联系人。
- **美国 / 美属地区直接跳过，不搜索**：国家为美国、美国本土、USA、United States、波多黎各、关岛、美属萨摩亚、美属维尔京群岛、北马里亚纳群岛等。
  - `subject` 写 `SKIP`
  - `body` 写 `US/US territory - out of scope`
  - `english_subject` 写 `SKIP`
  - `english_body` 写 `US/US territory - out of scope`
  - `chinese` 写 `美国/美属，不在开发范围，已跳过`
  - `sources` 填 `["https://crm.xiaoman.cn/"]`
- 如果输入国家为空，但搜索后发现是美国/美属：立刻停止，按上面的 `SKIP` 处理。

## 营销信写法

### 语言模式

- **`full`（拉美西语、巴西/葡萄牙葡语）**
  - `subject` 用客户语言；
  - `body` 第一行固定 `Dear,`，从第二行起全文用客户语言；
  - 产品名、规格、认证保留英文（如 `profile.products` 里的英文名、认证缩写、“OEM”）；
  - 中文翻译要翻译整封邮件。
- **`mixed`（欧洲、中东、俄罗斯、日韩、东南亚等）**
  - `subject` 用客户语言；
  - `body` 第一行固定 `Dear,`；第二句个性化开场用客户语言；其余正文用英文；
  - 不要再写本地语称呼，也不要写成“本地语一句 + 英文重复一遍”；
  - 中文翻译要覆盖本地语开场和英文正文。
- **`english`**
  - `subject`、`body` 全英文，第一行固定 `Dear,`；
  - `english_subject` / `english_body` 与它们相同。

### 内容结构

**格式硬性要求（所有语言、所有模式都必须遵守）：**

- 第一行只能写 **`Dear,`**（Dear 加逗号，后面不写任何姓名、职位、先生/女士）。禁止 `Dear Adarsh,`、`Dear Tang,`、`Dear Mr. ...`。
- 最后两行只能写：
  ```
  Best regards,
  [Your Name]
  ```
  签名固定为占位符 **`[Your Name]`**；不要替换成任何真实姓名，也不要写联系人姓名。
- 客户语言只影响主题和正文中间部分，开头/结尾固定用上面的英文格式。

1. 第一行：固定 `Dear,`。
2. 一句个性化开场：只写搜索能证明的事实（业务 / 渠道 / 市场），不要编；不要在开场里叫联系人名字。
3. 一句我们是谁：用 `profile` 里的公司名 / 品牌 / 产品线，OEM / 自有品牌。
4. 一句为什么找对方：和市场 / 渠道的相关性。
5. 轻 CTA：问是否愿意收目录 / 规格表，或问对方常采购的规格 / 尺寸。
6. 结尾：固定 `Best regards,` + 下一行 `[Your Name]`。

- **Subject**：5–9 个词左右，具体、克制；不用 `cheap`、`best price`、`urgent`、全大写、感叹号。
- **Body**：约 90–130 个英文词对应长度；`full` 用客户语言写同等长度。
- 不写具体产品推荐、不写价格 / MOQ / 交期、不写“最低价”。
- `customerType` / `purchaseIntent` / `productGroup` / `annualPurchase` 只用来判断语气和切入点；**不要把年采购额、内部字段或敏感数字写进邮件**。
- `shortName` 只在公司全名太长、正文需要简称时用；不确定就不用。
- `owner` / `edmAt` / `lastEmailAt` / `createdAt` / `customerNo` 只用于判断，不写进邮件。
- 语气：专业、简短、像真人，不像群发广告。
- 阿拉伯语注意从右到左书写；日语/韩语用正式商务语气。
- 中文翻译的签名保留 `[Your Name]`，不要替换成真实姓名。

## 输出

只修改 `营销信填写.json` 里每家的这些字段：

- `subject`：客户语言主题
- `body`：客户语言正文（第一行固定 `Dear,`；`mixed` 模式是本地语开场 + 英文正文）
- `english_subject`：英文留底主题
- `english_body`：英文留底全文（`english` 模式可与 `subject`/`body` 相同）
- `chinese`：对实际 `subject`/`body` 的中文翻译
- `sources`：1–2 个实际用到的 http/https URL；找不到可留空

不要改 `name`、`country`、`contact`、`tags`、`key`、`companyId`、`language`、`languageName`、`mode`；不要新建/修改 HTML / JS；不要运行任何命令。

全部填完后，只回复一行：`FILLED <数量>`。
