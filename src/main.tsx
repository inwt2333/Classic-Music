import {
  lazy,
  memo,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Filter,
  History,
  List as ListIcon,
  MapPin,
  Music,
  Search,
  ScanText,
  SlidersHorizontal,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import EventDetail from "./components/EventDetail";
import ReviewWorkspace from "./components/ReviewWorkspace";
import SourcesWorkspace from "./components/SourcesWorkspace";
import { loadEntities, loadEventDetail, loadEventIndex } from "./data";
import "./styles.css";
import type {
  ConcertEvent,
  ConcertEventSummary,
  ConcertIndexDataset,
  EntityDataset,
  EntityRecord,
} from "./types";
import {
  dateMatchesPreset,
  formatEventVenue,
  getInitialCalendarMonth,
} from "./utils";

const CalendarView = lazy(() => import("./components/CalendarView"));

declare global {
  var __classicMusicRoot: Root | undefined;
}

type Scope = "upcoming" | "past";
type DatePreset = "all" | "week" | "weekend" | "month";
type ViewMode = "list" | "calendar";

const emptyDataset: ConcertIndexDataset = {
  schemaVersion: 2,
  generatedAt: null,
  city: "北京、上海、苏州",
  events: [],
  sources: [],
  stats: { rawEvents: 0, normalizedEvents: 0, aiEnhancedEvents: 0, errors: [] },
};
const emptyEntities: EntityDataset = { generatedAt: "", entities: [] };
const genreOptions = ["全部类型", "交响", "室内乐", "钢琴", "独奏", "合唱", "歌剧"];
const pageSize = 50;
const coverSlides = [
  {
    src: `${import.meta.env.BASE_URL}images/concert-orchestra.webp`,
    position: "center 46%",
    eyebrow: "北京 · 上海 · 苏州演出日历",
    title: "今夜，去听一场音乐会",
    caption: "从乐团、场馆与曲目出发，发现下一次现场聆听。",
  },
  {
    src: `${import.meta.env.BASE_URL}images/concert-violin.webp`,
    position: "center 58%",
    eyebrow: "独奏与室内乐",
    title: "靠近舞台，也靠近音乐",
    caption: "按日期梳理演出，让值得期待的现场不再错过。",
  },
  {
    src: `${import.meta.env.BASE_URL}images/concert-piano-hall.webp`,
    position: "center 55%",
    eyebrow: "音乐厅现场",
    title: "在城市里，留一段时间给音乐",
    caption: "查看曲目、音乐家与场馆信息，再决定今晚去哪里。",
  },
] as const;

function App() {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [dataset, setDataset] = useState(emptyDataset);
  const [entities, setEntities] = useState(emptyEntities);
  const [loadState, setLoadState] = useState("正在加载演出索引");
  const [query, setQuery] = useState(initialParams.get("q") ?? "");
  const [scope, setScope] = useState<Scope>(initialParams.get("scope") === "past" ? "past" : "upcoming");
  const [datePreset, setDatePreset] = useState<DatePreset>((initialParams.get("date") as DatePreset) || "all");
  const [city, setCity] = useState(initialParams.get("city") ?? "全部城市");
  const [venue, setVenue] = useState(initialParams.get("venue") ?? "全部场馆");
  const [ensemble, setEnsemble] = useState(initialParams.get("ensemble") ?? "全部乐团");
  const [genre, setGenre] = useState(initialParams.get("genre") ?? "全部类型");
  const [hasProgram, setHasProgram] = useState(initialParams.get("program") === "1");
  const [viewMode, setViewMode] = useState<ViewMode>(initialParams.get("view") === "calendar" ? "calendar" : "list");
  const [selectedId, setSelectedId] = useState(initialParams.get("event") ?? "");
  const [selectedDetail, setSelectedDetail] = useState<ConcertEvent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [activeEntityId, setActiveEntityId] = useState(initialParams.get("entity") ?? "");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [coverIndex, setCoverIndex] = useState(0);
  const [coverPaused, setCoverPaused] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("zh-CN"));

  useEffect(() => {
    if (coverPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = window.setInterval(
      () => setCoverIndex((current) => (current + 1) % coverSlides.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [coverPaused]);

  useEffect(() => {
    loadEventIndex()
      .then((data) => {
        setDataset(data);
        const first = data.events.find((event) => new Date(event.startTime).getTime() >= Date.now()) ?? data.events[0];
        setSelectedId((current) => current || first?.id || "");
        setCalendarMonth(getInitialCalendarMonth(data.events));
      })
      .catch((error) => setLoadState(`加载失败：${error instanceof Error ? error.message : String(error)}`));
    loadEntities().then(setEntities).catch(() => setEntities(emptyEntities));
  }, []);

  useEffect(() => {
    const restoreFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setQuery(params.get("q") ?? "");
      setScope(params.get("scope") === "past" ? "past" : "upcoming");
      setDatePreset((params.get("date") as DatePreset) || "all");
      setCity(params.get("city") ?? "全部城市");
      setVenue(params.get("venue") ?? "全部场馆");
      setEnsemble(params.get("ensemble") ?? "全部乐团");
      setGenre(params.get("genre") ?? "全部类型");
      setHasProgram(params.get("program") === "1");
      setViewMode(params.get("view") === "calendar" ? "calendar" : "list");
      setSelectedId(params.get("event") ?? "");
      setActiveEntityId(params.get("entity") ?? "");
      setDetailOpen(Boolean(params.get("event")));
    };
    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, []);

  const selectedSummary = useMemo(
    () => dataset.events.find((event) => event.id === selectedId) ?? null,
    [dataset.events, selectedId],
  );

  useEffect(() => {
    if (!selectedSummary) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    loadEventDetail(selectedSummary.id, selectedSummary.detailPath)
      .then((event) => {
        if (!cancelled) setSelectedDetail(event);
      })
      .catch(() => {
        if (!cancelled) setSelectedDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSummary]);

  const cities = useMemo(
    () => ["全部城市", ...Array.from(new Set(dataset.events.map((event) => event.city))).sort()],
    [dataset.events],
  );
  const venues = useMemo(
    () => [
      "全部场馆",
      ...Array.from(
        new Set(dataset.events.filter((event) => city === "全部城市" || event.city === city).map((event) => event.venue)),
      ).sort(),
    ],
    [city, dataset.events],
  );
  const ensembles = useMemo(
    () => [
      "全部乐团",
      ...Array.from(
        new Set(
          dataset.events
            .map((event) => normalizeEnsembleLabel(event.ensemble))
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    ],
    [dataset.events],
  );
  const activeEntity = useMemo(
    () => entities.entities.find((entity) => entity.id === activeEntityId) ?? null,
    [activeEntityId, entities.entities],
  );
  const activeEntityEvents = useMemo(
    () => activeEntity ? new Set(activeEntity.eventIds) : null,
    [activeEntity],
  );

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    return dataset.events.filter((event) => {
      const eventTime = new Date(event.startTime).getTime();
      if (scope === "upcoming" ? eventTime < now : eventTime >= now) return false;
      if (!dateMatchesPreset(event.startTime, datePreset)) return false;
      if (city !== "全部城市" && event.city !== city) return false;
      if (venue !== "全部场馆" && event.venue !== venue) return false;
      if (ensemble !== "全部乐团" && normalizeEnsembleLabel(event.ensemble) !== ensemble) return false;
      if (genre !== "全部类型" && !event.genres.includes(genre)) return false;
      if (hasProgram && !event.hasProgram) return false;
      if (activeEntityEvents && !activeEntityEvents.has(event.id)) return false;
      return !deferredQuery || event.searchText.includes(deferredQuery);
    });
  }, [
    activeEntityEvents,
    city,
    dataset.events,
    datePreset,
    deferredQuery,
    ensemble,
    genre,
    hasProgram,
    scope,
    venue,
  ]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [activeEntityId, city, datePreset, deferredQuery, ensemble, genre, hasProgram, scope, venue]);

  useEffect(() => {
    if (!filteredEvents.length) return;
    if (!filteredEvents.some((event) => event.id === selectedId)) setSelectedId(filteredEvents[0].id);
  }, [filteredEvents, selectedId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (scope === "past") params.set("scope", scope);
    if (datePreset !== "all") params.set("date", datePreset);
    if (city !== "全部城市") params.set("city", city);
    if (venue !== "全部场馆") params.set("venue", venue);
    if (ensemble !== "全部乐团") params.set("ensemble", ensemble);
    if (genre !== "全部类型") params.set("genre", genre);
    if (hasProgram) params.set("program", "1");
    if (viewMode === "calendar") params.set("view", viewMode);
    if (selectedId) params.set("event", selectedId);
    if (activeEntityId) params.set("entity", activeEntityId);
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [activeEntityId, city, datePreset, ensemble, genre, hasProgram, query, scope, selectedId, venue, viewMode]);

  const entitiesByKey = useMemo(() => {
    const map = new Map<string, EntityRecord>();
    for (const entity of entities.entities) {
      map.set(`${entity.type}:${entity.type === "work" ? entity.id : entity.name}`, entity);
    }
    return map;
  }, [entities.entities]);

  const activeFilterCount = [
    datePreset !== "all",
    city !== "全部城市",
    venue !== "全部场馆",
    ensemble !== "全部乐团",
    genre !== "全部类型",
    hasProgram,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setDatePreset("all");
    setCity("全部城市");
    setVenue("全部场馆");
    setEnsemble("全部乐团");
    setGenre("全部类型");
    setHasProgram(false);
    setActiveEntityId("");
  };

  const selectEvent = (event: ConcertEventSummary) => {
    pushHistoryValue("event", event.id);
    setSelectedId(event.id);
    setDetailOpen(true);
  };

  const exploreEntity = (entity: EntityRecord) => {
    pushHistoryValue("entity", entity.id);
    setActiveEntityId(entity.id);
    setQuery("");
    setDatePreset("all");
    setScope(entity.upcomingEventCount ? "upcoming" : "past");
    setDetailOpen(false);
  };

  const clearEntity = () => {
    pushHistoryValue("entity", "");
    setActiveEntityId("");
  };

  const changeScope = (nextScope: Scope) => {
    setScope(nextScope);
    setDatePreset("all");
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <Music size={22} />
          <div><strong>古典乐演出日历</strong><span>北京 · 上海 · 苏州</span></div>
        </div>
        <div className="header-status">
          <a className="header-link" href="?sources=1">
            <Database size={14} />
            数据来源
          </a>
          {import.meta.env.DEV ? (
            <a className="header-link" href="?review=1">
              <ScanText size={14} />
              审核
            </a>
          ) : null}
          <span className={dataset.stats.errors.length ? "warning" : ""}>
            {dataset.stats.errors.length ? <CircleAlert size={14} /> : <Check size={14} />}
            {dataset.generatedAt
              ? `数据更新时间：${formatDatasetTimestamp(dataset.generatedAt)}`
              : loadState}
          </span>
          <small>
            {dataset.events.length} 场 · {dataset.sources.length} 个来源
            {dataset.stats.errors.length
              ? ` · ${dataset.sources.filter((source) => source.ok).length} 个本次成功`
              : ""}
          </small>
        </div>
      </header>

      <section
        className="cover-banner"
        aria-label="古典音乐现场图片轮播"
        aria-roledescription="轮播"
        onMouseEnter={() => setCoverPaused(true)}
        onMouseLeave={() => setCoverPaused(false)}
        onFocusCapture={() => setCoverPaused(true)}
        onBlurCapture={() => setCoverPaused(false)}
      >
        <div className="cover-images" aria-hidden="true">
          {coverSlides.map((slide, index) => (
            <img
              key={slide.src}
              className={index === coverIndex ? "active" : ""}
              src={slide.src}
              style={{ objectPosition: slide.position }}
              alt=""
              loading={index === 0 ? "eager" : "lazy"}
            />
          ))}
        </div>
        <div className="cover-shade" aria-hidden="true" />
        <div className="cover-copy">
          <span>{coverSlides[coverIndex].eyebrow}</span>
          <strong>{coverSlides[coverIndex].title}</strong>
          <small>{coverSlides[coverIndex].caption}</small>
        </div>
        <div className="cover-controls">
          <button
            type="button"
            title="上一张"
            aria-label="上一张封面"
            onClick={() => setCoverIndex((coverIndex - 1 + coverSlides.length) % coverSlides.length)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="cover-dots" aria-label="选择封面">
            {coverSlides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                className={index === coverIndex ? "active" : ""}
                title={`第 ${index + 1} 张`}
                aria-label={`显示第 ${index + 1} 张封面`}
                aria-current={index === coverIndex ? "true" : undefined}
                onClick={() => setCoverIndex(index)}
              />
            ))}
          </div>
          <button
            type="button"
            title="下一张"
            aria-label="下一张封面"
            onClick={() => setCoverIndex((coverIndex + 1) % coverSlides.length)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <section className="command-bar">
        <label className="global-search">
          <Search size={19} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索曲目、作曲家、音乐家、乐团或场馆" />
          {query ? <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={16} /></button> : null}
        </label>
        <div className="scope-tabs" role="tablist" aria-label="演出时间范围">
          <button className={scope === "upcoming" ? "active" : ""} onClick={() => changeScope("upcoming")}>即将演出</button>
          <button className={scope === "past" ? "active" : ""} onClick={() => changeScope("past")}><History size={15} />历史</button>
        </div>
        <button className="mobile-filter-button" onClick={() => setFiltersOpen(true)}>
          <Filter size={17} />筛选{activeFilterCount ? ` ${activeFilterCount}` : ""}
        </button>
      </section>

      <nav className="view-bar" aria-label="浏览方式">
        <div className="view-tabs" role="tablist">
          <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>
            <ListIcon size={16} />列表
          </button>
          <button className={viewMode === "calendar" ? "active" : ""} onClick={() => setViewMode("calendar")}>
            <CalendarDays size={16} />日历
          </button>
        </div>
        <span>{filteredEvents.length} 场匹配</span>
      </nav>

      {activeEntity ? (
        <section className="entity-context">
          <div>
            {activeEntity.type === "person" ? <UserRound size={18} /> : <Music size={18} />}
            <span><small>{activeEntity.type === "person" ? "音乐家" : "作品"}</small><strong>{activeEntity.name}</strong></span>
            {activeEntity.subtitle ? <em>{activeEntity.subtitle}</em> : null}
          </div>
          <button onClick={clearEntity}><X size={16} />退出关联页</button>
        </section>
      ) : null}

      <section className={`workspace ${viewMode === "calendar" ? "calendar-mode" : ""}`}>
        <aside className={`control-panel ${filtersOpen ? "open" : ""}`}>
          <header className="filter-header">
            <span><SlidersHorizontal size={17} />筛选</span>
            <button className="filter-close" onClick={() => setFiltersOpen(false)} aria-label="关闭筛选"><X size={19} /></button>
          </header>

          <FilterGroup label="日期">
            <div className="date-presets">
              {([
                ["all", scope === "upcoming" ? "全部未来" : "全部历史"],
                ["week", "本周"],
                ["weekend", "周末"],
                ["month", "本月"],
              ] as Array<[DatePreset, string]>).map(([value, label]) => (
                <button
                  key={value}
                  className={datePreset === value ? "active" : ""}
                  disabled={scope === "past" && value !== "all"}
                  onClick={() => setDatePreset(datePreset === value && value !== "all" ? "all" : value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterGroup>

          <SelectFilter label="城市" value={city} options={cities} onChange={(value) => {
            setCity(value);
            setVenue("全部场馆");
          }} />
          <SelectFilter label="场馆" value={venue} options={venues} onChange={setVenue} />
          <SelectFilter label="乐团" value={ensemble} options={ensembles} onChange={setEnsemble} />
          <SelectFilter label="类型" value={genre} options={genreOptions} onChange={setGenre} />

          <label className="check-filter">
            <input type="checkbox" checked={hasProgram} onChange={(event) => setHasProgram(event.target.checked)} />
            <span><Check size={14} />只看有节目单</span>
          </label>

          <button className="reset-button" onClick={resetFilters} disabled={!activeFilterCount && !activeEntity}>
            清除筛选
          </button>
        </aside>

        {viewMode === "list" ? (
          <section className="event-list" aria-label="演出列表">
            {filteredEvents.length ? (
              <>
                {filteredEvents.slice(0, visibleCount).map((event) => (
                  <EventListRow key={event.id} event={event} active={selectedId === event.id} onSelect={selectEvent} />
                ))}
                {visibleCount < filteredEvents.length ? (
                  <button className="load-more" onClick={() => setVisibleCount((count) => count + pageSize)}>
                    显示更多 <span>{filteredEvents.length - visibleCount}</span>
                  </button>
                ) : null}
              </>
            ) : (
              <div className="empty-results">
                <Search size={28} /><h2>没有匹配的演出</h2><p>调整日期或筛选条件后再试。</p>
                <button onClick={resetFilters}>清除筛选</button>
              </div>
            )}
          </section>
        ) : (
          <Suspense fallback={<section className="calendar-panel loading">正在加载日历</section>}>
            <CalendarView
              events={filteredEvents}
              selectedId={selectedId}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onSelect={selectEvent}
            />
          </Suspense>
        )}

        <EventDetail
          event={selectedDetail}
          loading={detailLoading}
          open={detailOpen}
          entitiesByKey={entitiesByKey}
          onClose={() => setDetailOpen(false)}
          onExplore={exploreEntity}
        />
      </section>

    </main>
  );
}

const EventListRow = memo(function EventListRow({
  event,
  active,
  onSelect,
}: {
  event: ConcertEventSummary;
  active: boolean;
  onSelect: (event: ConcertEventSummary) => void;
}) {
  const mainPerson = event.mainPerson;
  return (
    <button className={`event-card ${active ? "active" : ""}`} onClick={() => onSelect(event)}>
      <div className="date-block"><strong>{event.dateLabel}</strong><span>{event.weekday}</span><time>{event.timeLabel}</time></div>
      <div className="event-main">
        <div className="event-title-row">
          <h2>{event.title}</h2>
          <ChevronRight size={18} />
        </div>
        <div className="event-meta">
          <span><MapPin size={14} />{formatEventVenue(event)}</span>
          {event.price ? <span><Ticket size={14} />{event.price}</span> : null}
          {mainPerson ? <span><UserRound size={14} />{mainPerson}</span> : null}
        </div>
        {event.programPreview.length ? (
          <div className="program-preview">
            {event.programPreview.map((item) => (
              <span key={`${item.workId}-${item.title}`}>{item.composer ? `${item.composer} · ` : ""}{item.title}</span>
            ))}
          </div>
        ) : <span className="program-pending">节目单待公布</span>}
      </div>
    </button>
  );
});

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div className="filter-group"><label>{label}</label>{children}</div>;
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-group">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function normalizeEnsembleLabel(value?: string) {
  if (!value) return undefined;
  if (value.includes("上海交响乐团")) return "上海交响乐团";
  if (value.includes("苏州交响乐团")) return "苏州交响乐团";
  const cleaned = (value.includes("与") ? value.split("与").at(-1) : value)?.replace(/^与/, "").trim() ?? "";
  if (
    cleaned.length <= 24 &&
    !/[丨|]/.test(cleaned) &&
    /(?:交响乐团|爱乐乐团|管弦乐团|室内乐团|合唱团|四重奏)$/.test(cleaned)
  ) {
    return cleaned;
  }
  return undefined;
}

function pushHistoryValue(key: string, value: string) {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  window.history.pushState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
}

function formatDatasetTimestamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

const rootElement = document.getElementById("root")!;
const appRoot = globalThis.__classicMusicRoot ?? createRoot(rootElement);
if (import.meta.hot) globalThis.__classicMusicRoot = appRoot;
const rootParams = new URLSearchParams(window.location.search);
appRoot.render(rootParams.get("review") === "1"
  ? <ReviewWorkspace />
  : rootParams.get("sources") === "1"
    ? <SourcesWorkspace />
    : <App />);
