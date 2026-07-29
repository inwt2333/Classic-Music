# 古典乐演出日历 Demo

一个聚合城市古典音乐演出的本地 Demo。当前以上海为主要范围，并接入苏州交响乐团作为跨城市来源验证；项目从场馆和乐团官网自动采集演出数据，按统一结构展示列表、日历、节目单、票价、简介和外部检索入口。

当前重点是验证三件事：

1. 不依赖人工录入，能否稳定采集不同官网的数据。
2. 能否正确区分作品、乐章、人物、场馆与厅堂。
3. 数据能否支持按日期、场馆、曲目和音乐家检索。

完整开发计划见 [TODO.md](./TODO.md)。

## 在线 Demo

- GitHub Pages：<https://inwt2333.github.io/Classic-Music/>
- 数据由 GitHub Actions 每天自动采集三次；任何来源采集失败或数据审计失败时，不会覆盖上一版线上数据。

首次部署前，需要在仓库 `Settings > Pages` 中将 Source 设为 **GitHub Actions**。此后推送到 `main`、手动触发工作流或定时任务都会执行测试、采集、审计和部署。

## 当前能力

### 前台

- 演出列表和月历视图。
- 支持本周、周末和本月快速筛选，所有快速筛选都可再次点击取消。
- 支持城市、场馆、乐团、演出类型和是否有节目单的组合筛选。
- 搜索标题、曲目、作曲家、人物、乐团和场馆；筛选与当前选中项目同步到 URL。
- 展示场馆与具体厅堂，避免把“东方艺术中心”和“东方音乐厅”等层级混淆。
- 列表直接展示核心曲目、主要人物、票价和售票状态。
- 展示完整节目单，并把大作品下的乐章保留在同一作品中。
- 展示票价档位、演出简介、指挥、演奏者和数据来源。
- 点击作品或人物进入实体视图，查看相关演出。
- 从曲目跳转到网易云音乐、QQ 音乐、B 站、IMSLP、MusicBrainz 和中文资料搜索。
- 桌面端筛选栏、列表和详情栏独立滚动；移动端使用筛选抽屉和全屏详情。
- 首页只读取轻量索引，详情按需加载；日历代码按视图懒加载。

### 数据采集

- 每个官网使用独立 adapter，禁止跨站复用页面区块识别规则。
- 优先调用官网公开接口，保存列表、详情和票价原始 JSON 快照。
- 回归测试所需的最小真实响应 fixture 提交在 `scripts/fixtures/`，测试不依赖本机采集缓存。
- 上海东方艺术中心支持多种节目单排版以及按演出日期分组的节目。
- 上海音乐厅支持编号、双语、作曲者分组、词曲/改编说明和同名不同作品号曲目。
- 苏州交响乐团支持乐季、特别策划等栏目，以及一页多日期、多时间场次。
- 纯图片节目单可使用本地 Tesseract.js OCR，不需要付费 API。
- DeepSeek API 已接入为实验性兜底，但默认不启用。
- 采集结果支持保守的跨来源合并、稳定 ID、排序和数据质量审计。
- 每次采集输出新增、下架、延期、取消、换人、换曲和票价变化；来源失败不会被误判为下架。

## 当前数据

仓库中的数据快照生成于 `2026-07-29`：

| 来源 | 演出数 | 采集方式 |
| --- | ---: | --- |
| 上海交响乐团官网 | 81 | 官方列表、详情和票价 API |
| 上海东方艺术中心官网 | 64 | 官方项目、详情和场次 API |
| 凯迪拉克·上海音乐厅官网 | 10 | 官方月份列表和项目详情 API |
| 苏州交响乐团官网 | 23 | 官方栏目分页 API，页面展开多场次 |
| 合计 | 178 | 0 个数据审计错误或警告 |

这只是仓库当前快照，运行采集脚本后数量会随官网数据变化。

## 技术栈

- React 19 + TypeScript + Vite
- Node.js 22.14+
- Cheerio
- Zod
- Tesseract.js
- Node.js 内置 SQLite
- GitHub Actions + GitHub Pages

