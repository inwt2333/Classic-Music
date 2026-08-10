import {
  ArrowLeft,
  Bell,
  Bookmark,
  Building2,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Crown,
  LibraryBig,
  MapPin,
  Music,
  Search,
  ScanText,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useAuth } from "../auth/AuthProvider";
import { loadEventIndex, loadKnowledgeIndex } from "../data";
import {
  readFollows,
  readSavedFilters,
  removeSavedFilter,
  toggleFollow,
  type FollowMap,
  type FollowTargetType,
  type SavedFilter,
} from "../discovery-features";
import {
  countPersonalEvents,
  followTargetHref,
  followTypeOrder,
  groupFollowTargets,
  savedFilterHref,
} from "../personal-profile";
import {
  readPersonalEvents,
  setPersonalEventStatus,
  type PersonalEventMap,
  type PersonalEventStatus,
} from "../product-features";
import type { ConcertEventSummary, ConcertIndexDataset } from "../types";
import { formatEventVenue } from "../utils";
import AccountControl from "./AccountControl";

const followTypeMeta: Record<FollowTargetType, { label: string; icon: ComponentType<{ size?: number }> }> = {
  work: { label: "作品", icon: LibraryBig },
  composer: { label: "作曲家", icon: Music },
  person: { label: "音乐家", icon: UserRound },
  ensemble: { label: "乐团", icon: UsersRound },
  venue: { label: "场馆", icon: Building2 },
  city: { label: "城市", icon: MapPin },
};

