import {
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Music,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

type UpdateCategory = "feature" | "improvement" | "fix";

type ProductUpdate = {
  date: string;
  title: string;
  summary: string;
  items: Array<{
    category: UpdateCategory;
    title: string;
    description: string;
  }>;
};

const categoryMeta: Record<UpdateCategory, { label: string; icon: typeof Sparkles }> = {
  feature: { label: "新功能", icon: Sparkles },
  improvement: { label: "体验改进", icon: Gauge },
  fix: { label: "问题修复", icon: Wrench },
};

const productUpdates: ProductUpdate[] = [
  {
    date: "2026-08-10",
    title: "音乐主题视觉更新",
    summary: "在保持信息密度与简约布局的基础上，加入更接近音乐会节目册的色彩、字体层次和克制音乐纹样。",
    items: [
      { category: "improvement", title: "节目册式视觉层次", description: "统一墨绿、酒红、纸张白和铜色点缀，强化标题、分隔线、选中状态与详情阅读层级。" },
      { category: "improvement", title: "音乐元素", description: "在封面、筛选、演出卡片、详情和知识库中加入低透明度谱线、音符与乐器图案，避免装饰遮挡信息。" },
      { category: "fix", title: "窄屏适配", description: "手机端压缩装饰尺寸和透明度，顶部导航保持单行，登录面板与更新日志不产生横向溢出。" },
    ],
  },
  {
    date: "2026-08-10",
    title: "用户账号与审核权限",
    summary: "接入独立身份服务，为每位用户的个人数据同步建立账号边界，并先收紧审核工作台访问权限。",
    items: [
      { category: "feature", title: "邮箱免密码登录", description: "新增邮箱登录、会话恢复、账号状态和退出登录；Supabase 客户端按需加载，不增加首页主包体积。" },
      { category: "feature", title: "管理员角色", description: "用户资料与管理员角色分表保存并启用 RLS，普通用户不能读取他人资料或修改自己的角色。" },
      { category: "fix", title: "审核入口收紧", description: "审核入口只向管理员显示，直接访问审核地址仍会检查登录状态和后端角色；正式站点继续关闭尚无远程写入接口的审核操作。" },
      { category: "improvement", title: "部署与后端自检", description: "GitHub Pages 构建支持公开 Supabase 变量，并增加账号表、匿名隔离和管理员函数权限的一键检查。" },
    ],
  },
  {
    date: "2026-08-09",
    title: "来源覆盖与节目单质量",
    summary: "扩充场馆来源展示和换季发现能力，并集中清理节目单中的注释、正文与人员误判。",
    items: [
      { category: "feature", title: "乐团与场馆资料页", description: "数据来源改为乐团、场馆两个视图，以真实封面展示场次数、详细介绍和官网入口。" },
      { category: "feature", title: "哈尔滨音乐厅", description: "接入经确认的麦座项目详情，当前保守收录 3 场演出，不通过连续编号猜测项目。" },
      { category: "improvement", title: "换季自动发现", description: "苏州、广州和深圳等来源会动态发现当前乐季栏目与分页，降低官网换季后采集归零的风险。" },
      { category: "feature", title: "原始节目单图片", description: "正文与 OCR 信息仍不足时，详情页可按需展开官网原图核对；已有可信文字节目单时不会显示。" },
      { category: "fix", title: "注释不再充当曲目", description: "国家大剧院、星海音乐厅和深圳音乐厅分别排除注释、介绍正文、推荐演出、演出及伴奏人员。" },
      { category: "fix", title: "作品编号与场馆层级", description: "编号不同的相似作品不再误合并；星海演出标题去除重复场馆名，地点统一显示场馆与具体厅堂。" },
    ],
  },
  {
    date: "2026-08-09",
    title: "知识库进入分层浏览",
    summary: "作品知识从平铺目录升级为以音乐史、作曲家和体裁组织的独立内容体系。",
    items: [
      { category: "feature", title: "探索、作曲家与作品", description: "知识库新增三个视图，首页连接近期现场、入门作品、音乐史时期和体裁大类。" },
      { category: "feature", title: "自动扩充作品知识", description: "高质量官网出现陌生作品时，自动检索证据、补建作曲家、调用 DeepSeek 整理并经过规则审计后发布。" },
      { category: "improvement", title: "标准分类体系", description: "所有作品和作曲家统一获得稳定的时期和体裁大类，筛选状态可以通过 URL 恢复。" },
      { category: "improvement", title: "更可靠的录音入口", description: "录音建议优先打开经过核实的直接来源，同时保留 B 站搜索，不再提供效果不稳定的流媒体搜索入口。" },
      { category: "feature", title: "真实演出精选", description: "知识库新增精选视图，专题仅由已映射作品和当前未来演出生成，并支持城市、日期范围与稳定链接。" },
      { category: "feature", title: "听前摘要与知识关注", description: "演出节目单展示作品摘要、时长和标签；作品页补充相关作品，作品与作曲家可直接加入关注。" },
    ],
  },
  {
    date: "2026-08-06",
    title: "移动端与发布稳定性",
    summary: "集中修复首次打开、分享链接、缓存和 GitHub Pages 部署中的可靠性问题。",
    items: [
      { category: "fix", title: "手机首次打开", description: "直接访问项目地址时默认进入演出主页，不再出现空白页或意外打开第一场详情。" },
      { category: "fix", title: "分享卡片跳转", description: "卡片二维码现在携带具体演出 ID，扫码后直接进入对应详情。" },
      { category: "improvement", title: "加载与失败重试", description: "静态资源采用更有效的缓存策略，采集请求失败后会等待一分钟再重试。" },
      { category: "fix", title: "Pages 部署恢复", description: "调整部署并发和超时策略，避免发布任务长期卡在等待状态。" },
    ],
  },
  {
    date: "2026-08-05",
    title: "发现、关注与分享流程",
    summary: "Demo 从单纯浏览演出扩展到关注变化、个人标记和对外分享。",
    items: [
      { category: "feature", title: "关注与消息", description: "可以关注音乐家、作品、乐团和场馆，相关演出变化进入站内消息中心并保留历史。" },
      { category: "feature", title: "个人演出标记", description: "支持“想去”和“已去”，并可以按个人状态筛选演出。" },
      { category: "feature", title: "分享卡片", description: "生成包含时间、地点、票价、人物、乐团、曲目和购票二维码的图片并复制到剪贴板。" },
      { category: "improvement", title: "变化降噪", description: "标点、空格、括号和 OCR 排版差异不再被误判为真实曲目变化。" },
    ],
  },
  {
    date: "2026-08-03",
    title: "全国来源与完整变化历史",
    summary: "演出范围从长三角扩展至全国主要城市，并开始长期保存每一次数据变化。",
    items: [
      { category: "feature", title: "全国演出来源", description: "接入北京、广州、深圳、西安、杭州等城市的主要乐团和音乐厅官网。" },
      { category: "feature", title: "变化前后对照", description: "新增、下架、改期、取消、换人、换曲和票价变化均可查看修改前后的具体内容。" },
      { category: "improvement", title: "跨来源去重", description: "同一场演出来自乐团和场馆官网时合并展示，并保留全部来源与购票链接。" },
    ],
  },
  {
    date: "2026-07-29",
    title: "自动采集与 OCR 审核",
    summary: "建立按官网隔离的采集适配器、图片节目单 OCR 和人工复核工作台。",
    items: [
      { category: "feature", title: "官网独立解析", description: "每个乐团和场馆使用独立适配器，避免不同网站的节目单规则相互污染。" },
      { category: "feature", title: "按需 OCR", description: "仅在正文未提取到曲目且页面含图片时执行 OCR，结果进入待审核队列。" },
      { category: "feature", title: "数据审核页", description: "支持查看官网原图、OCR 原文并逐首修改曲名、作曲家、作品号和外文标题。" },
      { category: "improvement", title: "中国时区与采集容错", description: "统一中国时间标签，并在来源短暂失败时沿用上一版有效数据。" },
    ],
  },
  {
    date: "2026-07-23",
    title: "上海演出日历 Demo",
    summary: "项目建立第一条可运行链路，从上海交响乐团官网采集演出并在本地展示。",
    items: [
      { category: "feature", title: "演出列表与详情", description: "支持按日期浏览演出，查看节目单、人物、场馆、票价和官网链接。" },
      { category: "feature", title: "搜索与筛选", description: "可以按日期、乐团、曲目、音乐家和场馆查找演出。" },
      { category: "feature", title: "日历视图", description: "以月历展示每天的音乐会，并支持展开演出密集的日期。" },
    ],
  },
];

export default function UpdatesWorkspace() {
  const itemCount = productUpdates.reduce((total, update) => total + update.items.length, 0);
  return (
    <main className="updates-workspace">
      <header className="app-header source-page-header">
        <div className="brand-block">
          <Music size={22} />
          <div><strong>古典乐演出日历</strong><span>更新日志</span></div>
        </div>
        <a className="header-link" href={import.meta.env.BASE_URL} title="返回演出日历" aria-label="返回演出日历">
          <ArrowLeft size={15} />
          返回演出日历
        </a>
      </header>

      <section className="updates-page">
        <header className="updates-intro">
          <div>
            <span>PRODUCT UPDATES</span>
            <h1>更新日志</h1>
            <p>记录网站功能、交互体验和数据能力的主要变化。</p>
          </div>
          <dl>
            <div><dt>开始于</dt><dd>07/23</dd></div>
            <div><dt>主要更新</dt><dd>{productUpdates.length}</dd></div>
            <div><dt>改动项目</dt><dd>{itemCount}</dd></div>
          </dl>
        </header>

        <div className="updates-summary">
          <BookOpenText size={18} />
          <div><strong>产品更新与演出变化分别记录</strong><span>这里记录网站本身的版本；演出改期、换人、换曲和票价调整仍在“变化历史”中查询。</span></div>
          <a href="?changes=1">查看变化历史</a>
        </div>

        <div className="updates-timeline">
          {productUpdates.map((update, index) => <UpdateRelease key={`${update.date}-${update.title}`} update={update} latest={index === 0} />)}
        </div>

        <footer className="updates-footer">
          <ShieldCheck size={17} />
          <span>每次正式发布后更新；采集数据的自动变化不会重复写入此页。</span>
        </footer>
      </section>
    </main>
  );
}

function UpdateRelease({ update, latest }: { update: ProductUpdate; latest: boolean }) {
  return <article className={`updates-release${latest ? " latest" : ""}`}>
    <div className="updates-date">
      <CalendarDays size={15} />
      <time dateTime={update.date}>{formatDate(update.date)}</time>
      {latest ? <span><CheckCircle2 size={12} />最新</span> : null}
    </div>
    <div className="updates-release-body">
      <header><h2>{update.title}</h2><p>{update.summary}</p></header>
      <div className="updates-items">
        {update.items.map((item) => {
          const meta = categoryMeta[item.category];
          const Icon = meta.icon;
          return <section key={`${item.category}-${item.title}`} className={`updates-item ${item.category}`}>
            <div><Icon size={14} /><span>{meta.label}</span></div>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </section>;
        })}
      </div>
    </div>
  </article>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${value}T12:00:00+08:00`));
}
