import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  Clock3,
  ExternalLink,
  Headphones,
  MapPin,
  Music2,
} from "lucide-react";
import type { ConcertEventSummary } from "../../types";
import type { PublishedKnowledgeWork } from "../types";
import { formatEventVenue } from "../../utils";

export default function WorkPage({
  work,
  loading,
  error,
  events,
  onBack,
  backLabel = "返回演出",
  onOpenEvent,
  onOpenComposer,
}: {
  work: PublishedKnowledgeWork | null;
  loading: boolean;
  error: string;
  events: ConcertEventSummary[];
  onBack: () => void;
  backLabel?: string;
  onOpenEvent: (event: ConcertEventSummary) => void;
  onOpenComposer: (composerId: string) => void;
}) {
  const backButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!loading) window.requestAnimationFrame(() => backButtonRef.current?.focus());
  }, [loading, work]);

  if (loading) {
    return (
      <section className="work-page work-page-state" aria-live="polite">
        <Music2 size={28} />
        <h1>正在打开作品指南</h1>
        <p>载入已审核的作品资料与近期演出。</p>
      </section>
    );
  }

  if (!work) {
    return (
      <section className="work-page work-page-state" role="alert">
        <BookOpenText size={28} />
        <h1>{error ? "作品指南加载失败" : "没有找到这部作品"}</h1>
        <p>{error || "这条作品链接可能已失效，请返回演出列表继续浏览。"}</p>
        <button ref={backButtonRef} type="button" onClick={onBack}><ArrowLeft size={16} />{backLabel}</button>
      </section>
    );
  }

  const hasMainReading = Boolean(work.whyListen || work.firstListen || work.listeningPoints.length || work.movements.length);

  return (
    <article className="work-page">
      <header className="work-hero">
        <button ref={backButtonRef} className="work-back" type="button" onClick={onBack}>
          <ArrowLeft size={16} />{backLabel}
        </button>
        <div className="work-hero-grid">
          <div>
            <span className="work-eyebrow">{work.generation ? "自动整理" : "作品指南"}{work.period ? ` · ${work.period}` : ""}</span>
            <h1>{work.title}</h1>
            {work.originalTitle ? <p className="work-original-title">{work.originalTitle}</p> : null}
            <p className="work-summary">{work.summary}</p>
          </div>
          <dl className="work-facts">
            <div><dt>作曲家</dt><dd><button type="button" className="work-composer-link" onClick={() => onOpenComposer(work.composer.id)}>{work.composer.name}</button></dd></div>
            {work.opus ? <div><dt>作品号</dt><dd>{work.opus}</dd></div> : null}
            {work.durationMinutes ? <div><dt>时长</dt><dd>约 {work.durationMinutes} 分钟</dd></div> : null}
            {work.difficulty ? <div><dt>入门提示</dt><dd>{work.difficulty}</dd></div> : null}
          </dl>
        </div>
        <div className="work-tags" aria-label="作品标签">
          {work.genre ? <span>{work.genre}</span> : null}
          {work.key ? <span>{work.key}</span> : null}
          {work.tags.filter((tag) => tag !== work.genre && tag !== work.key).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </header>

      <section className="work-live-section" aria-labelledby="work-live-title">
        <div className="work-section-heading">
          <div>
            <span>从作品回到现场</span>
            <h2 id="work-live-title">近期演出</h2>
          </div>
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
        ) : (
          <div className="work-empty-live">
            <CalendarDays size={22} />
            <div><strong>近期暂无已匹配演出</strong><p>作品指南会保留；当官网节目单出现经过审核的精确曲名时，现场信息会自动汇入这里。</p></div>
          </div>
        )}
      </section>

      <div className={`work-reading-grid${hasMainReading ? "" : " basic"}`}>
        {hasMainReading ? <main>
          {work.whyListen ? <section className="work-prose-section">
            <span>为什么值得听</span>
            <h2>这部作品的核心魅力</h2>
            <p>{work.whyListen}</p>
          </section> : null}
          {work.firstListen ? <section className="work-prose-section">
            <span>第一次听</span>
            <h2>第一次聆听路线</h2>
            <p>{work.firstListen}</p>
          </section> : null}
          {work.listeningPoints.length ? <section className="work-structure-section" aria-labelledby="listening-points-title">
            <div className="work-section-heading compact">
              <div><span>听觉路线</span><h2 id="listening-points-title">具体聆听点</h2></div>
              <Headphones size={20} />
            </div>
            <ol className="work-structure-line">
              {work.listeningPoints.map((point, index) => (
                <li key={point.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><h3>{point.title}</h3><p>{point.description}</p></div>
                </li>
              ))}
            </ol>
          </section> : null}
          {work.movements.length ? <section className="work-structure-section" aria-labelledby="movements-title">
            <div className="work-section-heading compact">
              <div><span>全曲结构</span><h2 id="movements-title">结构导览 · {work.movements.length} 部分</h2></div>
              <Clock3 size={20} />
            </div>
            <ol className="work-structure-line movements">
              {work.movements.map((movement) => (
                <li key={movement.number}>
                  <span>{String(movement.number).padStart(2, "0")}</span>
                  <div><h3>{movement.title}</h3>{movement.tempo ? <em>{movement.tempo}</em> : null}<p>{movement.description}</p></div>
                </li>
              ))}
            </ol>
          </section> : null}
        </main> : null}

        <aside>
          {work.instrumentation ? <section className="work-side-section">
            <span>配器</span>
            <p>{work.instrumentation}</p>
          </section> : null}
          {work.recordings.length ? <section className="work-side-section">
            <span>录音建议</span>
            <div className="work-recordings">
              {work.recordings.map((recording) => (
                <a key={recording.label} href={recording.searchUrl} target="_blank" rel="noreferrer">
                  <strong>{recording.label}</strong>
                  <small>{recording.performers}{recording.year ? ` · ${recording.year}` : ""}</small>
                  <p>{recording.note}</p>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          </section> : null}
          <section className="work-side-section work-sources">
            <span>资料来源</span>
            {work.sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                {source.publisher} · {source.title}<ExternalLink size={12} />
              </a>
            ))}
            <small>{work.generation
              ? `DeepSeek 自动整理 · 可信度 ${work.generation.score} · 更新 ${formatReviewedDate(work.updatedAt)}`
              : `内容复核 ${formatReviewedDate(work.reviewedAt ?? work.updatedAt)} · 更新 ${formatReviewedDate(work.updatedAt)}`}</small>
          </section>
        </aside>
      </div>
    </article>
  );
}

function formatReviewedDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(value));
}
