import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  MapPin,
  Music2,
} from "lucide-react";
import type { ConcertEventSummary } from "../../types";
import { formatEventVenue } from "../../utils";
import type { PublishedKnowledgeComposer } from "../types";

export default function ComposerPage({
  composer,
  loading,
  error,
  events,
  onBack,
  onOpenWork,
  onOpenEvent,
}: {
  composer: PublishedKnowledgeComposer | null;
  loading: boolean;
  error: string;
  events: ConcertEventSummary[];
  onBack: () => void;
  onOpenWork: (workId: string) => void;
  onOpenEvent: (event: ConcertEventSummary) => void;
}) {
  const backButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!loading) window.requestAnimationFrame(() => backButtonRef.current?.focus());
  }, [composer, loading]);

  if (loading) {
    return <section className="composer-page composer-page-state" aria-live="polite"><Music2 size={28} /><h1>正在打开作曲家资料</h1></section>;
  }

  if (!composer || error) {
    return (
      <section className="composer-page composer-page-state" role="alert">
        <BookOpenText size={28} />
        <h1>作曲家资料未能载入</h1>
        <p>{error || "这份资料暂时不可用。"}</p>
        <button ref={backButtonRef} type="button" onClick={onBack}><ArrowLeft size={16} />返回作品库</button>
      </section>
    );
  }

  return (
    <article className="composer-page">
      <header className="composer-hero">
        <button ref={backButtonRef} type="button" className="work-back" onClick={onBack}><ArrowLeft size={16} />返回作品库</button>
        {composer.period || composer.nationality ? <span>{[composer.period, composer.nationality].filter(Boolean).join(" · ")}</span> : null}
        <h1>{composer.name}</h1>
        {composer.originalName ? <p className="composer-original-name">{composer.originalName}</p> : null}
        <p>{composer.introduction}</p>
        <dl>
          {composer.birthYear || composer.deathYear ? <div><dt>生卒</dt><dd>{composer.birthYear ?? "?"}–{composer.deathYear ?? ""}</dd></div> : null}
          <div><dt>已发布作品</dt><dd>{composer.works.length} 部</dd></div>
          <div><dt>近期现场</dt><dd>{events.length} 场</dd></div>
        </dl>
      </header>

      {composer.styleSummary ? <section className="composer-style">
        <span>怎样进入他的音乐</span>
        <h2>风格线索</h2>
        <p>{composer.styleSummary}</p>
      </section> : null}

      <section className="composer-section" aria-labelledby="composer-works-title">
        <div className="work-section-heading">
          <div><span>从这里开始</span><h2 id="composer-works-title">代表作品</h2></div>
          <strong>{composer.works.length}</strong>
        </div>
        <div className="composer-work-grid">
          {composer.works.map((work) => (
            <button key={work.id} type="button" onClick={() => onOpenWork(work.id)}>
              {work.genre || work.durationMinutes ? <span>{[work.genre, work.durationMinutes ? `约 ${work.durationMinutes} 分钟` : ""].filter(Boolean).join(" · ")}</span> : null}
              <h3>{work.title}</h3>
              <p>{work.summary}</p>
              <small>{work.upcomingEventCount ? `${work.upcomingEventCount} 场近期演出` : "近期暂无演出"}<ArrowRight size={14} /></small>
            </button>
          ))}
        </div>
      </section>

      <section className="composer-section" aria-labelledby="composer-events-title">
        <div className="work-section-heading">
          <div><span>连接真实现场</span><h2 id="composer-events-title">近期演出</h2></div>
          <strong>{events.length}</strong>
        </div>
        {events.length ? (
          <div className="work-event-list">
            {events.map((event) => (
              <button key={event.id} type="button" onClick={() => onOpenEvent(event)}>
                <time dateTime={event.startTime}>{event.dateLabel}<small>{event.timeLabel}</small></time>
                <span><strong>{event.title}</strong><small><MapPin size={13} />{formatEventVenue(event)}</small></span>
                <CalendarDays size={18} />
              </button>
            ))}
          </div>
        ) : <div className="work-empty-live"><CalendarDays size={22} /><div><strong>近期暂无已匹配演出</strong><p>资料会继续保留，新节目单命中后会自动更新。</p></div></div>}
      </section>

      <footer className="composer-sources">
        <span>资料来源</span>
        {composer.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.title}</a>)}
      </footer>
    </article>
  );
}
