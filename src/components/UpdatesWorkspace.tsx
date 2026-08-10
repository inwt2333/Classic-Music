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
import BrandLogo from "./BrandLogo";

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
    title: "正式版上线检查",
    summary: "完成全站桌面与手机端复验，整理面向用户的页面信息，并刷新全国演出数据。",
    items: [
      { category: "improvement", title: "页面信息精简", description: "详情、来源和作品页不再显示解析方式、模型评分、采集批次等内部信息，只保留更新时间、官网来源和必要的完整性提示。" },
      { category: "fix", title: "加载与可访问性", description: "静态数据短暂失败时自动重试，首页加载过程不再误报无演出；桌面详情侧栏与手机全屏详情使用正确的交互语义。" },
      { category: "fix", title: "双语节目单", description: "星海音乐厅双语曲目合并为中文标题与外文名，影片分段标题不再被当作独立曲目。" },
      { category: "fix", title: "深圳音乐厅节目单", description: "协奏曲乐章会归入所属作品，带“协奏曲”的标题不再被误判为署名；演出人员也按角色正确提取。" },
      { category: "fix", title: "复杂节目单层级", description: "修复国家大剧院多部套曲的作品与分曲归属、深圳音乐厅纯文本及组曲列表，并校正东方艺术中心海报中的曲名和作者。" },
      { category: "fix", title: "节目单边界", description: "民族乐器演奏者、上下半场标题和作曲家分组不再被识别为曲目。" },
      { category: "improvement", title: "变化历史降噪", description: "曲目和演出人员仍随官网刷新，但不再写入变化历史或关注消息，避免 OCR 与官网排版波动造成误报。" },
      { category: "improvement", title: "全新品牌标识", description: "首页顶栏、浏览器标签和移动设备图标统一使用融合琴弦、日历与场馆轮廓的新标识。" },
      { category: "feature", title: "独立个人页", description: "账户资料、关注分类、想去与已购演出、筛选方案集中到个人页；主页关注入口改为纯消息提醒。" },
      { category: "feature", title: "已购演出长期保留", description: "“已去”统一改为“已购”；标记时保存演出快照，即使音乐会过期并退出首页列表，仍会在个人页作为历史记录显示。" },
      { category: "feature", title: "个人数据跨设备同步", description: "想去、已购与演出快照、关注、提醒历史和已读/删除状态、保存筛选迁移到 Supabase 私有表；旧本机数据首次登录自动合并，离线修改恢复连接后补交。" },
      { category: "feature", title: "管理员中心", description: "管理员可从个人页进入数据审核工作台，审核页继续通过后端角色验证限制访问。" },
      { category: "improvement", title: "最新演出数据", description: "重新检查全部 18 个来源并更新演出快照，数据审计无错误和警告。" },
    ],
  },
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
    title: "密码账号与个人功能边界",
    summary: "将邮件链接登录升级为邮箱密码账号，并让关注、观演记录与筛选方案真正归属于登录用户。",
    items: [
      { category: "feature", title: "邮箱密码账号", description: "注册时填写用户名、邮箱和密码后立即创建账号；之后可直接在网站登录，不再为注册和日常登录发送邮件。" },
      { category: "feature", title: "密码管理", description: "新增忘记密码邮件、站内设置新密码和登录后的修改密码入口；验证与重置回调失败会直接显示原因。" },
      { category: "feature", title: "个人功能需登录", description: "关注、想去、已购、更新提醒和保存筛选统一增加登录门槛，并通过 RLS 按用户 ID 隔离云端数据。" },
      { category: "feature", title: "管理员角色", description: "用户资料与管理员角色分表保存并启用 RLS，普通用户不能读取他人资料或修改自己的角色。" },
      { category: "fix", title: "审核入口收紧", description: "审核入口只向管理员显示，直接访问审核地址仍会检查登录状态和后端角色；正式站点继续关闭尚无远程写入接口的审核操作。" },
      { category: "improvement", title: "部署与后端自检", description: "GitHub Pages 构建支持公开 Supabase 变量，并增加账号、个人数据表、匿名隔离和管理员函数权限的一键检查。" },
      { category: "fix", title: "手机首页不再误开详情", description: "没有 event 参数时保持未选择状态，详情只由分享链接或用户点击打开，不再在数据载入后默认选中第一场。" },
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
    summary: "网站从单纯浏览演出扩展到关注变化、个人标记和对外分享。",
    items: [
      { category: "feature", title: "关注与消息", description: "可以关注音乐家、作品、乐团和场馆，相关演出变化进入站内消息中心并保留历史。" },
      { category: "feature", title: "个人演出标记", description: "支持“想去”和“已购”，并可以按个人状态筛选演出。" },
      { category: "feature", title: "分享卡片", description: "生成包含时间、地点、票价、人物、乐团、曲目和购票二维码的图片并复制到剪贴板。" },
      { category: "improvement", title: "变化降噪", description: "标点、空格和括号等排版差异会在变化比较前统一处理。" },
    ],
  },
  {
    date: "2026-08-03",
    title: "全国来源与完整变化历史",
    summary: "演出范围从长三角扩展至全国主要城市，并开始长期保存每一次数据变化。",
    items: [
      { category: "feature", title: "全国演出来源", description: "接入北京、广州、深圳、西安、杭州等城市的主要乐团和音乐厅官网。" },
      { category: "feature", title: "变化前后对照", description: "新增、下架、改期、取消、换人和票价变化可查看修改前后的具体内容。" },
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
    title: "上海演出日历上线",
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
          <BrandLogo />
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
          <div><strong>产品更新与演出变化分别记录</strong><span>这里记录网站本身的版本；演出改期、换人和票价调整仍在“变化历史”中查询。</span></div>
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
