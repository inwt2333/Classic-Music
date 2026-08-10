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
  Bell,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Building2,
  Database,
  Download,
  Filter,
  List as ListIcon,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  Music,
  Piano,
  Search,
  SlidersHorizontal,
  Star,
  Ticket,
  History,
  UserRound,
  X,
} from "lucide-react";
import EventDetail from "./components/EventDetail";
import BrandLogo from "./components/BrandLogo";
import AccountControl from "./components/AccountControl";
import ComposerPage from "./knowledge/components/ComposerPage";
import KnowledgeLibraryPage from "./knowledge/components/KnowledgeLibraryPage";
import WorkPage from "./knowledge/components/WorkPage";
import NotificationCenter from "./components/NotificationCenter";
import PersonalWorkspace from "./components/PersonalWorkspace";
import SavedFilterMenu from "./components/SavedFilterMenu";
import ChangesWorkspace from "./components/ChangesWorkspace";
import ReviewWorkspace from "./components/ReviewWorkspace";
import ReviewAccessGate from "./components/ReviewAccessGate";
import SourcesWorkspace from "./components/SourcesWorkspace";
import UpdatesWorkspace from "./components/UpdatesWorkspace";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import {
  loadChanges,
  loadEntities,
  loadEventDetail,
  loadEventIndex,
  loadKnowledgeComposer,
  loadKnowledgeIndex,
  loadKnowledgeWork,
} from "./data";
import {
  buildFollowNotifications,
  buildSavedFilterName,
  detectDataIssues,
  isFollowTargetActive,
  latestChangesByEvent,
  makeFollowTarget,
  mergeFollowNotificationHistory,
  recentChangeLabel,
  removeSavedFilter,
  saveFilter,
  sortConcerts,
  toggleFollow,
  type FollowTarget,
  type SavedFilter,
  type SavedFilterState,
  type SortMode,
} from "./discovery-features";
import {
  copyEventText,
  downloadEventsIcs,
  expandSearchQuery,
  matchesExpandedSearch,
  type PersonalEventStatus,
} from "./product-features";
import { usePersonalEvents } from "./use-personal-events";
import { useUserPreferences } from "./use-user-preferences";
import "./styles.css";
import type {
  ConcertEvent,
  ConcertEventSummary,
  ConcertIndexDataset,
  ChangeDataset,
  EntityDataset,
  EntityRecord,
} from "./types";
import type { KnowledgeIndex, KnowledgeLibraryView, PublishedKnowledgeComposer, PublishedKnowledgeWork } from "./knowledge/types";
import { isKnowledgeCollectionKey, type KnowledgeCollectionKey } from "./knowledge/collections";
import {
  dateMatchesPreset,
  formatEventVenue,
  getInitialCalendarMonth,
  normalizeEnsembleName,
  normalizeVenueName,
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
    smallSrc: `${import.meta.env.BASE_URL}images/concert-orchestra-small.webp`,
    position: "center 46%",
    eyebrow: "全国古典乐演出日历",
    title: "今夜，去听一场音乐会",
    caption: "从乐团、场馆与曲目出发，发现下一次现场聆听。",
  },
  {
    src: `${import.meta.env.BASE_URL}images/concert-violin.webp`,
    smallSrc: `${import.meta.env.BASE_URL}images/concert-violin-small.webp`,
    position: "center 58%",
    eyebrow: "独奏与室内乐",
    title: "靠近舞台，也靠近音乐",
    caption: "按日期梳理演出，让值得期待的现场不再错过。",
  },
  {
    src: `${import.meta.env.BASE_URL}images/concert-piano-hall.webp`,
    smallSrc: `${import.meta.env.BASE_URL}images/concert-piano-hall-small.webp`,
    position: "center 55%",
    eyebrow: "音乐厅现场",
    title: "在城市里，留一段时间给音乐",
    caption: "查看曲目、音乐家与场馆信息，再决定今晚去哪里。",
  },
] as const;