export default function PersonalWorkspace() {
  const auth = useAuth();
  const userId = auth.user?.id;
  const [follows, setFollows] = useState<FollowMap>(() => readFollows(userId));
  const [personalEvents, setPersonalEvents] = useState<PersonalEventMap>(() => readPersonalEvents(userId));
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => readSavedFilters(userId));
  const [dataset, setDataset] = useState<ConcertIndexDataset>();
  const [knowledgeWorkIds, setKnowledgeWorkIds] = useState<Set<string>>(new Set());
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    setFollows(readFollows(userId));
    setPersonalEvents(readPersonalEvents(userId));
    setSavedFilters(readSavedFilters(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadEventIndex()
      .then((events) => {
        if (!cancelled) setDataset(events);
      })
      .catch(() => {
        if (!cancelled) setDataError("个人演出暂时无法载入，请稍后刷新重试。");
      });
    loadKnowledgeIndex()
      .then((knowledge) => {
        if (!cancelled) setKnowledgeWorkIds(new Set(knowledge.works.map((work) => work.id)));
      })
      .catch(() => {
        // Follow links fall back to the regular entity page when knowledge data is unavailable.
      });
    return () => { cancelled = true; };
  }, [userId]);

  const groupedFollows = useMemo(() => groupFollowTargets(follows), [follows]);
  const followCount = Object.keys(follows).length;
  const personalCounts = useMemo(() => countPersonalEvents(personalEvents), [personalEvents]);
  const eventMap = useMemo(() => new Map(dataset?.events.map((event) => [event.id, event]) ?? []), [dataset]);
  const interestedEvents = useMemo(() => personalEventList(personalEvents, "interested", eventMap), [eventMap, personalEvents]);
  const attendedEvents = useMemo(() => personalEventList(personalEvents, "attended", eventMap), [eventMap, personalEvents]);
  const accountName = auth.profile?.displayName || auth.user?.email?.split("@")[0] || "古典乐迷";

  const removeFollow = (key: string) => {
    const target = follows[key];
    if (!target || !userId) return;
    setFollows((current) => toggleFollow(current, target, userId));
  };

  const removePersonalEvent = (eventId: string) => {
    if (!userId) return;
    setPersonalEvents((current) => setPersonalEventStatus(current, eventId, null, userId));
  };

  return (
    <main className="personal-workspace">
      <header className="app-header source-page-header">
        <div className="brand-block">
          <Music size={22} />
          <div><strong>古典乐演出日历</strong><span>个人页</span></div>
        </div>
        <div className="personal-header-actions">
          {auth.user ? <AccountControl signedInLabel="账户设置" /> : null}
          <a className="header-link" href={import.meta.env.BASE_URL} title="返回演出日历" aria-label="返回演出日历">
            <ArrowLeft size={15} />返回演出日历
          </a>
        </div>
      </header>

      <section className="personal-page">
        {auth.loading ? (
          <PersonalState icon={UserRound} title="正在载入个人页" detail="正在读取你的账户与关注内容。" />
        ) : !auth.user ? (
          <PersonalState icon={UserRound} title="登录后查看个人页" detail="关注、想去、已去和筛选方案会按账号分别保存。">
            <AccountControl />
          </PersonalState>
        ) : (
          <>
            <section className="personal-identity">
              <span className="personal-avatar" aria-hidden="true">{accountInitial(accountName)}</span>
              <div>
                <small>MY CLASSICAL CALENDAR</small>
                <h1>{accountName}</h1>
                <p>{auth.user.email}</p>
                <span className={auth.isAdmin ? "admin" : ""}>{auth.isAdmin ? <Crown size={13} /> : <UserRound size={13} />}{auth.isAdmin ? "管理员" : "普通用户"}</span>
              </div>
              <dl>
                <div><dt>关注</dt><dd>{followCount}</dd></div>
                <div><dt>想去</dt><dd>{personalCounts.interested}</dd></div>
                <div><dt>已去</dt><dd>{personalCounts.attended}</dd></div>
                <div><dt>筛选方案</dt><dd>{savedFilters.length}</dd></div>
              </dl>
              <p className="personal-joined">加入于 {formatAccountDate(auth.user.created_at)}</p>
            </section>

            {auth.profileError || dataError ? (
              <p className="personal-warning"><CircleAlert size={16} />{auth.profileError || dataError}</p>
            ) : null}

            {auth.isAdmin ? (
              <section className="personal-admin-panel">
                <div><span><ScanText size={20} /></span><div><small>ADMINISTRATION</small><h2>数据审核</h2><p>检查待确认的节目单与公众号导入候选，并保存管理员审核结果。</p></div></div>
                <a href="?review=1"><ScanText size={16} />进入审核工作台<ChevronRight size={15} /></a>
              </section>
            ) : null}

            <section className="personal-section personal-follows">
              <header><div><Bell size={18} /><span><h2>我的关注</h2><p>按内容类型整理你正在关注的作品、人物与机构。</p></span></div><strong>{followCount}</strong></header>
              {followCount ? (
                <div className="personal-follow-groups">
                  {followTypeOrder.map((type) => {
                    const targets = groupedFollows.get(type) ?? [];
                    if (!targets.length) return null;
                    const meta = followTypeMeta[type];
                    const Icon = meta.icon;
                    return (
                      <section key={type} className="personal-follow-group">
                        <header><Icon size={16} /><h3>{meta.label}</h3><span>{targets.length}</span></header>
                        <div>
                          {targets.map((target) => (
                            <article key={target.key} className="personal-follow-item">
                              <a href={followTargetHref(target, knowledgeWorkIds)}>
                                <span><strong>{target.name}</strong><small>查看{meta.label}</small></span>
                                <ChevronRight size={15} />
                              </a>
                              <button type="button" onClick={() => removeFollow(target.key)} title="取消关注" aria-label={`取消关注${target.name}`}><Trash2 size={14} /></button>
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="personal-empty"><Search size={24} /><strong>还没有关注内容</strong><p>浏览作品、音乐家、乐团或场馆时，可以点击关注按钮加入这里。</p><a href={import.meta.env.BASE_URL}>去发现演出</a></div>
              )}
            </section>

            <section className="personal-section personal-concerts">
              <header><div><CalendarCheck size={18} /><span><h2>我的演出</h2><p>集中查看标记为想去和已去的音乐会。</p></span></div></header>
              <div className="personal-concert-columns">
                <PersonalEventGroup title="想去" count={personalCounts.interested} icon={CalendarClock} events={interestedEvents} onRemove={removePersonalEvent} />
                <PersonalEventGroup title="已去" count={personalCounts.attended} icon={CalendarCheck} events={attendedEvents} onRemove={removePersonalEvent} />
              </div>
            </section>

            <section className="personal-section personal-filters">
              <header><div><Bookmark size={18} /><span><h2>筛选方案</h2><p>快速回到你保存过的演出检索条件。</p></span></div><strong>{savedFilters.length}</strong></header>
              {savedFilters.length ? (
                <div className="personal-filter-list">
                  {savedFilters.map((filter) => (
                    <article key={filter.id}>
                      <a href={savedFilterHref(filter)}><Bookmark size={15} /><span><strong>{filter.name}</strong><small>{formatSavedFilter(filter)}</small></span><ChevronRight size={15} /></a>
                      <button type="button" onClick={() => setSavedFilters((current) => removeSavedFilter(current, filter.id, userId))} title="删除筛选方案" aria-label={`删除筛选方案${filter.name}`}><Trash2 size={14} /></button>
                    </article>
                  ))}
                </div>
              ) : <p className="personal-inline-empty">尚未保存筛选方案。</p>}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function PersonalState({ icon: Icon, title, detail, children }: { icon: ComponentType<{ size?: number }>; title: string; detail: string; children?: React.ReactNode }) {
  return <div className="personal-state"><span><Icon size={28} /></span><h1>{title}</h1><p>{detail}</p>{children}</div>;
}

function PersonalEventGroup({
  title,
  count,
  icon: Icon,
  events,
  onRemove,
}: {
  title: string;
  count: number;
  icon: ComponentType<{ size?: number }>;
  events: ConcertEventSummary[];
  onRemove: (eventId: string) => void;
}) {
  return (
    <section className="personal-event-group">
      <header><Icon size={15} /><h3>{title}</h3><span>{count}</span></header>
      <div>
        {events.length ? events.map((event) => (
          <article key={event.id}>
            <a href={`?event=${encodeURIComponent(event.id)}`}>
              <time dateTime={event.startTime}>{formatEventDate(event.startTime)}</time>
              <span><strong>{event.title}</strong><small>{formatEventVenue(event)}</small></span>
              <ChevronRight size={15} />
            </a>
            <button type="button" onClick={() => onRemove(event.id)} title={`从${title}中移除`} aria-label={`从${title}中移除${event.title}`}><Trash2 size={14} /></button>
          </article>
        )) : <p>{count ? "相关演出已不在当前收录范围内。" : `还没有标记为${title}的演出。`}</p>}
      </div>
    </section>
  );
}

function personalEventList(events: PersonalEventMap, status: PersonalEventStatus, eventMap: Map<string, ConcertEventSummary>) {
  return Object.entries(events)
    .filter(([, value]) => value === status)
    .map(([id]) => eventMap.get(id))
    .filter((event): event is ConcertEventSummary => Boolean(event))
    .sort((left, right) => status === "interested"
      ? left.startTime.localeCompare(right.startTime)
      : right.startTime.localeCompare(left.startTime));
}

function accountInitial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase("zh-CN") || "乐";
}

function formatAccountDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", weekday: "short" }).format(new Date(value));
}

function formatSavedFilter(filter: SavedFilter) {
  return [
    filter.city !== "全部城市" ? filter.city : undefined,
    filter.datePreset === "week" ? "本周" : filter.datePreset === "weekend" ? "周末" : filter.datePreset === "month" ? "本月" : undefined,
    filter.venue !== "全部场馆" ? filter.venue : undefined,
    filter.ensemble !== "全部乐团" ? filter.ensemble : undefined,
    filter.genre !== "全部类型" ? filter.genre : undefined,
    filter.query || undefined,
  ].filter(Boolean).join(" · ") || "全部未来演出";
}
