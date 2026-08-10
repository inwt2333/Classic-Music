import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Clock3,
  Compass,
  Filter,
  GalleryVerticalEnd,
  ListMusic,
  MapPin,
  Music2,
  Search,
  UserRound,
} from "lucide-react";
import { loadKnowledgeIndex } from "../../data";
import type { ConcertEventSummary } from "../../types";
import { formatEventVenue } from "../../utils";
import {
  buildKnowledgeCollections,
  type KnowledgeCollection,
  type KnowledgeCollectionKey,
} from "../collections";
import {
  genreFamilyDefinition,
  knowledgeGenreFamilies,
  knowledgePeriods,
  periodDefinition,
} from "../taxonomy";
import type {
  KnowledgeComposerSummary,
  KnowledgeGenreFamily,
  KnowledgeIndex,
  KnowledgeLibraryView,
  KnowledgePeriodKey,
  KnowledgeWorkSummary,
} from "../types";

const allOption = "全部";
type PeriodFilter = KnowledgePeriodKey | "all";
type GenreFamilyFilter = KnowledgeGenreFamily | "all";

let preservedLibraryState = {
  query: "",
  composer: allOption,
  genre: allOption,
  difficulty: allOption,
  period: "all" as PeriodFilter,
  genreFamily: "all" as GenreFamilyFilter,
  liveOnly: false,
  focusedWorkId: "",
};