function App() {
  const auth = useAuth();
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [dataset, setDataset] = useState(emptyDataset);
  const [entities, setEntities] = useState(emptyEntities);
  const [changes, setChanges] = useState<ChangeDataset | null>(null);
  const [loadState, setLoadState] = useState("正在加载演出");
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
  const [sortMode, setSortMode] = useState<SortMode>((initialParams.get("sort") as SortMode) || "time");
  const [viewMode, setViewMode] = useState<ViewMode>(initialParams.get("view") === "calendar" ? "calendar" : "list");
  const [selectedId, setSelectedId] = useState(initialParams.get("event") ?? "");
  const [selectedDetail, setSelectedDetail] = useState<ConcertEvent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(Boolean(initialParams.get("event")));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [activeEntityId, setActiveEntityId] = useState(initialParams.get("entity") ?? "");
  const [activeVenue, setActiveVenue] = useState(initialParams.get("venuePage") ?? "");
  const [activeWorkId, setActiveWorkId] = useState(initialParams.get("work") ?? "");
  const [activeWork, setActiveWork] = useState<PublishedKnowledgeWork | null>(null);
  const [workLoading, setWorkLoading] = useState(Boolean(initialParams.get("work")));
  const [workError, setWorkError] = useState("");
  const [knowledgeLibraryOpen, setKnowledgeLibraryOpen] = useState(initialParams.get("knowledge") === "works");
  const [knowledgeLibraryView, setKnowledgeLibraryView] = useState<KnowledgeLibraryView>(() => {
    const value = initialParams.get("library");
    return value === "collections" || value === "composers" || value === "works" ? value : "explore";
  });
  const [knowledgeCollectionKey, setKnowledgeCollectionKey] = useState<KnowledgeCollectionKey | "">(() => {
    const value = initialParams.get("collection");
    return isKnowledgeCollectionKey(value) ? value : "";
  });
  const [knowledgeIndex, setKnowledgeIndex] = useState<KnowledgeIndex | null>(null);
  const [activeComposerId, setActiveComposerId] = useState(initialParams.get("composer") ?? "");
  const [activeComposer, setActiveComposer] = useState<PublishedKnowledgeComposer | null>(null);
  const [composerLoading, setComposerLoading] = useState(Boolean(initialParams.get("composer")));
  const [composerError, setComposerError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [coverIndex, setCoverIndex] = useState(0);
  const [loadedCoverIndexes, setLoadedCoverIndexes] = useState(() => new Set([0]));
  const [coverPaused, setCoverPaused] = useState(false);
  const personalEventStore = usePersonalEvents(auth.user?.id);
  const personalEvents = personalEventStore.events;
  const {
    follows,
    readNotificationIds,
    notificationHistory,
    dismissedNotificationIds,
    savedFilters,
    syncError: userPreferencesSyncError,
    updateFollows,
    updateSavedFilters,
    updateNotificationHistory,
    updateReadNotificationIds,
    updateDismissedNotificationIds,
  } = useUserPreferences(auth.user?.id);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [copyState, setCopyState] = useState("");
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterCloseRef = useRef<HTMLButtonElement | null>(null);
  const filterPanelRef = useRef<HTMLElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const detailReturnWorkIdRef = useRef("");
  const workTriggerRef = useRef<HTMLElement | null>(null);
  const workReturnEventIdRef = useRef("");
  const workReturnLibraryRef = useRef<{ view: KnowledgeLibraryView; collectionKey: KnowledgeCollectionKey | "" } | null>(null);
  const restoreWorkTriggerRef = useRef(false);
  const filtersWereOpenRef = useRef(false);
  const filterIsModal = useMediaQuery("(max-width: 760px)");
  const detailIsModal = useMediaQuery("(max-width: 1200px)");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("zh-CN"));
  const filterModalActive = filtersOpen && filterIsModal;
  const detailModalActive = detailOpen && detailIsModal;

  useEffect(() => {
    const userId = auth.user?.id;
    setNotificationOpen(false);
    if (!userId) setPersonalFilter("all");
  }, [auth.user?.id]);

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
    const nextIndex = (coverIndex + 1) % coverSlides.length;
    if (loadedCoverIndexes.has(nextIndex)) return;

    let image: HTMLImageElement | null = null;
    const timer = window.setTimeout(() => {
      image = new Image();
      image.srcset = `${coverSlides[nextIndex].smallSrc} 960w, ${coverSlides[nextIndex].src} 2000w`;
      image.sizes = "100vw";
      image.onload = () => {
        setLoadedCoverIndexes((current) => {
          if (current.has(nextIndex)) return current;
          const next = new Set(current);
          next.add(nextIndex);
          return next;
        });
      };
      image.src = coverSlides[nextIndex].src;
    }, 1800);

    return () => {
      window.clearTimeout(timer);
      if (image) image.onload = null;
    };
  }, [coverIndex, loadedCoverIndexes]);

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
    if (!detailOpen && !detailReturnWorkIdRef.current) detailTriggerRef.current?.focus();
  }, [detailModalActive, detailOpen]);

  useEffect(() => {
    if (activeWorkId || !restoreWorkTriggerRef.current) return;
    restoreWorkTriggerRef.current = false;
    window.requestAnimationFrame(() => {
      const workId = workTriggerRef.current?.dataset.knowledgeWorkId;
      const currentTrigger = workId
        ? document.querySelector<HTMLElement>(`[data-knowledge-work-id="${workId}"]`)
        : workTriggerRef.current;
      currentTrigger?.focus();
    });
  }, [activeWorkId]);

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
      else if (detailModalActive) closeDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailModalActive, filterModalActive]);

  useEffect(() => {
    let cancelled = false;
    let supplementalTimer = 0;

    const loadSupplementalData = async () => {
      const loadEntityData = () => loadEntities()
        .then((data) => {
          if (!cancelled) setEntities(data);
        })
        .catch(() => {
          if (!cancelled) setEntities(emptyEntities);
        });
      const loadChangeData = () => loadChanges()
        .then((data) => {
          if (!cancelled) setChanges(data);
        })
        .catch(() => {
          if (!cancelled) setChanges(null);
        });

      if (activeEntityId) {
        await loadEntityData();
        await loadChangeData();
      } else {
        await loadChangeData();
        await loadEntityData();
      }
    };

    loadEventIndex()
      .then((data) => {
        if (cancelled) return;
        setDataset(data);
        setCalendarMonth(getInitialCalendarMonth(data.events));
        supplementalTimer = window.setTimeout(() => void loadSupplementalData(), 200);
      })
      .catch((error) => {
        if (!cancelled) setLoadState("演出数据暂时无法载入");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(supplementalTimer);
    };
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
      setSortMode((params.get("sort") as SortMode) || "time");
      setViewMode(params.get("view") === "calendar" ? "calendar" : "list");
      const nextEventId = params.get("event") ?? "";
      const nextWorkId = params.get("work") ?? "";
      detailReturnWorkIdRef.current = "";
      workReturnEventIdRef.current = "";
      workReturnLibraryRef.current = null;
      restoreWorkTriggerRef.current = false;
      setSelectedId(nextEventId);
      setActiveEntityId(params.get("entity") ?? "");
      setActiveVenue(params.get("venuePage") ?? "");
      setActiveWorkId(nextWorkId);
      setKnowledgeLibraryOpen(params.get("knowledge") === "works");
      const nextLibraryView = params.get("library");
      setKnowledgeLibraryView(nextLibraryView === "collections" || nextLibraryView === "composers" || nextLibraryView === "works" ? nextLibraryView : "explore");
      const nextCollection = params.get("collection");
      setKnowledgeCollectionKey(isKnowledgeCollectionKey(nextCollection) ? nextCollection : "");
      setActiveComposerId(params.get("composer") ?? "");
      setDetailOpen(Boolean(nextEventId));
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
    if (detailIsModal && !detailOpen) {
      setDetailLoading(false);
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
  }, [detailIsModal, detailOpen, selectedSummary]);

  useEffect(() => {
    if (!activeWorkId) {
      setActiveWork(null);
      setWorkLoading(false);
      setWorkError("");
      return;
    }
    let cancelled = false;
    setWorkLoading(true);
    setWorkError("");
    loadKnowledgeWork(activeWorkId)
      .then((work) => {
        if (!cancelled) setActiveWork(work);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveWork(null);
        setWorkError("作品资料暂时无法载入，请返回演出列表后重试。");
      })
      .finally(() => {
        if (!cancelled) setWorkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkId]);

  useEffect(() => {
    if (!activeComposerId) {
      setActiveComposer(null);
      setComposerLoading(false);
      setComposerError("");
      return;
    }
    let cancelled = false;
    setComposerLoading(true);
    setComposerError("");
    loadKnowledgeComposer(activeComposerId)
      .then((composer) => {
        if (!cancelled) setActiveComposer(composer);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveComposer(null);
        setComposerError("作曲家资料暂时无法载入，请返回作品库后重试。");
      })
      .finally(() => {
        if (!cancelled) setComposerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeComposerId]);

  useEffect(() => {
    const selectedHasKnowledge = selectedDetail?.program.some((item) => item.knowledgeWorkId) ?? false;
    if (knowledgeIndex || (!activeWorkId && !activeComposerId && !knowledgeLibraryOpen && !selectedHasKnowledge)) return;
    let cancelled = false;
    loadKnowledgeIndex()
      .then((index) => {
        if (!cancelled) setKnowledgeIndex(index);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeComposerId, activeWorkId, knowledgeIndex, knowledgeLibraryOpen, selectedDetail]);

  const cities = useMemo(
    () => ["全部城市", ...Array.from(new Set(dataset.events.map((event) => event.city))).sort()],
    [dataset.events],
  );
  const venues = useMemo(
    () => [
      "全部场馆",
      ...Array.from(
        new Set(dataset.events.filter((event) => city === "全部城市" || event.city === city).map((event) => normalizeVenueName(event.venue))),
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
  const allEntities = useMemo(() => {
    const syntheticEnsembles: EntityRecord[] = ensembles.slice(1).map((name) => {
      const eventIds = dataset.events
        .filter((event) => normalizeEnsembleLabel(event.ensemble) === name)
        .map((event) => event.id);
      return {
        id: `ensemble:${name}`,
        type: "ensemble",
        name,
        aliases: [],
        eventIds,
        upcomingEventCount: eventIds.length,
      };
    });
    return [...entities.entities, ...syntheticEnsembles];
  }, [dataset.events, ensembles, entities.entities]);
  const activeEntity = useMemo(
    () => allEntities.find((entity) => entity.id === activeEntityId) ?? null,
    [activeEntityId, allEntities],
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
      if (venue !== "全部场馆" && normalizeVenueName(event.venue) !== venue) return false;
      if (ensemble !== "全部乐团" && normalizeEnsembleLabel(event.ensemble) !== ensemble) return false;
      if (genre !== "全部类型" && !event.genres.includes(genre)) return false;
      if (hasProgram && !event.hasProgram) return false;
      if (personalFilter !== "all" && personalEvents[event.id] !== personalFilter) return false;
      if (activeEntityEvents && !activeEntityEvents.has(event.id)) return false;
      if (activeVenue && normalizeVenueName(event.venue) !== activeVenue) return false;
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

  const changesByEvent = useMemo(() => latestChangesByEvent(changes), [changes]);
  const displayedEvents = useMemo(
    () => sortConcerts(filteredEvents, sortMode, changesByEvent),
    [changesByEvent, filteredEvents, sortMode],
  );
  const generatedNotifications = useMemo(
    () => buildFollowNotifications(changes, dataset.events, follows, readNotificationIds),
    [changes, dataset.events, follows, readNotificationIds],
  );
  const notifications = useMemo(
    () => mergeFollowNotificationHistory(
      notificationHistory,
      generatedNotifications,
      readNotificationIds,
      dismissedNotificationIds,
    ),
    [dismissedNotificationIds, generatedNotifications, notificationHistory, readNotificationIds],
  );
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
  useEffect(() => {
    if (!auth.user) return;
    if (JSON.stringify(notificationHistory) === JSON.stringify(notifications)) return;
    updateNotificationHistory(notifications);
  }, [auth.user, notificationHistory, notifications, updateNotificationHistory]);
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [activeEntityId, activeVenue, city, datePreset, deferredQuery, ensemble, genre, hasProgram, personalFilter, sortMode, venue]);

  useEffect(() => {
    if (!detailOpen || !selectedId || !filteredEvents.length) return;
    if (!filteredEvents.some((event) => event.id === selectedId)) setSelectedId(filteredEvents[0].id);
  }, [detailOpen, filteredEvents, selectedId]);

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
    if (sortMode !== "time") params.set("sort", sortMode);
    if (viewMode === "calendar") params.set("view", viewMode);
    if (detailOpen && selectedId) params.set("event", selectedId);
    if (activeEntityId) params.set("entity", activeEntityId);
    if (activeVenue) params.set("venuePage", activeVenue);
    if (activeWorkId) params.set("work", activeWorkId);
    if (knowledgeLibraryOpen) {
      params.set("knowledge", "works");
      if (knowledgeLibraryView !== "explore") params.set("library", knowledgeLibraryView);
      if (knowledgeLibraryView === "collections" && knowledgeCollectionKey) params.set("collection", knowledgeCollectionKey);
    }
    if (activeComposerId) params.set("composer", activeComposerId);
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [activeComposerId, activeEntityId, activeVenue, activeWorkId, city, datePreset, detailOpen, ensemble, genre, hasProgram, knowledgeCollectionKey, knowledgeLibraryOpen, knowledgeLibraryView, personalFilter, query, selectedId, sortMode, venue, viewMode]);

  const entitiesByKey = useMemo(() => {
    const map = new Map<string, EntityRecord>();
    for (const entity of allEntities) {
      map.set(`${entity.type}:${entity.type === "work" ? entity.id : entity.name}`, entity);
      if (entity.type === "person") {
        for (const alias of entity.aliases) map.set(`person:${alias}`, entity);
      }
    }
    for (const event of dataset.events) {
      if (!event.ensemble) continue;
      const normalized = normalizeEnsembleLabel(event.ensemble);
      const entity = normalized ? map.get(`ensemble:${normalized}`) : undefined;
      if (entity) map.set(`ensemble:${event.ensemble}`, entity);
    }
    return map;
  }, [allEntities, dataset.events]);

  const knowledgeWorksById = useMemo(
    () => new Map((knowledgeIndex?.works ?? []).map((work) => [work.id, work])),
    [knowledgeIndex],
  );

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

  const requireAccount = (reason: string) => {
    if (auth.user) return true;
    auth.requestSignIn(reason);
    return false;
  };

  const updatePersonalStatus = (event: ConcertEvent, status: PersonalEventStatus | null) => {
    if (!requireAccount("登录后才能标记想去或已购。")) return;
    personalEventStore.updateStatus(event, status);
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
    downloadEventsIcs(displayedEvents, "classic-music-filtered-events");
  };

  const updateFollow = (target: FollowTarget) => {
    if (!requireAccount("登录后才能关注作品、音乐家、乐团或场馆。")) return;
    updateFollows((current) => toggleFollow(current, target));
  };

  const markAllNotificationsRead = () => {
    if (!auth.user) return;
    const next = Array.from(new Set([...readNotificationIds, ...notifications.map((item) => item.id)]));
    updateReadNotificationIds(next);
  };

  const markNotificationRead = (id: string) => {
    if (!auth.user) return;
    if (readNotificationIds.includes(id)) return;
    const next = [...readNotificationIds, id];
    updateReadNotificationIds(next);
  };

  const deleteNotification = (id: string) => {
    if (!auth.user) return;
    updateDismissedNotificationIds((current) => {
      const next = Array.from(new Set([...current, id]));
      return next;
    });
    updateNotificationHistory((current) => {
      const next = current.filter((item) => item.id !== id);
      return next;
    });
  };

  const saveCurrentFilter = () => {
    if (!requireAccount("登录后才能保存和管理筛选方案。")) return;
    const state: SavedFilterState = { query, datePreset, city, venue, ensemble, genre, hasProgram, sortMode };
    updateSavedFilters((current) => saveFilter(current, state, buildSavedFilterName(state)));
    setCopyState("筛选方案已保存");
    window.setTimeout(() => setCopyState(""), 1800);
  };

  const applySavedFilter = (filter: SavedFilter) => {
    setQuery(filter.query);
    setDatePreset(filter.datePreset);
    setCity(filter.city);
    setVenue(filter.venue);
    setEnsemble(filter.ensemble);
    setGenre(filter.genre);
    setHasProgram(filter.hasProgram);
    setSortMode(filter.sortMode);
    setActiveEntityId("");
    setActiveVenue("");
  };

  const shareSelectedEvent = async (event: ConcertEvent) => {
    try {
      const { createEventShareCard } = await import("./share-card");
      const eventUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
      eventUrl.searchParams.set("event", event.id);
      const blob = await createEventShareCard(event, eventUrl.toString());
      const filename = `${event.dateLabel.replace("/", "")}-${event.title.slice(0, 24)}.png`;
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopyState("分享卡片已复制到剪贴板");
          window.setTimeout(() => setCopyState(""), 2200);
          return;
        } catch {
          // Some browsers expose the API but block image clipboard writes.
        }
      }

      {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      setCopyState("浏览器不支持复制图片，已下载卡片");
      window.setTimeout(() => setCopyState(""), 2600);
    } catch (error) {
      setCopyState("分享卡片生成失败");
      window.setTimeout(() => setCopyState(""), 2200);
    }
  };

  const selectEvent = (event: ConcertEventSummary) => {
    detailReturnWorkIdRef.current = "";
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pushHistoryValue("event", event.id);
    setSelectedId(event.id);
    setDetailOpen(true);
  };

  const exploreWork = (workId: string) => {
    workTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    workReturnEventIdRef.current = detailOpen ? selectedId : "";
    workReturnLibraryRef.current = null;
    restoreWorkTriggerRef.current = false;
    const params = new URLSearchParams(window.location.search);
    params.delete("event");
    params.delete("entity");
    params.delete("venuePage");
    params.delete("knowledge");
    params.delete("composer");
    params.set("work", workId);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setActiveWorkId(workId);
    setActiveEntityId("");
    setActiveVenue("");
    setKnowledgeLibraryOpen(false);
    setActiveComposerId("");
    setDetailOpen(false);
  };

  const closeWork = () => {
    const returnEventId = workReturnEventIdRef.current;
    workReturnEventIdRef.current = "";
    restoreWorkTriggerRef.current = true;
    if (returnEventId) {
      workReturnLibraryRef.current = null;
      const params = new URLSearchParams(window.location.search);
      params.delete("work");
      params.set("event", returnEventId);
      window.history.pushState(null, "", `${window.location.pathname}?${params}`);
      setActiveWorkId("");
      setSelectedId(returnEventId);
      setDetailOpen(true);
      return;
    }
    const libraryReturn = workReturnLibraryRef.current;
    workReturnLibraryRef.current = null;
    const params = new URLSearchParams(window.location.search);
    params.delete("work");
    params.set("knowledge", "works");
    if (libraryReturn && libraryReturn.view !== "explore") params.set("library", libraryReturn.view);
    if (libraryReturn?.view === "collections" && libraryReturn.collectionKey) params.set("collection", libraryReturn.collectionKey);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setActiveWorkId("");
    setKnowledgeLibraryOpen(true);
    if (libraryReturn) {
      setKnowledgeLibraryView(libraryReturn.view);
      setKnowledgeCollectionKey(libraryReturn.collectionKey);
    }
  };

  const openKnowledgeLibrary = () => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["event", "entity", "venuePage", "work", "composer", "library", "collection"]) params.delete(key);
    params.set("knowledge", "works");
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setKnowledgeLibraryOpen(true);
    setKnowledgeLibraryView("explore");
    setKnowledgeCollectionKey("");
    setActiveComposerId("");
    setActiveWorkId("");
    setActiveEntityId("");
    setActiveVenue("");
    setDetailOpen(false);
  };

  const closeKnowledgeLibrary = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("knowledge");
    params.delete("library");
    params.delete("collection");
    window.history.pushState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    setKnowledgeLibraryOpen(false);
  };

  const openLibraryWork = (workId: string) => {
    if (knowledgeLibraryOpen) {
      workReturnLibraryRef.current = { view: knowledgeLibraryView, collectionKey: knowledgeCollectionKey };
    } else if (activeComposerId) {
      workReturnLibraryRef.current = { view: "composers", collectionKey: "" };
    }
    workReturnEventIdRef.current = "";
    const params = new URLSearchParams(window.location.search);
    params.delete("knowledge");
    params.delete("composer");
    params.delete("collection");
    params.set("work", workId);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setKnowledgeLibraryOpen(false);
    setActiveComposerId("");
    setActiveWorkId(workId);
  };

  const openComposer = (composerId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.delete("knowledge");
    params.delete("work");
    params.delete("event");
    params.delete("collection");
    params.set("composer", composerId);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setKnowledgeLibraryOpen(false);
    setActiveWorkId("");
    setActiveComposerId(composerId);
    setDetailOpen(false);
  };

  const closeComposer = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("composer");
    params.set("knowledge", "works");
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setActiveComposerId("");
    setKnowledgeLibraryOpen(true);
  };

  const openComposerEvent = (event: ConcertEventSummary) => {
    const params = new URLSearchParams(window.location.search);
    params.delete("composer");
    params.set("event", event.id);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setActiveComposerId("");
    setSelectedId(event.id);
    setDetailOpen(true);
  };

  const openKnowledgeEvent = (event: ConcertEventSummary) => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["knowledge", "library", "collection", "work", "composer"]) params.delete(key);
    params.set("event", event.id);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setKnowledgeLibraryOpen(false);
    setKnowledgeCollectionKey("");
    setActiveWorkId("");
    setActiveComposerId("");
    setSelectedId(event.id);
    setDetailOpen(true);
  };

  const openWorkEvent = (event: ConcertEventSummary) => {
    detailReturnWorkIdRef.current = activeWorkId;
    detailTriggerRef.current = null;
    restoreWorkTriggerRef.current = false;
    const params = new URLSearchParams(window.location.search);
    params.delete("work");
    params.set("event", event.id);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setActiveWorkId("");
    setSelectedId(event.id);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    const returnWorkId = detailReturnWorkIdRef.current;
    if (!returnWorkId) {
      setDetailOpen(false);
      return;
    }

    detailReturnWorkIdRef.current = "";
    const params = new URLSearchParams(window.location.search);
    params.delete("event");
    params.set("work", returnWorkId);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setDetailOpen(false);
    setActiveWorkId(returnWorkId);
  };

  const exploreEntity = (entity: EntityRecord) => {
    pushHistoryValue("entity", entity.id);
    setActiveEntityId(entity.id);
    setActiveVenue("");
    setActiveWorkId("");
    setActiveComposerId("");
    setKnowledgeLibraryOpen(false);
    setQuery("");
    setDatePreset("all");
    setDetailOpen(false);
  };

  const clearEntity = () => {
    pushHistoryValue("entity", "");
    setActiveEntityId("");
  };

  const exploreVenue = (nextVenue: string) => {
    const normalizedVenue = normalizeVenueName(nextVenue);
    pushHistoryValue("venuePage", normalizedVenue);
    setActiveVenue(normalizedVenue);
    setActiveEntityId("");
    setActiveWorkId("");
    setActiveComposerId("");
    setKnowledgeLibraryOpen(false);
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

  const activeEntityTarget = activeEntity
    ? makeFollowTarget(activeEntity.type === "ensemble" ? "ensemble" : activeEntity.type, activeEntity.name, activeEntity.id)
    : null;
  const activeVenueTarget = activeVenue ? makeFollowTarget("venue", activeVenue) : null;
  const activeWorkTarget = activeWork ? makeFollowTarget("work", activeWork.title, activeWork.id) : null;
  const activeComposerTarget = activeComposer
    ? makeFollowTarget("composer", activeComposer.name, activeComposer.id, activeComposer.aliases)
    : null;
  const relatedWorks = activeWork?.relatedWorkIds
    .map((id) => knowledgeWorksById.get(id))
    .filter((work): work is NonNullable<typeof work> => Boolean(work)) ?? [];

  return (
    <main className="app-shell">
      <header className="app-header" data-app-background>
        <div className="brand-block">
          <BrandLogo />
          <div><strong>古典乐演出日历</strong><span>全国演出 · 持续更新</span></div>
        </div>
        <div className="header-status">
          <button className="header-link" type="button" onClick={openKnowledgeLibrary} title="作品库" aria-label="作品库">
            <BookOpenText size={14} />
            作品库
          </button>
          <a className="header-link header-aux-link" href="?sources=1" title="数据来源" aria-label="数据来源">
            <Database size={14} />
            数据来源
          </a>
          <a className="header-link header-aux-link" href="?changes=1" title="变化历史" aria-label="变化历史">
            <CircleAlert size={14} />
            变化历史
          </a>
          <a className="header-link header-aux-link" href="?updates=1" title="更新日志" aria-label="更新日志">
            <History size={14} />
            更新日志
          </a>
          <AccountControl authenticatedHref="?profile=1" />
          <button className="header-link notification-button" type="button" onClick={() => {
            if (requireAccount("登录后才能查看更新提醒。")) setNotificationOpen(true);
          }} title="消息提醒" aria-label="消息提醒">
            <Bell size={14} />
            消息
            {unreadNotificationCount ? <b>{unreadNotificationCount}</b> : null}
          </button>
          <details className="header-more">
            <summary className="header-link" title="更多页面" aria-label="更多页面"><MoreHorizontal size={17} /><span>更多</span></summary>
            <nav>
              <a href="?sources=1"><Database size={15} />数据来源</a>
              <a href="?changes=1"><CircleAlert size={15} />变化历史</a>
              <a href="?updates=1"><History size={15} />更新日志</a>
            </nav>
          </details>
          <span>
            <Check size={14} />
            {dataset.generatedAt
              ? `数据更新时间：${formatDatasetTimestamp(dataset.generatedAt)}`
              : loadState}
          </span>
          <small>
            {dataset.events.length} 场 · {dataset.sources.length} 个来源
          </small>
        </div>
      </header>

      {activeWorkId ? (
        <WorkPage
          work={activeWork}
          loading={workLoading}
          error={workError}
          events={dataset.events.filter((event) => activeWork?.upcomingEventIds.includes(event.id))}
          onBack={closeWork}
          backLabel={workReturnEventIdRef.current ? "返回演出" : workReturnLibraryRef.current?.view === "collections" ? "返回精选专题" : "返回作品库"}
          onOpenEvent={openWorkEvent}
          onOpenComposer={openComposer}
          onOpenRelatedWork={openLibraryWork}
          relatedWorks={relatedWorks}
          followed={activeWorkTarget ? isFollowTargetActive(follows, activeWorkTarget) : false}
          onToggleFollow={() => {
            if (activeWorkTarget) updateFollow(activeWorkTarget);
          }}
        />
      ) : activeComposerId ? (
        <ComposerPage
          composer={activeComposer}
          loading={composerLoading}
          error={composerError}
          events={dataset.events.filter((event) => activeComposer?.upcomingEventIds.includes(event.id))}
          onBack={closeComposer}
          onOpenWork={openLibraryWork}
          onOpenEvent={openComposerEvent}
          followed={activeComposerTarget ? isFollowTargetActive(follows, activeComposerTarget) : false}
          onToggleFollow={() => {
            if (activeComposerTarget) updateFollow(activeComposerTarget);
          }}
        />
      ) : knowledgeLibraryOpen ? (
        <KnowledgeLibraryPage
          view={knowledgeLibraryView}
          collectionKey={knowledgeCollectionKey}
          events={dataset.events}
          onViewChange={(nextView) => {
            setKnowledgeLibraryView(nextView);
            if (nextView !== "collections") setKnowledgeCollectionKey("");
          }}
          onCollectionChange={setKnowledgeCollectionKey}
          onOpenWork={openLibraryWork}
          onOpenComposer={openComposer}
          onOpenEvent={openKnowledgeEvent}
          onBack={closeKnowledgeLibrary}
        />
      ) : (
        <>
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
          {coverSlides.map((slide, index) => loadedCoverIndexes.has(index) || index === coverIndex ? (
            <img
              key={slide.src}
              className={index === coverIndex ? "active" : ""}
              src={slide.src}
              srcSet={`${slide.smallSrc} 960w, ${slide.src} 2000w`}
              sizes="100vw"
              style={{ objectPosition: slide.position }}
              alt=""
              loading={index === coverIndex ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "low"}
              decoding="async"
            />
          ) : null)}
        </div>
        <div className="cover-shade" aria-hidden="true" />
        <div className="cover-musical-motif" aria-hidden="true">
          <span className="motif-ring motif-ring-outer" />
          <span className="motif-ring motif-ring-middle" />
          <span className="motif-ring motif-ring-inner" />
          <span className="motif-staff" />
          <Piano className="motif-instrument" size={44} strokeWidth={1.25} />
          <span className="motif-note">♪</span>
        </div>
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
        <div className="view-summary">
          <label className="sort-control">
            <span>排序</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="time">演出时间</option>
              <option value="updated">最近更新</option>
              <option value="price">最低票价</option>
              <option value="program">节目单完整度</option>
            </select>
          </label>
          <span>{filteredEvents.length} 场匹配</span>
        </div>
      </nav>

      <section className="quick-actions" data-app-background aria-label="快捷操作">
        <button type="button" onClick={downloadFilteredIcs} disabled={!filteredEvents.length}>
          <Download size={15} />导出当前结果
        </button>
        <button
          type="button"
          className={personalFilter === "interested" ? "active" : ""}
          onClick={() => {
            if (requireAccount("登录后才能查看想去的演出。")) setPersonalFilter(personalFilter === "interested" ? "all" : "interested");
          }}
        >
          <Star size={15} />想去 {Object.values(personalEvents).filter((status) => status === "interested").length}
        </button>
        <button
          type="button"
          className={personalFilter === "attended" ? "active" : ""}
          onClick={() => {
            if (requireAccount("登录后才能查看已购的演出。")) setPersonalFilter(personalFilter === "attended" ? "all" : "attended");
          }}
        >
          <Check size={15} />已购 {Object.values(personalEvents).filter((status) => status === "attended").length}
        </button>
        <SavedFilterMenu
          filters={savedFilters}
          authenticated={Boolean(auth.user)}
          onSave={saveCurrentFilter}
          onApply={applySavedFilter}
          onRemove={(id) => updateSavedFilters((current) => removeSavedFilter(current, id))}
          onRequireLogin={() => auth.requestSignIn("登录后才能保存和管理筛选方案。")}
        />
        {copyState ? <span role="status">{copyState}</span> : null}
        {personalEventStore.syncError || userPreferencesSyncError ? <span role="alert">{personalEventStore.syncError || userPreferencesSyncError}</span> : null}
      </section>

      {activeEntity ? (
        <section className="entity-context" data-app-background>
          <div>
            {activeEntity.type === "person" ? <UserRound size={18} /> : activeEntity.type === "ensemble" ? <Building2 size={18} /> : <Music size={18} />}
            <span><small>{activeEntity.type === "person" ? "音乐家" : activeEntity.type === "ensemble" ? "乐团" : "作品"}</small><strong>{activeEntity.name}</strong></span>
            {activeEntity.subtitle ? <em>{activeEntity.subtitle}</em> : null}
            <em>{activeEntity.upcomingEventCount} 场未来演出{activeEntity.aliases.length ? ` · 别名 ${activeEntity.aliases.slice(0, 3).join("、")}` : ""}</em>
          </div>
          <div className="entity-context-actions">
            {activeEntityTarget ? (
              <button className={isFollowTargetActive(follows, activeEntityTarget) ? "active" : ""} onClick={() => updateFollow(activeEntityTarget)}>
                <Bell size={16} />{isFollowTargetActive(follows, activeEntityTarget) ? "已关注" : "关注"}
              </button>
            ) : null}
            <button onClick={clearEntity}><X size={16} />退出关联页</button>
          </div>
        </section>
      ) : null}

      {activeVenue ? (
        <section className="entity-context venue-context" data-app-background>
          <div>
            <Building2 size={18} />
            <span><small>场馆</small><strong>{activeVenue}</strong></span>
            <em>{dataset.events.filter((event) => normalizeVenueName(event.venue) === activeVenue).length} 场已收录</em>
          </div>
          <div className="entity-context-actions">
            <a href={`https://uri.amap.com/search?keyword=${encodeURIComponent(activeVenue)}`} target="_blank" rel="noreferrer"><MapPin size={16} />地图交通</a>
            {activeVenueTarget ? (
              <button className={isFollowTargetActive(follows, activeVenueTarget) ? "active" : ""} onClick={() => updateFollow(activeVenueTarget)}>
                <Bell size={16} />{isFollowTargetActive(follows, activeVenueTarget) ? "已关注" : "关注"}
              </button>
            ) : null}
            <button onClick={clearVenue}><X size={16} />退出场馆页</button>
          </div>
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
            {!dataset.generatedAt && loadState === "正在加载演出" ? (
              <div className="empty-results loading-state" aria-live="polite">
                <LoaderCircle className="spin" size={28} /><h2>正在加载演出</h2><p>请稍候。</p>
              </div>
            ) : loadState === "演出数据暂时无法载入" && !dataset.events.length ? (
              <div className="empty-results load-failure" role="alert">
                <CircleAlert size={28} /><h2>演出暂时无法载入</h2><p>请检查网络连接后重新加载。</p>
                <button type="button" onClick={() => window.location.reload()}>重新加载</button>
              </div>
            ) : filteredEvents.length ? (
              <>
                {displayedEvents.slice(0, visibleCount).map((event) => (
                  <EventListRow
                    key={event.id}
                    event={event}
                    active={selectedId === event.id}
                    personalStatus={personalEvents[event.id]}
                    onSelect={selectEvent}
                    changeLabel={recentChangeLabel(changesByEvent.get(event.id), dataset.generatedAt)}
                    hasDataIssue={detectDataIssues(event).length > 0}
                  />
                ))}
                {visibleCount < displayedEvents.length ? (
                  <button className="load-more" onClick={() => setVisibleCount((count) => count + pageSize)}>
                    显示更多 <span>{displayedEvents.length - visibleCount}</span>
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
            {!dataset.generatedAt && loadState === "正在加载演出" ? (
              <div className="empty-results loading-state" aria-live="polite">
                <LoaderCircle className="spin" size={28} /><h2>正在加载演出</h2><p>请稍候。</p>
              </div>
            ) : loadState === "演出数据暂时无法载入" && !dataset.events.length ? (
              <div className="empty-results load-failure" role="alert">
                <CircleAlert size={28} /><h2>演出暂时无法载入</h2><p>请检查网络连接后重新加载。</p>
                <button type="button" onClick={() => window.location.reload()}>重新加载</button>
              </div>
            ) :
            <Suspense fallback={<section className="calendar-panel loading">正在加载日历</section>}>
              <CalendarView
                events={displayedEvents}
                selectedId={selectedId}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                onSelect={selectEvent}
              />
            </Suspense>}
          </section>
        )}

        <EventDetail
          event={selectedDetail}
          loading={detailLoading}
          open={detailOpen}
          modal={detailModalActive}
          entitiesByKey={entitiesByKey}
          knowledgeWorksById={knowledgeWorksById}
          panelRef={detailPanelRef}
          closeButtonRef={detailCloseRef}
          onClose={closeDetail}
          onExplore={exploreEntity}
          onExploreWork={exploreWork}
          onExploreVenue={exploreVenue}
          onCopy={copySelectedEvent}
          onDownloadIcs={downloadSelectedEventIcs}
          onShare={shareSelectedEvent}
          follows={follows}
          onToggleFollow={updateFollow}
          personalStatus={selectedDetail ? personalEvents[selectedDetail.id] : undefined}
          onSetPersonalStatus={updatePersonalStatus}
        />
      </section>
        </>
      )}

      {auth.user ? (
        <NotificationCenter
          open={notificationOpen}
          notifications={notifications}
          onClose={() => setNotificationOpen(false)}
          onReadAll={markAllNotificationsRead}
          onRead={markNotificationRead}
          onDelete={deleteNotification}
          onOpenEvent={(eventId) => {
            const event = dataset.events.find((item) => item.id === eventId);
            if (event) selectEvent(event);
            setNotificationOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

const EventListRow = memo(function EventListRow({
  event,
  active,
  onSelect,
  personalStatus,
  changeLabel,
  hasDataIssue,
}: {
  event: ConcertEventSummary;
  active: boolean;
  personalStatus?: PersonalEventStatus;
  changeLabel?: string;
  hasDataIssue: boolean;
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
    <article className={`event-card-shell ${active ? "active" : ""}`}>
      <button
        className="event-card"
        aria-label={eventLabel}
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(event)}
      >
        <div className="date-block"><strong>{event.dateLabel}</strong><span>{event.weekday}</span><time>{event.timeLabel}</time></div>
        <div className="event-main">
          <div className="event-title-row">
            <h2>{event.title}</h2>
            <div className="event-badges">
              {changeLabel ? <span className="change-pill">{changeLabel}</span> : null}
              {hasDataIssue ? <span className="quality-pill">信息待确认</span> : null}
              {personalStatus ? (
                <span className="personal-pill">{personalStatus === "interested" ? "想去" : "已购"}</span>
              ) : null}
            </div>
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
    </article>
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
  return normalizeEnsembleName(value);
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

function AppRouter() {
  const rootParams = new URLSearchParams(window.location.search);
  if (rootParams.get("review") === "1") {
    return <ReviewAccessGate><ReviewWorkspace /></ReviewAccessGate>;
  }
  if (rootParams.get("profile") === "1") return <PersonalWorkspace />;
  if (rootParams.get("updates") === "1") return <UpdatesWorkspace />;
  if (rootParams.get("changes") === "1") return <ChangesWorkspace />;
  if (rootParams.has("sources")) return <SourcesWorkspace />;
  return <App />;
}

appRoot.render(<AuthProvider><AppRouter /></AuthProvider>);
