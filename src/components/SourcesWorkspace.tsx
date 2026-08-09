import { ArrowLeft, Building2, Check, CircleAlert, ExternalLink, MapPin, Music } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadEventIndex } from "../data";
import { sourceCoverUrl, sourceProfiles, type SourceProfile } from "../source-profiles";
import type { ConcertIndexDataset } from "../types";

type SourceStatus = ConcertIndexDataset["sources"][number];

export default function SourcesWorkspace() {
  const [dataset, setDataset] = useState<ConcertIndexDataset>();
  const [error, setError] = useState("");
  const profileId = new URLSearchParams(window.location.search).get("sources");
  const activeProfile = profileId && !["1", "orchestras", "venues"].includes(profileId)
    ? sourceProfiles.find((profile) => profile.id === profileId)
    : undefined;
  const activeCategory: SourceProfile["category"] = profileId === "venues" ? "venue" : "orchestra";

  useEffect(() => {
    loadEventIndex().then(setDataset).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, []);

  const statuses = useMemo(
    () => new Map((dataset?.sources || []).map((source) => [source.id, source])),
    [dataset],
  );
  const successfulSources = dataset?.sources.filter((source) => source.ok).length ?? 0;

  return (
    <main className="source-workspace">
      <header className="app-header source-page-header">
        <div className="brand-block">
          <Music size={22} />
          <div><strong>古典乐演出日历</strong><span>数据来源</span></div>
        </div>
        <a className="header-link" href={activeProfile ? `?sources=${activeProfile.category === "venue" ? "venues" : "orchestras"}` : import.meta.env.BASE_URL} title={activeProfile ? "返回数据来源" : "返回演出日历"}>
          <ArrowLeft size={15} />
          {activeProfile ? "返回数据来源" : "返回演出日历"}
        </a>
      </header>

      <section className="source-page">
        {activeProfile ? (
          <SourceProfileDetail profile={activeProfile} source={statuses.get(activeProfile.sourceId)} loading={!dataset && !error} />
        ) : (
          <SourceDirectory
            dataset={dataset}
            error={error}
            statuses={statuses}
            successfulSources={successfulSources}
            activeCategory={activeCategory}
          />
        )}
      </section>
    </main>
  );
}

function SourceDirectory({
  dataset,
  error,
  statuses,
  successfulSources,
  activeCategory,
}: {
  dataset?: ConcertIndexDataset;
  error: string;
  statuses: Map<string, SourceStatus>;
  successfulSources: number;
  activeCategory: SourceProfile["category"];
}) {
  const activeProfiles = sourceProfiles.filter((profile) => profile.category === activeCategory);
  const activeSourceIds = new Set(activeProfiles.map((profile) => profile.sourceId));
  const activeEventCount = dataset?.sources.reduce(
    (total, source) => total + (activeSourceIds.has(source.id) ? source.eventCount : 0),
    0,
  ) ?? 0;

  return (
    <>
      <header className="source-page-intro">
        <div>
          <span>DATA SOURCES</span>
          <h1>数据来源</h1>
          <p>从乐团和场馆出发，查看本站当前覆盖范围与采集状态。</p>
        </div>
        {dataset ? (
          <dl>
            <div><dt>采集通道</dt><dd>{dataset.sources.length}</dd></div>
            <div><dt>采集正常</dt><dd>{successfulSources}</dd></div>
            <div><dt>本页演出</dt><dd>{activeEventCount}</dd></div>
          </dl>
        ) : null}
      </header>

      <nav className="source-directory-tabs" aria-label="数据来源类型">
        <a className={activeCategory === "orchestra" ? "active" : ""} href="?sources=orchestras">
          <Music size={17} />
          <span><strong>乐团</strong><small>{sourceProfiles.filter((profile) => profile.category === "orchestra").length} 个来源</small></span>
        </a>
        <a className={activeCategory === "venue" ? "active" : ""} href="?sources=venues">
          <Building2 size={17} />
          <span><strong>场馆</strong><small>{sourceProfiles.filter((profile) => profile.category === "venue").length} 个来源</small></span>
        </a>
      </nav>

      {error ? (
        <div className="source-page-error"><CircleAlert size={18} />数据来源加载失败：{error}</div>
      ) : dataset ? (
        <>
          <SourceGroup
            title={activeCategory === "orchestra" ? "乐团" : "场馆"}
            icon={activeCategory === "orchestra" ? <Music size={18} /> : <Building2 size={18} />}
            category={activeCategory}
            statuses={statuses}
          />
          <p className="source-updated">数据更新时间：{formatTimestamp(dataset.generatedAt)}</p>
        </>
      ) : (
        <div className="source-page-loading">正在加载数据来源</div>
      )}
    </>
  );
}

function SourceGroup({ title, icon, category, statuses }: {
  title: string;
  icon: ReactNode;
  category: SourceProfile["category"];
  statuses: Map<string, SourceStatus>;
}) {
  const profiles = sourceProfiles.filter((profile) => profile.category === category);
  return (
    <section className={`source-group ${category}`}>
      <header><span>{icon}</span><div><h2>{title}</h2><small>{profiles.length} 个已接入机构</small></div></header>
      <div className="source-card-list">
        {profiles.map((profile) => <SourceCard key={profile.id} profile={profile} source={statuses.get(profile.sourceId)} />)}
      </div>
    </section>
  );
}

function SourceCard({ profile, source }: { profile: SourceProfile; source?: SourceStatus }) {
  const displayedCount = source?.eventCount ?? 0;
  return (
    <article className="source-card">
      <a href={`?sources=${encodeURIComponent(profile.id)}`} aria-label={`查看${profile.name}介绍`}>
        <div className="source-card-cover" style={{ backgroundImage: `url("${sourceCoverUrl(profile.coverImage)}")`, backgroundPosition: profile.coverPosition }}>
          <span className={source?.ok ? "source-card-status ok" : "source-card-status warning"}>
            {source?.ok ? <Check size={12} /> : <CircleAlert size={12} />}
            {source?.ok ? "采集正常" : "待恢复"}
          </span>
          {profile.logoUrl
            ? <img className={profile.logoAppearance === "light" ? "source-logo-light" : undefined} src={profile.logoUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />
            : <span className="source-card-mark">{sourceMark(profile.name)}</span>}
        </div>
        <div className="source-card-body">
          <div><small>{profile.city}</small><h3>{profile.name}</h3><p>{profile.summary}</p></div>
          <strong>
            {displayedCount}<small>场</small>
          </strong>
        </div>
      </a>
    </article>
  );
}

function SourceProfileDetail({ profile, source, loading }: { profile: SourceProfile; source?: SourceStatus; loading: boolean }) {
  const officialUrl = profile.officialUrl || source?.url;
  return (
    <article className="source-profile">
      <div className="source-profile-hero" style={{ backgroundImage: `url("${sourceCoverUrl(profile.coverImage)}")`, backgroundPosition: profile.coverPosition }}>
        <div className="source-profile-identity">
          {profile.logoUrl
            ? <img className={profile.logoAppearance === "light" ? "source-logo-light" : undefined} src={profile.logoUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
            : <strong className="source-profile-mark">{sourceMark(profile.name)}</strong>}
          <span>{profile.category === "orchestra" ? "交响乐团" : "演出场馆"}</span>
          <h1>{profile.name}</h1>
          <p><MapPin size={14} />{profile.city}</p>
        </div>
      </div>
      <div className="source-profile-content">
        <section>
          <span>ABOUT</span>
          <h2>{profile.category === "orchestra" ? "乐团介绍" : "场馆介绍"}</h2>
          <div className="source-profile-description">
            {[profile.description, ...profile.details].map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        </section>
        <dl className="source-profile-stats">
          <div><dt>当前收录</dt><dd>{loading ? "…" : `${source?.eventCount ?? 0} 场`}</dd></div>
          <div><dt>最近采集</dt><dd className={source?.ok ? "ok" : "warning"}>{source?.ok ? "正常" : "沿用已有数据"}</dd></div>
          {source?.rawCount !== undefined ? <div><dt>本次处理</dt><dd>{source.rawCount} 项目 / {source.normalizedCount ?? 0} 场次</dd></div> : null}
        </dl>
      </div>
      {source?.message ? <p className="source-profile-message"><CircleAlert size={15} />{source.message}</p> : null}
      {officialUrl ? <a className="source-official-link" href={officialUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />进入官方网站</a> : null}
    </article>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

function sourceMark(name: string) {
  const marks: Record<string, string> = {
    "上海交响乐团": "上交",
    "苏州交响乐团": "苏交",
    "中国交响乐团": "国交",
    "中国爱乐乐团": "中国爱乐",
    "上海爱乐乐团": "上爱",
    "广州交响乐团": "广交",
    "深圳交响乐团": "深交",
    "浙江交响乐团": "浙交",
    "上海东方艺术中心": "东艺",
    "凯迪拉克·上海音乐厅": "上海音乐厅",
    "国家大剧院": "NCPA",
    "上海大剧院": "上大",
    "北京音乐厅": "北京音乐厅",
    "中山公园音乐堂": "中山音乐堂",
    "星海音乐厅": "星海",
    "深圳音乐厅": "深圳音乐厅",
    "西安音乐厅": "西安音乐厅",
    "哈尔滨音乐厅": "哈尔滨音乐厅",
  };
  return marks[name] || name.slice(0, 5);
}