export default function KnowledgeLibraryPage({
  view,
  collectionKey,
  events,
  onViewChange,
  onCollectionChange,
  onOpenWork,
  onOpenComposer,
  onOpenEvent,
  onBack,
}: {
  view: KnowledgeLibraryView;
  collectionKey: KnowledgeCollectionKey | "";
  events: ConcertEventSummary[];
  onViewChange: (view: KnowledgeLibraryView) => void;
  onCollectionChange: (key: KnowledgeCollectionKey | "") => void;
  onOpenWork: (workId: string) => void;
  onOpenComposer: (composerId: string) => void;
  onOpenEvent: (event: ConcertEventSummary) => void;
  onBack: () => void;
}) {
  const [index, setIndex] = useState<KnowledgeIndex | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(preservedLibraryState.query);
  const [composer, setComposer] = useState(preservedLibraryState.composer);
  const [genre, setGenre] = useState(preservedLibraryState.genre);
  const [difficulty, setDifficulty] = useState(preservedLibraryState.difficulty);
  const [period, setPeriod] = useState<PeriodFilter>(preservedLibraryState.period);
  const [genreFamily, setGenreFamily] = useState<GenreFamilyFilter>(preservedLibraryState.genreFamily);
  const [liveOnly, setLiveOnly] = useState(preservedLibraryState.liveOnly);
  const restoredFocus = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadKnowledgeIndex()
      .then((data) => {
        if (!cancelled) setIndex(data);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    preservedLibraryState = {
      ...preservedLibraryState,
      query,
      composer,
      genre,
      difficulty,
      period,
      genreFamily,
      liveOnly,
    };
  }, [composer, difficulty, genre, genreFamily, liveOnly, period, query]);

  useEffect(() => {
    if (!index || view !== "works" || restoredFocus.current || !preservedLibraryState.focusedWorkId) return;
    restoredFocus.current = true;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(
        `[data-library-work-id="${preservedLibraryState.focusedWorkId}"]`,
      )?.focus();
    });
  }, [index, view]);

  const composers = useMemo(
    () => uniqueSorted(index?.works.map((work) => work.composerName) ?? []),
    [index],
  );
  const genres = useMemo(
    () => uniqueSorted(index?.works.map((work) => work.genre) ?? []),
    [index],
  );
  const difficulties = useMemo(
    () => uniqueSorted(index?.works.map((work) => work.difficulty) ?? []),
    [index],
  );
  const periodStats = useMemo(() => knowledgePeriods.map((definition) => {
    const works = index?.works.filter((work) => work.periodKey === definition.key) ?? [];
    const composers = index?.composers.filter((item) => item.periodKey === definition.key) ?? [];
    return {
      ...definition,
      workCount: works.length,
      composerCount: composers.length,
      liveCount: works.reduce((total, work) => total + work.upcomingEventCount, 0),
    };
  }).filter((item) => item.workCount || item.composerCount), [index]);
  const genreStats = useMemo(() => knowledgeGenreFamilies.map((definition) => {
    const works = index?.works.filter((work) => work.genreFamily === definition.key) ?? [];
    return {
      ...definition,
      workCount: works.length,
      liveCount: works.reduce((total, work) => total + work.upcomingEventCount, 0),
      examples: works.slice(0, 2).map((work) => work.title),
    };
  }).filter((item) => item.workCount), [index]);

  const filteredWorks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return (index?.works ?? [])
      .filter((work) => {
        if (period !== "all" && work.periodKey !== period) return false;
        if (genreFamily !== "all" && work.genreFamily !== genreFamily) return false;
        if (composer !== allOption && work.composerName !== composer) return false;
        if (genre !== allOption && work.genre !== genre) return false;
        if (difficulty !== allOption && work.difficulty !== difficulty) return false;
        if (liveOnly && work.upcomingEventCount === 0) return false;
        if (!normalizedQuery) return true;
        return [
          work.title,
          work.originalTitle,
          work.composerName,
          work.opus,
          work.genre,
          work.summary,
          ...work.tags,
        ].filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
      })
      .sort(sortWorks);
  }, [composer, difficulty, genre, genreFamily, index, liveOnly, period, query]);

  const filteredComposers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return (index?.composers ?? [])
      .filter((item) => {
        if (period !== "all" && item.periodKey !== period) return false;
        if (liveOnly && item.upcomingEventCount === 0) return false;
        if (!normalizedQuery) return true;
        return [item.name, item.originalName, item.period]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
      })
      .sort((left, right) => (left.birthYear ?? 9999) - (right.birthYear ?? 9999) || left.name.localeCompare(right.name, "zh-CN"));
  }, [index, liveOnly, period, query]);

  const liveWorks = useMemo(() => (index?.works ?? [])
    .filter((work) => work.upcomingEventCount > 0)
    .sort(sortWorks)
    .slice(0, 6), [index]);
  const starterWorks = useMemo(() => (index?.works ?? [])
    .filter((work) => work.difficulty === "第一次听" || work.difficulty === "容易进入")
    .sort(sortWorks)
    .slice(0, 6), [index]);
  const collections = useMemo(
    () => index ? buildKnowledgeCollections(index, events) : [],
    [events, index],
  );

  const openWork = (work: KnowledgeWorkSummary) => {
    preservedLibraryState.focusedWorkId = work.id;
    onOpenWork(work.id);
  };

  const showPeriodComposers = (key: KnowledgePeriodKey) => {
    setPeriod(key);
    setQuery("");
    setLiveOnly(false);
    onViewChange("composers");
  };

  const showGenreWorks = (key: KnowledgeGenreFamily) => {
    setGenreFamily(key);
    setPeriod("all");
    setQuery("");
    setLiveOnly(false);
    onViewChange("works");
  };

  const clearFilters = () => {
    setQuery("");
    setComposer(allOption);
    setGenre(allOption);
    setDifficulty(allOption);
    setPeriod("all");
    setGenreFamily("all");
    setLiveOnly(false);
  };

  if (error) {
    return (
      <section className="knowledge-library knowledge-library-state" role="alert">
        <BookOpenText size={30} />
        <h1>作品目录加载失败</h1>
        <p>未能读取已发布的作品索引：{error}</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
      </section>
    );
  }

  if (!index) {
    return (
      <section className="knowledge-library knowledge-library-state" aria-live="polite">
        <Music2 size={30} />
        <h1>正在整理作品目录</h1>
        <p>载入作品、作曲家与近期现场。</p>
      </section>
    );
  }

  return (
    <section className="knowledge-library">
      <header className="library-hero">
        <div className="library-hero-copy">
          <button type="button" className="library-back" onClick={onBack}>返回演出</button>
          <span>知识库 · {index.composers.length} 位作曲家 · {index.works.length} 部作品</span>
          <h1>沿着音乐史，找到下一部作品</h1>
          <p>从时期、作曲家和体裁进入作品，也从近期舞台回到音乐本身。</p>
        </div>
        <div className="library-score-mark" aria-hidden="true">
          <strong>{String(index.works.length).padStart(2, "0")}</strong>
          <span>WORKS<br />IN LIBRARY</span>
        </div>
      </header>

      <nav className="library-view-tabs" aria-label="知识库视图">
        <div role="tablist">
          <ViewTab active={view === "explore"} icon={<Compass size={16} />} label="探索" onClick={() => onViewChange("explore")} />
          <ViewTab active={view === "collections"} icon={<GalleryVerticalEnd size={16} />} label="精选" onClick={() => onViewChange("collections")} />
          <ViewTab active={view === "composers"} icon={<UserRound size={16} />} label="作曲家" onClick={() => onViewChange("composers")} />
          <ViewTab active={view === "works"} icon={<ListMusic size={16} />} label="作品" onClick={() => onViewChange("works")} />
        </div>
        <span>{view === "explore" ? "从现场与聆听路线开始" : view === "collections" ? "由当前真实演出驱动" : view === "composers" ? "按音乐史时期排列" : "按时期与体裁浏览"}</span>
      </nav>

      {view === "explore" ? (
        <ExploreView
          liveWorks={liveWorks}
          starterWorks={starterWorks}
          periodStats={periodStats}
          genreStats={genreStats}
          onOpenWork={openWork}
          onShowPeriod={showPeriodComposers}
          onShowGenre={showGenreWorks}
          onShowAllWorks={() => {
            clearFilters();
            onViewChange("works");
          }}
        />
      ) : null}

      {view === "composers" ? (
        <ComposerDirectory
          composers={filteredComposers}
          period={period}
          query={query}
          liveOnly={liveOnly}
          onPeriodChange={setPeriod}
          onQueryChange={setQuery}
          onLiveOnlyChange={setLiveOnly}
          onOpenComposer={onOpenComposer}
          onClear={clearFilters}
        />
      ) : null}

      {view === "collections" ? (
        <CollectionDirectory
          collections={collections}
          activeKey={collectionKey}
          onCollectionChange={onCollectionChange}
          onOpenWork={(work) => openWork(work)}
          onOpenEvent={onOpenEvent}
        />
      ) : null}

      {view === "works" ? (
        <WorkDirectory
          works={filteredWorks}
          allWorks={index.works}
          query={query}
          composer={composer}
          genre={genre}
          difficulty={difficulty}
          period={period}
          genreFamily={genreFamily}
          liveOnly={liveOnly}
          composers={composers}
          genres={genres}
          difficulties={difficulties}
          onQueryChange={setQuery}
          onComposerChange={setComposer}
          onGenreChange={setGenre}
          onDifficultyChange={setDifficulty}
          onPeriodChange={setPeriod}
          onGenreFamilyChange={setGenreFamily}
          onLiveOnlyChange={setLiveOnly}
          onOpenWork={openWork}
          onClear={clearFilters}
        />
      ) : null}
    </section>
  );
}