采集后的标准化数据写入本地 SQLite，随后导出适合静态托管的 JSON。前端不需要常驻后端：

| 文件 | 用途 |
| --- | --- |
| `data/classic-music.db` | 本地完整关系数据与审核记录，不提交 Git |
| `public/data/events-index.json` | 首页轻量索引 |
| `public/data/events/{id}.json` | 单场演出详情，按需请求 |
| `public/data/entities.json` | 作品和人物关联索引 |
| `public/data/changes.json` | 最近一次采集的结构化变更 |
| `public/data/events.json` | 完整兼容数据集和下一次变更比较基线 |

## 快速开始

安装依赖：

```bash
npm install
```

直接使用仓库中的数据启动前端：

```bash
npm run dev
```

打开 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)。

重新采集数据并启动：

```bash
npm run scrape
npm run dev
```

采集需要能够访问对应官网。采集失败不会阻止其他来源继续执行，错误会记录到结果文件的 `stats.errors`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | TypeScript 检查并构建前端 |
| `npm run scrape` | 使用规则解析器采集全部已配置来源 |
| `npm run scrape:ocr` | 对缺少文字节目单的东方艺术中心项目启用本地 OCR |
| `npm run scrape:ai` | 启用实验性的 DeepSeek 结构化兜底 |
| `npm run test:parser` | 运行四个站点 adapter 的回归测试 |
| `npm run test:data` | 测试跨来源合并、稳定 ID 和变更检测 |
| `npm run audit:data` | 检查重复演出、节目单、人物和票价异常 |
| `npm run audit:data:ci` | 严格检查所有来源，任一来源失败则退出 |
| `npm run audit:data:deploy` | 部署审计；仅允许有上一版数据可恢复的来源失败 |
| `npm run audit:storage` | 校验 SQLite、索引、实体和详情导出的一致性 |

建议在提交采集或解析相关修改前运行：

```bash
npm run test:parser
npm run test:data
npm run scrape
npm run audit:data:ci
npm run audit:storage
npm run build
```

## 采集流程

```text
sources/shanghai.sources.json
        |
        v
scripts/scrape.ts
        |
        +-- scripts/adapters/shanghai-symphony.ts
        +-- scripts/adapters/shanghai-oriental-art-center.ts
        +-- scripts/adapters/shanghai-concert-hall.ts
        +-- scripts/adapters/suzhou-symphony.ts
        |
        +-- data/snapshots/        原始响应快照，不提交
        +-- data/ocr-cache/        OCR 模型与识别缓存，不提交
        |
        v
scripts/data-store.ts
        |
        +-- data/classic-music.db
        +-- public/data/events-index.json
        +-- public/data/events/{id}.json
        +-- public/data/entities.json
        +-- public/data/changes.json
        +-- public/data/events.json
        |
        v
React 前端（静态托管）
```

来源配置位于 `sources/shanghai.sources.json`。新增来源时，应增加独立 adapter、配置类型和真实页面回归测试，不应把上海交响乐团或东方艺术中心的节目单规则直接用于其他网站。

统一数据结构定义在 `src/types.ts`。SQLite 将来源记录、演出、场次、场馆、人物、组织、作品、节目单、票价、字段观察和审核项拆分存储；静态导出仍保留前端需要的聚合结构。

- 标题、日期、时间、城市、场馆和厅堂。
- 票价、状态、购票链接、来源链接和采集时间。
- 乐团、指挥、演奏者、作曲家和标签。
- 作品、作品号、乐章以及字段置信度。
- 数据质量状态：`scraped`、`ai-enhanced` 或 `needs-review`。

## OCR

对于节目单只存在于图片中的东方艺术中心页面：

```bash
npm run scrape:ocr
```

首次运行会下载 Tesseract `chi_sim` 模型，之后复用 `data/ocr-cache/`。可以在 `.env` 中配置：

```text
SHOAC_OCR_MAX_IMAGES=8
SHOAC_OCR_PROJECT_IDS=
```

- `SHOAC_OCR_MAX_IMAGES`：每个项目最多识别的详情图片数。
- `SHOAC_OCR_PROJECT_IDS`：只调试指定项目，多个 ID 使用英文逗号分隔；留空时自动处理缺少文字节目单的项目。

