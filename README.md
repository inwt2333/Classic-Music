# 上海古典乐历 Demo

一个本地可运行的上海古典音乐演出检索 demo。当前版本包含：

- React/Vite 前端页面
- 本地 JSON 数据文件
- 自动采集脚本
- 上海交响乐团官网 API adapter
- DeepSeek API 结构化抽取预留

## 本地运行

安装依赖后：

```bash
npm run scrape
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

## 数据采集

来源配置在：

```text
sources/shanghai.sources.json
```

运行采集：

```bash
npm run scrape
```

采集结果会写入：

```text
public/data/events.json
```

如果要启用 DeepSeek 兜底抽取，复制 `.env.example` 为 `.env`，填入：

```text
DEEPSEEK_API_KEY=你的 key
DEEPSEEK_MODEL=deepseek-chat
```

然后运行：

```bash
npm run scrape:ai
```

当前上交官网已直接解析官方详情页节目单。DeepSeek 主要作为格式异常、正文复杂或非官方来源缺少结构化字段时的兜底抽取。

## 已接入来源

- 上海交响乐团官网：通过官方列表接口发现 `programId`，再逐个抓取详情接口，解析 `programInfo` 和 `castList`。
- 票价通过官网 `getTicketPriceList` 接口单独采集；详情接口中的 `minPrice/maxPrice` 经常为空，不能作为唯一票价来源。
- 每个官网使用独立的 `scripts/adapters/<site>.ts` 适配器，页面区块、节目单、简介、演员和票价格式不得跨站混用。

LocalHub 暂不作为正式数据源使用：它适合发现演出线索，但缺少稳定详情页和节目单，容易拉低 demo 的曲目质量。后续优先接各音乐厅、乐团、票务/主办方官网。