function CollectionDirectory({
  collections,
  activeKey,
  onCollectionChange,
  onOpenWork,
  onOpenEvent,
}: {
  collections: KnowledgeCollection[];
  activeKey: KnowledgeCollectionKey | "";
  onCollectionChange: (key: KnowledgeCollectionKey | "") => void;
  onOpenWork: (work: KnowledgeWorkSummary) => void;
  onOpenEvent: (event: ConcertEventSummary) => void;
}) {
  const active = collections.find((collection) => collection.key === activeKey);
  const [city, setCity] = useState("全部城市");
  const [dateWindow, setDateWindow] = useState<"all" | "30" | "90">("all");

  useEffect(() => {
    setCity("全部城市");
    setDateWindow("all");
  }, [activeKey]);

  if (!active) {
    return <div className="library-collections">
      <section className="library-section collection-intro">
        <div><span>精选专题</span><h2>从作品指南回到真实现场</h2></div>
        <p>专题会根据近期演出持续更新，方便从感兴趣的作品找到真实现场。</p>
      </section>
      <div className="collection-grid">
        {collections.map((collection, index) => <article key={collection.key}>
          <span>{String(index + 1).padStart(2, "0")} · {collection.eyebrow}</span>
          <h2>{collection.title}</h2>
          <p>{collection.description}</p>
          <div><strong>{collection.works.length}</strong><span>部作品</span><strong>{collection.events.length}</strong><span>场演出</span></div>
          <small>{collection.works.slice(0, 3).map((work) => work.title).join(" / ")}</small>
          <button type="button" onClick={() => onCollectionChange(collection.key)}>进入专题<ArrowRight size={14} /></button>
        </article>)}
      </div>
    </div>;
  }

  const cities = ["全部城市", ...Array.from(new Set(active.events.map((event) => event.city))).sort((left, right) => left.localeCompare(right, "zh-CN"))];
  const deadline = dateWindow === "all" ? Number.POSITIVE_INFINITY : Date.now() + Number(dateWindow) * 24 * 60 * 60 * 1000;
  const filteredEvents = active.events.filter((event) => (
    (city === "全部城市" || event.city === city) && new Date(event.startTime).getTime() <= deadline
  ));
  const filteredEventIds = new Set(filteredEvents.map((event) => event.id));
  const filteredWorks = active.works.filter((work) => work.upcomingEventIds.some((id) => filteredEventIds.has(id)));

  return <div className="library-collection-detail">
    <section className="collection-hero">
      <button type="button" onClick={() => onCollectionChange("")}>返回全部精选</button>
      <span>{active.eyebrow}</span>
      <h2>{active.title}</h2>
      <p>{active.description}</p>
      <small>{active.reason}</small>
    </section>
    <div className="collection-filters" aria-label="筛选专题演出">
      <label><span>城市</span><select value={city} onChange={(event) => setCity(event.target.value)}>{cities.map((value) => <option key={value}>{value}</option>)}</select></label>
      <div role="group" aria-label="日期范围">
        <button className={dateWindow === "all" ? "active" : ""} type="button" onClick={() => setDateWindow("all")}>全部日期</button>
        <button className={dateWindow === "30" ? "active" : ""} type="button" onClick={() => setDateWindow("30")}>未来 30 天</button>
        <button className={dateWindow === "90" ? "active" : ""} type="button" onClick={() => setDateWindow("90")}>未来 90 天</button>
      </div>
      <span>{filteredWorks.length} 部作品 · {filteredEvents.length} 场演出</span>
    </div>
    {filteredEvents.length ? <>
      <section className="library-section collection-works" aria-labelledby="collection-works-title">
        <SectionHeading eyebrow="听前了解" title="专题作品" id="collection-works-title" meta={`${filteredWorks.length} 部`} />
        <div className="library-starter-grid">
          {filteredWorks.map((work, index) => <LibraryWorkCard key={work.id} work={work} index={index} compact onOpen={() => onOpenWork(work)} />)}
        </div>
      </section>
      <section className="library-section collection-events" aria-labelledby="collection-events-title">
        <SectionHeading eyebrow="真实现场" title="近期演出" id="collection-events-title" meta={`${filteredEvents.length} 场`} />
        <div className="collection-event-list">
          {filteredEvents.map((event) => <button key={event.id} type="button" onClick={() => onOpenEvent(event)}>
            <time dateTime={event.startTime}>{event.dateLabel}<small>{event.timeLabel}</small></time>
            <div><strong>{event.title}</strong><span><MapPin size={12} />{event.city} · {formatEventVenue(event)}</span></div>
            <ArrowRight size={15} />
          </button>)}
        </div>
      </section>
    </> : <LibraryEmpty title="当前筛选下暂无演出" onClear={() => { setCity("全部城市"); setDateWindow("all"); }} />}
  </div>;
}

