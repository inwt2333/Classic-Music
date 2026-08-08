import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Clock3,
  Filter,
  Music2,
  Search,
  UserRound,
} from "lucide-react";
import { loadKnowledgeIndex } from "../../data";
import type { KnowledgeIndex, KnowledgeWorkSummary } from "../types";

const allOption = "全部";
let preservedLibraryState = {
  query: "",
  composer: allOption,
  genre: allOption,
  difficulty: allOption,
  liveOnly: false,
  focusedWorkId: "",
};

export default function KnowledgeLibraryPage({
  onOpenWork,
  onOpenComposer,
  onBack,
}: {
  onOpenWork: (workId: string) => void;
  onOpenComposer: (composerId: string) => void;
  onBack: () => void;
}) {
  const [index, setIndex] = useState<KnowledgeIndex | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(preservedLibraryState.query);
  const [composer, setComposer] = useState(preservedLibraryState.composer);
  const [genre, setGenre] = useState(preservedLibraryState.genre);
  const [difficulty, setDifficulty] = useState(preservedLibraryState.difficulty);
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
      liveOnly,
    };
  }, [composer, difficulty, genre, liveOnly, query]);

  useEffect(() => {
    if (!index || restoredFocus.current || !preservedLibraryState.focusedWorkId) return;
    restoredFocus.current = true;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(
        `[data-library-work-id="${preservedLibraryState.focusedWorkId}"]`,
      )?.focus();
    });
  }, [index]);

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
  const works = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return (index?.works ?? [])
      .filter((work) => {
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
      .sort((left, right) => (
        right.upcomingEventCount - left.upcomingEventCount
        || left.composerName.localeCompare(right.composerName, "zh-CN")
        || left.title.localeCompare(right.title, "zh-CN")
      ));
  }, [composer, difficulty, genre, index, liveOnly, query]);

  const openWork = (work: KnowledgeWorkSummary) => {
    preservedLibraryState.focusedWorkId = work.id;
    onOpenWork(work.id);
  };

  const clearFilters = () => {
    setQuery("");
    setComposer(allOption);
    setGenre(allOption);
    setDifficulty(allOption);
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
        <p>载入经过审核的作品资料与近期现场。</p>
      </section>
    );
  }

  return (
    <section className="knowledge-library">
      <header className="library-hero">
        <div className="library-hero-copy">
          <button type="button" className="library-back" onClick={onBack}>返回演出</button>
          <span>作品库 · {index.works.length} 部已发布作品</span>
          <h1>从一部作品，走向下一次现场</h1>
          <p>按作曲家、体裁和聆听门槛浏览经典作品。每一页都说明为什么值得听，并优先连接当前真实演出。</p>
        </div>
        <div className="library-score-mark" aria-hidden="true">
          <strong>{String(index.works.length).padStart(2, "0")}</strong>
          <span>WORKS<br />IN PRINT</span>
        </div>
      </header>

      <section className="library-composers" aria-labelledby="library-composers-title">
        <div className="library-result-heading">
          <div><UserRound size={15} /><strong id="library-composers-title">作曲家</strong></div>
          <span>{index.composers.length} 位已发布作曲家</span>
        </div>
        <div className="library-composer-list">
          {index.composers.map((item) => (
            <button key={item.id} type="button" onClick={() => onOpenComposer(item.id)}>
              <span>{item.period}</span>
              <strong>{item.name}</strong>
              <small>{item.workCount} 部作品 · {item.upcomingEventCount ? `${item.upcomingEventCount} 场近期演出` : "近期暂无演出"}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="library-controls" aria-label="筛选作品">
        <label className="library-search">
          <Search size={17} />
          <span className="sr-only">搜索作品</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品、作曲家或标签" />
        </label>
        <label><span>作曲家</span><select value={composer} onChange={(event) => setComposer(event.target.value)}><option>{allOption}</option>{composers.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>体裁</span><select value={genre} onChange={(event) => setGenre(event.target.value)}><option>{allOption}</option>{genres.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>入门提示</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>{allOption}</option>{difficulties.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="library-live-toggle"><input type="checkbox" checked={liveOnly} onChange={(event) => setLiveOnly(event.target.checked)} /><CalendarDays size={16} /><span>近期有现场</span></label>
      </div>

      <div className="library-result-heading">
        <div><Filter size={15} /><strong>{works.length}</strong> 部作品</div>
        <span>近期演出较多的作品优先</span>
      </div>

      {works.length ? (
        <div className="library-work-grid">
          {works.map((work, index_) => (
            <button
              key={work.id}
              className="library-work-card"
              data-library-work-id={work.id}
              type="button"
              onClick={() => openWork(work)}
            >
              <span className="library-card-number">{String(index_ + 1).padStart(2, "0")}</span>
              <div className="library-card-title">
                <span>{work.composerName}</span>
                <h2>{work.title}</h2>
                {work.originalTitle ? <em>{work.originalTitle}</em> : null}
              </div>
              <p>{work.summary}</p>
              <div className="library-card-meta">
                {work.genre ? <span>{work.genre}</span> : null}
                {work.difficulty ? <span>{work.difficulty}</span> : null}
                {work.durationMinutes ? <span><Clock3 size={12} />约 {work.durationMinutes} 分钟</span> : null}
              </div>
              <footer>
                <span className={work.upcomingEventCount ? "has-live" : ""}><CalendarDays size={14} />{work.upcomingEventCount ? `${work.upcomingEventCount} 场近期演出` : "近期暂无演出"}</span>
                <span>阅读指南 <ArrowRight size={14} /></span>
              </footer>
            </button>
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <BookOpenText size={25} />
          <h2>没有符合这些条件的作品</h2>
          <p>清除筛选后可继续浏览全部已审核作品。</p>
          <button type="button" onClick={clearFilters}>清除全部条件</button>
        </div>
      )}
    </section>
  );
}

function uniqueSorted(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}
