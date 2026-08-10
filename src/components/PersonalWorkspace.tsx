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
import BrandLogo from "./BrandLogo";
import { useAuth } from "../auth/AuthProvider";
import { loadEventArchive, loadEventIndex, loadKnowledgeIndex } from "../data";
import {
  removeSavedFilter,
  toggleFollow,
  type FollowTargetType,
  type SavedFilter,
} from "../discovery-features";
import {
  countPersonalEvents,
  followTargetHref,
  followTypeOrder,
  groupFollowTargets,
  listPersonalEvents,
  savedFilterHref,
  type PersonalEventListItem,
} from "../personal-profile";
import {
  type PersonalEventSnapshotMap,
} from "../product-features";
import type { ConcertIndexDataset } from "../types";
import { usePersonalEvents } from "../use-personal-events";
import { useUserPreferences } from "../use-user-preferences";
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
  const {
    events: personalEvents,
    snapshots: personalEventSnapshots,
    syncError: personalEventSyncError,
    removeStatus: removePersonalEventStatus,
    saveSnapshot: savePersonalEventSnapshot,
  } = usePersonalEvents(userId);
  const {
    follows,
    savedFilters,
    syncError: userPreferencesSyncError,
    updateFollows,
    updateSavedFilters,
  } = useUserPreferences(userId);
  const [dataset, setDataset] = useState<ConcertIndexDataset>();
  const [knowledgeWorkIds, setKnowledgeWorkIds] = useState<Set<string>>(new Set());
  const [dataError, setDataError] = useState("");

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
  const typedPersonalEventSnapshots: PersonalEventSnapshotMap = personalEventSnapshots;
  const personalCounts = useMemo(() => countPersonalEvents(personalEvents), [personalEvents]);
  const eventMap = useMemo(() => new Map(dataset?.events.map((event) => [event.id, event]) ?? []), [dataset]);
  const interestedEvents = useMemo(
    () => listPersonalEvents(personalEvents, "interested", eventMap, typedPersonalEventSnapshots),
    [eventMap, personalEvents, typedPersonalEventSnapshots],
  );
  const attendedEvents = useMemo(
    () => listPersonalEvents(personalEvents, "attended", eventMap, typedPersonalEventSnapshots),
    [eventMap, personalEvents, typedPersonalEventSnapshots],
  );
  const accountName = auth.profile?.displayName || auth.user?.email?.split("@")[0] || "古典乐迷";

  useEffect(() => {
    if (!userId || !dataset) return;
    for (const eventId of Object.keys(personalEvents)) {
      if (typedPersonalEventSnapshots[eventId]) continue;
      const event = eventMap.get(eventId);
      if (!event) continue;
      savePersonalEventSnapshot(event);
    }
  }, [dataset, eventMap, personalEvents, savePersonalEventSnapshot, typedPersonalEventSnapshots, userId]);

  useEffect(() => {
    if (!userId || !dataset) return;
    const missingIds = Object.keys(personalEvents).filter((eventId) => !eventMap.has(eventId) && !typedPersonalEventSnapshots[eventId]);
    if (!missingIds.length) return;
    let cancelled = false;
    loadEventArchive()
      .then((archive) => {
        if (cancelled) return;
        const archiveMap = new Map(archive.events.map((event) => [event.id, event]));
        for (const eventId of missingIds) {
          const event = archiveMap.get(eventId);
          if (!event) continue;
          savePersonalEventSnapshot(event);
        }
      })
      .catch(() => {
        // Early records without a recoverable snapshot remain counted but cannot be reconstructed.
      });
    return () => { cancelled = true; };
  }, [dataset, eventMap, personalEvents, savePersonalEventSnapshot, typedPersonalEventSnapshots, userId]);

  const removeFollow = (key: string) => {
    const target = follows[key];
    if (!target || !userId) return;
    updateFollows((current) => toggleFollow(current, target));
  };

  const removePersonalEvent = (eventId: string) => {
    if (!userId) return;
    removePersonalEventStatus(eventId);
  };

  return (
    <main className="personal-workspace">
      <header className="app-header source-page-header">
        <div className="brand-block">
          <BrandLogo />
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
          <PersonalState icon={UserRound} title="登录后查看个人页" detail="关注、想去、已购和筛选方案会按账号分别保存。">
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
                <div><dt>已购</dt><dd>{personalCounts.attended}</dd></div>
                <div><dt>筛选方案</dt><dd>{savedFilters.length}</dd></div>
              </dl>
              <p className="personal-joined">加入于 {formatAccountDate(auth.user.created_at)}</p>
            </section>

            {auth.profileError || dataError || personalEventSyncError || userPreferencesSyncError ? (
              <p className="personal-warning"><CircleAlert size={16} />{auth.profileError || dataError || personalEventSyncError || userPreferencesSyncError}</p>
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
              <header><div><CalendarCheck size={18} /><span><h2>我的演出</h2><p>集中查看标记为想去和已购的音乐会。</p></span></div></header>
              <div className="personal-concert-columns">
                <PersonalEventGroup title="想去" count={personalCounts.interested} icon={CalendarClock} events={interestedEvents} onRemove={removePersonalEvent} />
                <PersonalEventGroup title="已购" count={personalCounts.attended} icon={CalendarCheck} events={attendedEvents} onRemove={removePersonalEvent} />
              </div>
            </section>

            <section className="personal-section personal-filters">
              <header><div><Bookmark size={18} /><span><h2>筛选方案</h2><p>快速回到你保存过的演出检索条件。</p></span></div><strong>{savedFilters.length}</strong></header>
              {savedFilters.length ? (
                <div className="personal-filter-list">
                  {savedFilters.map((filter) => (
                    <article key={filter.id}>
                      <a href={savedFilterHref(filter)}><Bookmark size={15} /><span><strong>{filter.name}</strong><small>{formatSavedFilter(filter)}</small></span><ChevronRight size={15} /></a>
                      <button type="button" onClick={() => updateSavedFilters((current) => removeSavedFilter(current, filter.id))} title="删除筛选方案" aria-label={`删除筛选方案${filter.name}`}><Trash2 size={14} /></button>
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
  events: PersonalEventListItem[];
  onRemove: (eventId: string) => void;
}) {
  return (
    <section className="personal-event-group">
      <header><Icon size={15} /><h3>{title}</h3><span>{count}</span></header>
      <div>
        {events.length ? events.map(({ event, archived }) => (
          <article key={event.id}>
            {archived ? (
              <div className="personal-event-record">
                <time dateTime={event.startTime}>{formatEventDate(event.startTime)}</time>
                <span><strong>{event.title}</strong><small>{formatEventVenue(event)} · 历史记录</small></span>
              </div>
            ) : (
              <a href={`?event=${encodeURIComponent(event.id)}`}>
                <time dateTime={event.startTime}>{formatEventDate(event.startTime)}</time>
                <span><strong>{event.title}</strong><small>{formatEventVenue(event)}</small></span>
                <ChevronRight size={15} />
              </a>
            )}
            <button type="button" onClick={() => onRemove(event.id)} title={`从${title}中移除`} aria-label={`从${title}中移除${event.title}`}><Trash2 size={14} /></button>
          </article>
        )) : <p>{count ? "早期记录没有可恢复的演出信息。" : `还没有标记为${title}的演出。`}</p>}
      </div>
    </section>
  );
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