function ExploreView({
  liveWorks,
  starterWorks,
  periodStats,
  genreStats,
  onOpenWork,
  onShowPeriod,
  onShowGenre,
  onShowAllWorks,
}: {
  liveWorks: KnowledgeWorkSummary[];
  starterWorks: KnowledgeWorkSummary[];
  periodStats: Array<ReturnType<typeof periodDefinition> & { workCount: number; composerCount: number; liveCount: number }>;
  genreStats: Array<ReturnType<typeof genreFamilyDefinition> & { workCount: number; liveCount: number; examples: string[] }>;
  onOpenWork: (work: KnowledgeWorkSummary) => void;
  onShowPeriod: (period: KnowledgePeriodKey) => void;
  onShowGenre: (family: KnowledgeGenreFamily) => void;
  onShowAllWorks: () => void;
}) {
  return <div className="library-explore">
    {liveWorks.length ? <section className="library-section library-live-section" aria-labelledby="library-live-title">
      <SectionHeading eyebrow="正在舞台上" title="近期可以听到的作品" id="library-live-title" meta={`${liveWorks.reduce((total, work) => total + work.upcomingEventCount, 0)} 场演出`} />
      <div className="library-feature-grid">
        {liveWorks.map((work) => <FeatureWork key={work.id} work={work} onOpen={() => onOpenWork(work)} />)}
      </div>
    </section> : null}

    <section className="library-section" aria-labelledby="library-period-title">
      <SectionHeading eyebrow="音乐史主线" title="按时期探索" id="library-period-title" meta={`${periodStats.length} 个时期`} />
      <div className="library-period-timeline">
        {periodStats.map((item, index) => <button key={item.key} type="button" onClick={() => onShowPeriod(item.key)}>
          <span className="library-period-index">{String(index + 1).padStart(2, "0")}</span>
          <div><strong>{item.label}</strong><small>{item.range}</small></div>
          <p>{item.description}</p>
          <footer>{item.composerCount} 位作曲家 · {item.workCount} 部作品<ArrowRight size={14} /></footer>
        </button>)}
      </div>
    </section>

    <section className="library-section" aria-labelledby="library-genre-title">
      <SectionHeading eyebrow="另一条入口" title="按体裁探索" id="library-genre-title" meta={`${genreStats.length} 个大类`} />
      <div className="library-genre-grid">
        {genreStats.map((item) => <button key={item.key} type="button" onClick={() => onShowGenre(item.key)}>
          <div><Music2 size={17} /><strong>{item.label}</strong><span>{item.workCount}</span></div>
          <p>{item.description}</p>
          <small>{item.examples.join(" / ")}</small>
        </button>)}
      </div>
    </section>

    <section className="library-section" aria-labelledby="library-starter-title">
      <SectionHeading eyebrow="第一次听" title="适合作为起点" id="library-starter-title" meta={`${starterWorks.length} 部精选`} action={<button type="button" onClick={onShowAllWorks}>全部作品<ArrowRight size={14} /></button>} />
      <div className="library-starter-grid">
        {starterWorks.map((work, index) => <LibraryWorkCard key={work.id} work={work} index={index} onOpen={() => onOpenWork(work)} compact />)}
      </div>
    </section>
  </div>;
}

