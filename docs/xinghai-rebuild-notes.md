# 星海音乐厅适配器重建调查笔记（2026-08-27）

旧入口 `concerthall.com.cn/events/newindex.php` 已永久下线，官网整体迁移为 Vue 3 SPA。以下是本轮静态调查的结论，供下次重建 adapter 时直接使用。

## 新站结构

- 门户首页：`https://www.concerthall.com.cn/` → 301 → `https://www.concerthall.com.cn/xinghaiconcert/index.html`
- 主 bundle：`/xinghaiconcert/static/index-3eb59cf4.js`（约 1.2MB，含 axios、element-plus、路由与全部 service 封装）
- 路由（SPA 内部路径）：
  - `/` 首页（chunk `index-15f35ad3.js`，banner 数据 key：`PChome_i1`、`H5banner`、`CONCERT`）
  - `/ticket/list` 演出列表（chunk `ticket-cf76d270.js` → `index-56082fa8.js` → `index-73e32a20.js`）
  - `/ticket/detail`、`/program`（chunk `program-58fe4676.js`）、`/package/list`、`/member/*`、`/mall/*` 等
- 营销统计：talkingdata `jic.talkingdata.com/app/h5/v1?appid=A180E27495144B...`

## 数据形态（重要线索）

订单/支付 chunk（`index-1318e109.js`）中的 program 对象字段与上海交响乐团的 thvendor 票务平台高度一致：
`fullCnName`、`verticalPoster`、`venueName`、`stadiumName`、`programId`、`scheduleId`、`advanceTime`、`schedule_begin_sale`。
强烈怀疑星海新票务系统与上交使用同一套底层（thvendor 系），值得尝试以下 thvendor 风格端点（本轮未验证）：

```
POST /thvendor/program/homeProgramList.xhtml   { showSite: "pcList", pageNo, pageSize, dynamicValueList: "[]" }
POST /thvendor/program/getById.xhtml           { id }
```
（上交真实路径为 `https://shsymphony.cn/thvendor/symphony/program/homeProgramList.xhtml`，星海侧可能缺少 `/symphony` 段或换成其他租户名。）

## 已排除的路径

以下均已试探返回 404（2026-08-27）：

- `/xinghaiconcert/api/program/list`、`/xinghaiconcert/api/ticket/list`、`/xinghaiconcert/api/home`
- `/xinghaiconcert/gateway/program/list`、`/xinghaiconcert/prod-api/ticket/list`
- `/api/program/list`、`/xinghaiconcert/ticket/list`（GET）

## 为什么静态分析没有直接拿到端点

主 bundle 中的 axios 实例为 `Gu.create({})`（无 baseURL），请求路径在 service 层通过变量拼接（未出现 `"url:"` 字面量或模板字符串 URL），且业务 service 函数以单字母导出、分散在懒加载 chunk 中。**推荐下一步**：用浏览器开发者工具（或 headless 抓包）直接打开 `https://www.concerthall.com.cn/xinghaiconcert/index.html#/ticket/list`，记录 XHR 的真实 URL 与请求体，一次即可定位；拿到端点后参照 `scripts/adapters/shanghai-symphony` 的 thvendor 解析逻辑建 adapter。

## 过渡期策略

- 旧事件由 `restoreFailedSourceEvents` 保留展示（当前 10 场）。
- 每日 20:00 自动审阅与 source-canary 工作流会持续标记该源失败，重建后自动恢复。