OCR 结果仍需经过东方艺术中心专用解析器。低质量图片可能产生 `needs-review` 数据，不应把 OCR 文本直接视为官方节目单。

## DeepSeek

复制 `.env.example` 为 `.env`，填写：

```text
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-chat
```

然后运行：

```bash
npm run scrape:ai
```

当前 DeepSeek 集成只根据标题和场馆生成候选节目单，属于实验性能力；它还没有完整的响应 Schema 校验、置信度门槛和人工审核流程。正式数据应优先使用官网字段和站点专用规则解析器。

## 已接入来源

### 上海交响乐团

- 从官方列表 API 发现全部 `programId`，不依赖猜测连续 ID。
- 分别请求详情和票价接口。
- 只解析官网“曲目”区块，并区分作品与作品下属乐章。
- 从详情正文中提取演出简介、演员和场馆信息。

### 上海东方艺术中心

- 从官方项目接口获取项目、详情和场次。
- 支持“曲目”“节目单”等标题变体、双语重复、编号曲目、词曲作者行和纯英文曲目。
- 支持同一项目按日期提供不同节目单。
- 支持文字节目单优先、图片 OCR 兜底。
- 场馆统一记录为“上海东方艺术中心”，厅堂单独记录为“东方音乐厅”“东方歌剧厅”等。

### 凯迪拉克·上海音乐厅

- 从官方月份列表接口发现项目，再请求项目详情；不枚举连续 ID。
- 根据每个 `eventDTO` 生成独立场次，并读取票价档位、销售状态和厅堂。
- 支持双语重复、编号曲目、作曲家标题、选集分组以及原曲/作曲/改编说明。
- 官网 HTTPS 证书在 `2026-07-29` 已过期，因此只读 API 暂时通过 HTTP 请求；对外来源和购票链接仍使用 HTTPS，采集请求不携带凭据。

### 苏州交响乐团

- 分别采集当前乐季、特别策划等官方栏目，并按分页结果发现详情。
- 从详情正文读取日期、时间、场馆、人物、节目单和简介。
- 同一页面包含多个日期或同日多个时间时，展开成独立演出场次。
- 官网个别场馆字段存在误填时，以详情正文中的“苏州文化艺术中心 / 金鸡湖音乐厅”为校验和回退依据。

LocalHub 已退出正式数据源。它可以用于发现演出线索，但缺少稳定详情页和节目单，不应作为正式节目单来源。

## 自动部署

工作流位于 `.github/workflows/deploy-pages.yml`，执行顺序固定为：

1. 安装锁定依赖并运行 adapter、存储层测试。
2. 下载当前线上完整数据作为变更比较基线。
3. 从四个官网重新采集。
4. 运行数据审计和 SQLite/静态导出一致性审计；失败来源必须有上一版数据可恢复，否则停止部署。
5. 使用 `/Classic-Music/` 基路径构建并部署到 GitHub Pages。

本地验证 Pages 构建：

```bash
$env:VITE_BASE_PATH="/Classic-Music/"
npm run build
```

GitHub Pages 适合当前无登录、以读取为主的 Demo。后续增加账号、收藏、审核后台或动态 API 时，再把这些服务迁移到 Render/PostgreSQL；静态前端仍可继续留在 Pages。

## 已知限制

- 目前有四个正式来源，其中上海三个、苏州一个；上海尚未达到 5-8 个来源目标。
- 苏州当前公开的 `2025-26` 乐季页面主要是历史场次，前台会把未来演出优先、历史演出倒序展示。
- 当前跨来源合并采用高置信度保守规则；不确定候选尚无管理界面。
- 作品和人物已有稳定实体 ID 与关联索引，但别名仍不完整，例如“贝五”“柴小协”和不同中文译名。
- 定时采集已部署，尚未接入邮件或即时通讯失败告警。
- SQLite 目前是构建期数据仓库，线上没有动态 API、账号或写入能力。
- DeepSeek 兜底尚不满足无人审核直接入库的要求。

下一阶段的具体优先级记录在 [TODO.md](./TODO.md)。