function ComposerDirectory({
  composers,
  period,
  query,
  liveOnly,
  onPeriodChange,
  onQueryChange,
  onLiveOnlyChange,
  onOpenComposer,
  onClear,
}: {
  composers: KnowledgeComposerSummary[];
  period: PeriodFilter;
  query: string;
  liveOnly: boolean;
  onPeriodChange: (period: PeriodFilter) => void;
  onQueryChange: (query: string) => void;
  onLiveOnlyChange: (value: boolean) => void;
  onOpenComposer: (composerId: string) => void;
  onClear: () => void;
}) {
  const groups = knowledgePeriods.map((definition) => ({
    ...definition,
    composers: composers.filter((composer) => composer.periodKey === definition.key),
  })).filter((group) => group.composers.length);
  return <div className="library-directory">
    <div className="library-directory-toolbar">
      <label className="library-search"><Search size={17} /><span className="sr-only">搜索作曲家</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索作曲家" /></label>
      <label className="library-live-toggle"><input type="checkbox" checked={liveOnly} onChange={(event) => onLiveOnlyChange(event.target.checked)} /><CalendarDays size={16} /><span>近期有现场</span></label>
    </div>
    <PeriodFilterBar value={period} onChange={onPeriodChange} />
    <div className="library-result-heading"><div><UserRound size={15} /><strong>{composers.length}</strong> 位作曲家</div><span>同一时期内按出生年份排列</span></div>
    {groups.length ? groups.map((group) => <section className="library-composer-period" key={group.key}>
      <header><div><span>{group.range}</span><h2>{group.label}</h2></div><p>{group.description}</p></header>
      <div className="library-composer-grid">
        {group.composers.map((composer) => <button key={composer.id} type="button" onClick={() => onOpenComposer(composer.id)}>
          <span>{composer.birthYear ? `${composer.birthYear}–${composer.deathYear ?? ""}` : composer.period}</span>
          <strong>{composer.name}</strong>
          {composer.originalName ? <em>{composer.originalName}</em> : null}
          <footer>{composer.workCount} 部作品<span className={composer.upcomingEventCount ? "has-live" : ""}>{composer.upcomingEventCount ? `${composer.upcomingEventCount} 场近期演出` : "近期暂无演出"}</span></footer>
        </button>)}
      </div>
    </section>) : <LibraryEmpty title="没有符合条件的作曲家" onClear={onClear} />}
  </div>;
}

