import {
  lazy,
  memo,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
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
  Building2,
  Database,
  Download,
  Filter,
  List as ListIcon,
  MapPin,
  Music,
  Search,
  ScanText,
  SlidersHorizontal,
  Star,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import EventDetail from "./components/EventDetail";
import ChangesWorkspace from "./components/ChangesWorkspace";
import ReviewWorkspace from "./components/ReviewWorkspace";
import SourcesWorkspace from "./components/SourcesWorkspace";
import { loadEntities, loadEventDetail, loadEventIndex } from "./data";
import {
  copyEventText,
  downloadEventsIcs,
  expandSearchQuery,
  matchesExpandedSearch,
  readPersonalEvents,
  setPersonalEventStatus,
  type PersonalEventMap,
  type PersonalEventStatus,
} from "./product-features";
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

type DatePreset = "all" | "week" | "weekend" | "month";
type ViewMode = "list" | "calendar";
type PersonalFilter = "all" | PersonalEventStatus;

const emptyDataset: ConcertIndexDataset = {
  schemaVersion: 2,
  generatedAt: null,
  city: "全国",
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
    eyebrow: "全国古典乐演出日历",
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
  const [datePreset, setDatePreset] = useState<DatePreset>((initialParams.get("date") as DatePreset) || "all");
  const [city, setCity] = useState(initialParams.get("city") ?? "全部城市");
  const [venue, setVenue] = useState(initialParams.get("venue") ?? "全部场馆");
  const [ensemble, setEnsemble] = useState(initialParams.get("ensemble") ?? "全部乐团");
  const [genre, setGenre] = useState(initialParams.get("genre") ?? "全部类型");
  const [hasProgram, setHasProgram] = useState(initialParams.get("program") === "1");
  const [personalFilter, setPersonalFilter] = useState<PersonalFilter>(
    initialParams.get("personal") === "interested" || initialParams.get("personal") === "attended"
      ? (initialParams.get("personal") as PersonalEventStatus)
      : "all",
  );
  const [viewMode, setViewMode] = useState<ViewMode>(initialParams.get("view") === "calendar" ? "calendar" : "list");
  const [selectedId, setSelectedId] = useState(initialParams.get("event") ?? "");
  const [selectedDetail, setSelectedDetail] = useState<ConcertEvent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [activeEntityId, setActiveEntityId] = useState(initialParams.get("entity") ?? "");
  const [activeVenue, setActiveVenue] = useState(initialParams.get("venuePage") ?? "");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [coverIndex, setCoverIndex] = useState(0);
  const [coverPaused, setCoverPaused] = useState(false);
  const [personalEvents, setPersonalEvents] = useState<PersonalEventMap>(() => readPersonalEvents());
  const [copyState, setCopyState] = useState("");
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterCloseRef = useRef<HTMLButtonElement | null>(null);
  const filterPanelRef = useRef<HTMLElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const filtersWereOpenRef = useRef(false);
  const filterIsModal = useMediaQuery("(max-width: 760px)");
  const detailIsModal = useMediaQuery("(max-width: 1200px)");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("zh-CN"));
  const filterModalActive = filtersOpen && filterIsModal;
  const detailModalActive = detailOpen && detailIsModal;

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
    if (!filterModalActive) return;
    window.requestAnimationFrame(() => filterCloseRef.current?.focus());
  }, [filterModalActive]);

  useEffect(() => {
    if (filtersWereOpenRef.current && !filtersOpen) filterButtonRef.current?.focus();
    filtersWereOpenRef.current = filtersOpen;
  }, [filtersOpen]);

  useEffect(() => {
    if (detailModalActive) {
      window.requestAnimationFrame(() => detailCloseRef.current?.focus());
      return;
    }
    if (!detailOpen) detailTriggerRef.current?.focus();
  }, [detailModalActive, detailOpen]);

  useEffect(() => {
    const backgroundElements = document.querySelectorAll<HTMLElement>("[data-app-background]");
    const activeModal = filterModalActive ? filterPanelRef.current : detailModalActive ? detailPanelRef.current : null;
    const active = filterModalActive || detailModalActive;
    for (const element of backgroundElements) {
      const shouldHide = active && element !== activeModal && !activeModal?.contains(element);
      element.toggleAttribute("inert", shouldHide);
      if (shouldHide) element.setAttribute("aria-hidden", "true");
      else element.removeAttribute("aria-hidden");
    }
    return () => {
      for (const element of backgroundElements) {
        element.removeAttribute("inert");
        element.removeAttribute("aria-hidden");
      }
    };
  }, [detailModalActive, filterModalActive]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (filterModalActive) setFiltersOpen(false);
      else if (detailModalActive) setDetailOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailModalActive, filterModalActive]);

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
      setDatePreset((params.get("date") as DatePreset) || "all");
      setCity(params.get("city") ?? "全部城市");
      setVenue(params.get("venue") ?? "全部场馆");
      setEnsemble(params.get("ensemble") ?? "全部乐团");
      setGenre(params.get("genre") ?? "全部类型");
      setHasProgram(params.get("program") === "1");
      setPersonalFilter(
        params.get("personal") === "interested" || params.get("personal") === "attended"
          ? (params.get("personal") as PersonalEventStatus)
          : "all",
      );
      setViewMode(params.get("view") === "calendar" ? "calendar" : "list");
      setSelectedId(params.get("event") ?? "");
      setActiveEntityId(params.get("entity") ?? "");
      setActiveVenue(params.get("venuePage") ?? "");
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
  const expandedQueries = useMemo(() => expandSearchQuery(query), [query]);

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    return dataset.events.filter((event) => {
      const eventTime = new Date(event.startTime).getTime();
      if (eventTime < now) return false;
      if (!dateMatchesPreset(event.startTime, datePreset)) return false;
      if (city !== "全部城市" && event.city !== city) return false;
      if (venue !== "全部场馆" && event.venue !== venue) return false;
      if (ensemble !== "全部乐团" && normalizeEnsembleLabel(event.ensemble) !== ensemble) return false;
      if (genre !== "全部类型" && !event.genres.includes(genre)) return false;
      if (hasProgram && !event.hasProgram) return false;
      if (personalFilter !== "all" && personalEvents[event.id] !== personalFilter) return false;
      if (activeEntityEvents && !activeEntityEvents.has(event.id)) return false;
      if (activeVenue && event.venue !== activeVenue) return false;
      return !deferredQuery || matchesExpandedSearch(event.searchText, expandedQueries);
    });
  }, [
    activeEntityEvents,
    activeVenue,
    city,
    dataset.events,
    datePreset,
    deferredQuery,
    ensemble,
    genre,
    hasProgram,
    personalEvents,
    personalFilter,
    venue,
    expandedQueries,
  ]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [activeEntityId, activeVenue, city, datePreset, deferredQuery, ensemble, genre, hasProgram, personalFilter, venue]);

  useEffect(() => {
    if (!filteredEvents.length) return;
    if (!filteredEvents.some((event) => event.id === selectedId)) setSelectedId(filteredEvents[0].id);
  }, [filteredEvents, selectedId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (datePreset !== "all") params.set("date", datePreset);
    if (city !== "全部城市") params.set("city", city);
    if (venue !== "全部场馆") params.set("venue", venue);
    if (ensemble !== "全部乐团") params.set("ensemble", ensemble);
    if (genre !== "全部类型") params.set("genre", genre);
    if (hasProgram) params.set("program", "1");
    if (personalFilter !== "all") params.set("personal", personalFilter);
    if (viewMode === "calendar") params.set("view", viewMode);
    if (selectedId) params.set("event", selectedId);
    if (activeEntityId) params.set("entity", activeEntityId);
    if (activeVenue) params.set("venuePage", activeVenue);
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [activeEntityId, activeVenue, city, datePreset, ensemble, genre, hasProgram, personalFilter, query, selectedId, venue, viewMode]);

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
    personalFilter !== "all",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setDatePreset("all");
    setCity("全部城市");
    setVenue("全部场馆");
    setEnsemble("全部乐团");
    setGenre("全部类型");
    setHasProgram(false);
    setPersonalFilter("all");
    setActiveEntityId("");
    setActiveVenue("");
  };

  const updatePersonalStatus = (eventId: string, status: PersonalEventStatus | null) => {
    setPersonalEvents((current) => setPersonalEventStatus(current, eventId, status));
  };

  const copySelectedEvent = async (event: ConcertEvent) => {
    await navigator.clipboard.writeText(copyEventText(event));
    setCopyState("已复制演出信息");
    window.setTimeout(() => setCopyState(""), 1800);
  };

  const downloadSelectedEventIcs = (event: ConcertEvent) => {
    downloadEventsIcs([event], `${event.dateLabel.replace("/", "")}-${event.title.slice(0, 24)}`);
  };

  const downloadFilteredIcs = () => {
    downloadEventsIcs(filteredEvents, "classic-music-filtered-events");
  };

  const selectEvent = (event: ConcertEventSummary) => {
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pushHistoryValue("event", event.id);
    setSelectedId(event.id);
    setDetailOpen(true);
  };

  const exploreEntity = (entity: EntityRecord) => {
    pushHistoryValue("entity", entity.id);
    setActiveEntityId(entity.id);
    setActiveVenue("");
    setQuery("");
    setDatePreset("all");
    setDetailOpen(false);
  };

  const clearEntity = () => {
    pushHistoryValue("entity", "");
    setActiveEntityId("");
  };

  const exploreVenue = (nextVenue: string) => {
    pushHistoryValue("venuePage", nextVenue);
    setActiveVenue(nextVenue);
    setActiveEntityId("");
    setVenue("全部场馆");
    setQuery("");
    setDatePreset("all");
    setPersonalFilter("all");
    setDetailOpen(false);
  };

  const clearVenue = () => {
    pushHistoryValue("venuePage", "");
    setActiveVenue("");
  };

  return (
    <main className="app-shell">
      <header className="app-header" data-app-background>
        <div className="brand-block">
          <Music size={22} />
          <div><strong>古典乐演出日历</strong><span>全国演出 · 持续更新</span></div>
        </div>
        <div className="header-status">
          <a className="header-link" href="?sources=1">
            <Database size={14} />
            数据来源
          </a>
          <a className="header-link" href="?changes=1">
            <CircleAlert size={14} />
            变化历史
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
        data-app-background
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

      <section className="command-bar" data-app-background>
        <label className="global-search">
          <Search size={19} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索曲目、作曲家、音乐家、乐团或场馆" />
          {query ? <button onClick={() => setQuery("")} aria-label="清空搜索"><X size={16} /></button> : null}
        </label>
        <button ref={filterButtonRef} className="mobile-filter-button" onClick={() => setFiltersOpen(true)}>
          <Filter size={17} />筛选{activeFilterCount ? ` ${activeFilterCount}` : ""}
        </button>
      </section>

      <nav className="view-bar" aria-label="浏览方式" data-app-background>
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

      <section className="quick-actions" data-app-background aria-label="快捷操作">
        <button type="button" onClick={downloadFilteredIcs} disabled={!filteredEvents.length}>
          <Download size={15} />导出当前结果
        </button>
        <button
          type="button"
          className={personalFilter === "interested" ? "active" : ""}
          onClick={() => setPersonalFilter(personalFilter === "interested" ? "all" : "interested")}
        >
          <Star size={15} />想去 {Object.values(personalEvents).filter((status) => status === "interested").length}
        </button>
        <button
          type="button"
          className={personalFilter === "attended" ? "active" : ""}
          onClick={() => setPersonalFilter(personalFilter === "attended" ? "all" : "attended")}
        >
          <Check size={15} />已去 {Object.values(personalEvents).filter((status) => status === "attended").length}
        </button>
        {copyState ? <span role="status">{copyState}</span> : null}
      </section>

      {activeEntity ? (
        <section className="entity-context" data-app-background>
          <div>
            {activeEntity.type === "person" ? <UserRound size={18} /> : <Music size={18} />}
            <span><small>{activeEntity.type === "person" ? "音乐家" : "作品"}</small><strong>{activeEntity.name}</strong></span>
            {activeEntity.subtitle ? <em>{activeEntity.subtitle}</em> : null}
          </div>
          <button onClick={clearEntity}><X size={16} />退出关联页</button>
        </section>
      ) : null}

      {activeVenue ? (
        <section className="entity-context venue-context" data-app-background>
          <div>
            <Building2 size={18} />
            <span><small>场馆</small><strong>{activeVenue}</strong></span>
            <em>{dataset.events.filter((event) => event.venue === activeVenue).length} 场已收录</em>
          </div>
          <button onClick={clearVenue}><X size={16} />退出场馆页</button>
        </section>
      ) : null}

      <section className={`workspace ${viewMode === "calendar" ? "calendar-mode" : ""}`}>
        <aside
          ref={filterPanelRef}
          className={`control-panel ${filtersOpen ? "open" : ""}`}
          data-app-background
          role={filterModalActive ? "dialog" : undefined}
          aria-modal={filterModalActive ? "true" : undefined}
          aria-label="筛选演出"
        >
          <header className="filter-header">
            <span><SlidersHorizontal size={17} />筛选</span>
            <button ref={filterCloseRef} className="filter-close" onClick={() => setFiltersOpen(false)} aria-label="关闭筛选"><X size={19} /></button>
          </header>

          <FilterGroup label="日期">
            <div className="date-presets">
              {([
                ["all", "全部未来"],
                ["week", "本周"],
                ["weekend", "周末"],
                ["month", "本月"],
              ] as Array<[DatePreset, string]>).map(([value, label]) => (
                <button
                  key={value}
                  className={datePreset === value ? "active" : ""}
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
          <section className="event-list" aria-label="演出列表" data-app-background>
            {filteredEvents.length ? (
              <>
                {filteredEvents.slice(0, visibleCount).map((event) => (
                  <EventListRow
                    key={event.id}
                    event={event}
                    active={selectedId === event.id}
                    personalStatus={personalEvents[event.id]}
                    onSelect={selectEvent}
                  />
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
          <section data-app-background>
            <Suspense fallback={<section className="calendar-panel loading">正在加载日历</section>}>
              <CalendarView
                events={filteredEvents}
                selectedId={selectedId}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                onSelect={selectEvent}
              />
            </Suspense>
          </section>
        )}

        <EventDetail
          event={selectedDetail}
          loading={detailLoading}
          open={detailOpen}
          entitiesByKey={entitiesByKey}
          panelRef={detailPanelRef}
          closeButtonRef={detailCloseRef}
          onClose={() => setDetailOpen(false)}
          onExplore={exploreEntity}
          onExploreVenue={exploreVenue}
          onCopy={copySelectedEvent}
          onDownloadIcs={downloadSelectedEventIcs}
          personalStatus={selectedDetail ? personalEvents[selectedDetail.id] : undefined}
          onSetPersonalStatus={updatePersonalStatus}
        />
      </section>

    </main>
  );
}

const EventListRow = memo(function EventListRow({
  event,
  active,
  onSelect,
  personalStatus,
}: {
  event: ConcertEventSummary;
  active: boolean;
  personalStatus?: PersonalEventStatus;
  onSelect: (event: ConcertEventSummary) => void;
}) {
  const mainPerson = event.mainPerson;
  const eventLabel = [
    "查看演出详情",
    `${event.dateLabel} ${event.weekday}`,
    event.timeLabel,
    event.title,
    formatEventVenue(event),
  ].filter(Boolean).join("，");
  return (
    <button
      className={`event-card ${active ? "active" : ""}`}
      aria-label={eventLabel}
      aria-current={active ? "true" : undefined}
      onClick={() => onSelect(event)}
    >
      <div className="date-block"><strong>{event.dateLabel}</strong><span>{event.weekday}</span><time>{event.timeLabel}</time></div>
      <div className="event-main">
        <div className="event-title-row">
          <h2>{event.title}</h2>
          {personalStatus ? (
            <span className="personal-pill">{personalStatus === "interested" ? "想去" : "已去"}</span>
          ) : null}
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

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
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
  : rootParams.get("changes") === "1"
    ? <ChangesWorkspace />
  : rootParams.get("sources") === "1"
    ? <SourcesWorkspace />
    : <App />);