function WorkDirectory({
  works,
  allWorks,
  query,
  composer,
  genre,
  difficulty,
  period,
  genreFamily,
  liveOnly,
  composers,
  genres,
  difficulties,
  onQueryChange,
  onComposerChange,
  onGenreChange,
  onDifficultyChange,
  onPeriodChange,
  onGenreFamilyChange,
  onLiveOnlyChange,
  onOpenWork,
  onClear,
}: {
  works: KnowledgeWorkSummary[];
  allWorks: KnowledgeWorkSummary[];
  query: string;
  composer: string;
  genre: string;
  difficulty: string;
  period: PeriodFilter;
  genreFamily: GenreFamilyFilter;
  liveOnly: boolean;
  composers: string[];
  genres: string[];
  difficulties: string[];
  onQueryChange: (query: string) => void;
  onComposerChange: (composer: string) => void;
  onGenreChange: (genre: string) => void;
  onDifficultyChange: (difficulty: string) => void;
  onPeriodChange: (period: PeriodFilter) => void;
  onGenreFamilyChange: (family: GenreFamilyFilter) => void;
  onLiveOnlyChange: (value: boolean) => void;
  onOpenWork: (work: KnowledgeWorkSummary) => void;
  onClear: () => void;
}) {
  return <div className="library-directory">
    <div className="library-controls" aria-label="筛选作品">
      <label className="library-search"><Search size={17} /><span className="sr-only">搜索作品</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索作品、作曲家或标签" /></label>
      <label><span>作曲家</span><select value={composer} onChange={(event) => onComposerChange(event.target.value)}><option>{allOption}</option>{composers.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>具体体裁</span><select value={genre} onChange={(event) => onGenreChange(event.target.value)}><option>{allOption}</option>{genres.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>聆听门槛</span><select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)}><option>{allOption}</option>{difficulties.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="library-live-toggle"><input type="checkbox" checked={liveOnly} onChange={(event) => onLiveOnlyChange(event.target.checked)} /><CalendarDays size={16} /><span>近期有现场</span></label>
    </div>
    <PeriodFilterBar value={period} onChange={onPeriodChange} />
    <div className="library-catalog-layout">
      <aside className="library-family-nav" aria-label="体裁大类">
        <span>体裁大类</span>
        <button className={genreFamily === "all" ? "active" : ""} type="button" onClick={() => onGenreFamilyChange("all")}><strong>全部作品</strong><small>{allWorks.length}</small></button>
        {knowledgeGenreFamilies.map((family) => {
          const count = allWorks.filter((work) => work.genreFamily === family.key).length;
          return count ? <button key={family.key} className={genreFamily === family.key ? "active" : ""} type="button" onClick={() => onGenreFamilyChange(family.key)}><strong>{family.label}</strong><small>{count}</small></button> : null;
        })}
      </aside>
      <div className="library-work-results">
        <div className="library-result-heading">
          <div><Filter size={15} /><strong>{works.length}</strong> 部作品</div>
          <span>{genreFamily === "all" ? "全部体裁" : genreFamilyDefinition(genreFamily).label}{period === "all" ? "" : ` · ${periodDefinition(period).label}`}</span>
        </div>
        {works.length ? <div className="library-work-grid">
          {works.map((work, index) => <LibraryWorkCard key={work.id} work={work} index={index} onOpen={() => onOpenWork(work)} />)}
        </div> : <LibraryEmpty title="没有符合这些条件的作品" onClear={onClear} />}
      </div>
    </div>
  </div>;
}

function PeriodFilterBar({ value, onChange }: { value: PeriodFilter; onChange: (value: PeriodFilter) => void }) {
  return <div className="library-period-filter" aria-label="时期筛选">
    <button className={value === "all" ? "active" : ""} type="button" onClick={() => onChange("all")}>全部时期</button>
    {knowledgePeriods.filter((item) => item.key !== "other").map((item) => <button key={item.key} className={value === item.key ? "active" : ""} type="button" onClick={() => onChange(item.key)}>{item.label}</button>)}
  </div>;
}

function ViewTab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function SectionHeading({ eyebrow, title, id, meta, action }: { eyebrow: string; title: string; id: string; meta: string; action?: React.ReactNode }) {
  return <header className="library-section-heading"><div><span>{eyebrow}</span><h2 id={id}>{title}</h2></div><div>{action}<small>{meta}</small></div></header>;
}

function FeatureWork({ work, onOpen }: { work: KnowledgeWorkSummary; onOpen: () => void }) {
  return <button type="button" className="library-feature-work" onClick={onOpen}>
    <div><span>{work.composerName}</span><strong>{work.title}</strong></div>
    <footer><span><CalendarDays size={13} />{work.upcomingEventCount} 场近期演出</span><ArrowRight size={15} /></footer>
  </button>;
}

function LibraryWorkCard({ work, index, onOpen, compact = false }: { work: KnowledgeWorkSummary; index: number; onOpen: () => void; compact?: boolean }) {
  return <button className={`library-work-card${compact ? " compact" : ""}`} data-library-work-id={work.id} type="button" onClick={onOpen}>
    <span className="library-card-number">{String(index + 1).padStart(2, "0")}</span>
    <div className="library-card-title"><span>{work.composerName}</span><h2>{work.title}</h2>{work.originalTitle ? <em>{work.originalTitle}</em> : null}</div>
    {!compact ? <p>{work.summary}</p> : null}
    <div className="library-card-meta">
      <span>{periodDefinition(work.periodKey).label}</span>
      {work.genre ? <span>{work.genre}</span> : null}
      {work.difficulty ? <span>{work.difficulty}</span> : null}
      {work.durationMinutes ? <span><Clock3 size={12} />约 {work.durationMinutes} 分钟</span> : null}
    </div>
    <footer><span className={work.upcomingEventCount ? "has-live" : ""}><CalendarDays size={14} />{work.upcomingEventCount ? `${work.upcomingEventCount} 场近期演出` : "近期暂无演出"}</span><span>阅读指南 <ArrowRight size={14} /></span></footer>
  </button>;
}

function LibraryEmpty({ title, onClear }: { title: string; onClear: () => void }) {
  return <div className="library-empty"><BookOpenText size={25} /><h2>{title}</h2><p>当前分类下暂无可显示内容。</p><button type="button" onClick={onClear}>清除全部条件</button></div>;
}

function sortWorks(left: KnowledgeWorkSummary, right: KnowledgeWorkSummary) {
  return right.upcomingEventCount - left.upcomingEventCount
    || periodOrder(left.periodKey) - periodOrder(right.periodKey)
    || left.composerName.localeCompare(right.composerName, "zh-CN")
    || left.title.localeCompare(right.title, "zh-CN");
}

function periodOrder(key: KnowledgePeriodKey) {
  return knowledgePeriods.findIndex((item) => item.key === key);
}

function uniqueSorted(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "zh-CN"));
}
