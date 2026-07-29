import {
  BookOpenText,
  CalendarDays,
  ExternalLink,
  MapPin,
  Music,
  Search,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ConcertEvent, EntityRecord, ProgramItem } from "../types";
import {
  bilibiliSearchUrl,
  formatDateTime,
  formatEventVenue,
  imslpSearchUrl,
  musicBrainzWorkSearchUrl,
  neteaseSearchUrl,
  qqMusicSearchUrl,
  resourceSearchUrl,
} from "../utils";

export default function EventDetail({
  event,
  loading,
  open,
  entitiesByKey,
  onClose,
  onExplore,
}: {
  event: ConcertEvent | null;
  loading: boolean;
  open: boolean;
  entitiesByKey: Map<string, EntityRecord>;
  onClose: () => void;
  onExplore: (entity: EntityRecord) => void;
}) {
  if (loading) {
    return (
      <section className={`detail-panel ${open ? "open" : ""}`} aria-live="polite">
        <DetailClose onClose={onClose} />
        <div className="detail-skeleton">
          <span />
          <strong />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (!event) {
    return (
      <section className={`detail-panel empty ${open ? "open" : ""}`}>
        <DetailClose onClose={onClose} />
        <Music size={28} />
        <p>选择一场演出查看节目单和购票信息</p>
      </section>
    );
  }

  const people = Array.from(
    new Set([event.conductor, ...event.performers].filter((value): value is string => Boolean(value))),
  );
  const qualityLabel = {
    scraped: "官网解析",
    "manual-reviewed": "人工确认",
    "ocr-assisted": "图片 OCR · 待复核",
    "ai-enhanced": "AI 辅助",
    "needs-review": "待复核",
  }[event.dataQuality];

  return (
    <section className={`detail-panel ${open ? "open" : ""}`} aria-label="演出详情">
      <DetailClose onClose={onClose} />
      <div className="detail-kicker">
        <span>{qualityLabel}</span>
        <span>{event.sources?.length ?? 1} 个来源</span>
      </div>
      <h2>{event.title}</h2>

      <div className="detail-meta">
        <span><CalendarDays size={16} />{formatDateTime(event.startTime)}</span>
        <span><MapPin size={16} />{formatEventVenue(event)}</span>
        {event.price ? <span><Ticket size={16} />{event.price}</span> : null}
      </div>

      <div className="action-row">
        {event.ticketUrl ? (
          <a className="primary-link" href={event.ticketUrl} target="_blank" rel="noreferrer">
            <Ticket size={16} />购票
          </a>
        ) : null}
        <a href={event.sourceUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />官网详情
        </a>
      </div>

      {event.priceTiers?.length ? (
        <div className="price-tier-list" aria-label="票价档位">
          <span>票价档位</span>
          <div>{event.priceTiers.map((price) => <strong key={price}>{price === 0 ? "免费" : `¥${price}`}</strong>)}</div>
        </div>
      ) : null}

      {people.length || event.ensemble ? (
        <>
          <SectionTitle icon={<UserRound size={17} />} title="人物与乐团" />
          <div className="entity-list">
            {event.ensemble ? <span>{event.ensemble}</span> : null}
            {people.map((person) => {
              const entity = entitiesByKey.get(`person:${person}`);
              return entity ? (
                <button key={person} onClick={() => onExplore(entity)}>{person}</button>
              ) : <span key={person}>{person}</span>;
            })}
          </div>
        </>
      ) : null}

      <SectionTitle icon={<Music size={17} />} title={`节目单${event.program.length ? ` · ${event.program.length} 首` : ""}`} />
      {event.dataQuality === "ocr-assisted" ? (
        <p className="ocr-notice">
          官网节目单来自图片，当前文字由本地 OCR 提取并等待复核
          {event.extraction?.confidence !== undefined
            ? ` · 置信度 ${event.extraction.confidence}`
            : ""}
        </p>
      ) : null}
      <div className="program-list">
        {event.program.length ? (
          event.program.map((item, index) => (
            <ProgramRow
              key={item.id ?? `${item.title}-${index}`}
              item={item}
              entity={item.workId ? entitiesByKey.get(`work:${item.workId}`) : undefined}
              onExplore={onExplore}
            />
          ))
        ) : (
          <p className="muted">官网暂未提供可确认的文字节目单，已标记等待复核。</p>
        )}
      </div>

      {event.description ? (
        <details className="description-disclosure">
          <summary><BookOpenText size={17} />演出简介</summary>
          <div className="event-description">
            {event.description.split(/\n{2,}/).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
            ))}
          </div>
        </details>
      ) : null}

      <SectionTitle icon={<ExternalLink size={17} />} title="数据来源" />
      <div className="source-detail-list">
        {(event.sources?.length ? event.sources : [{
          sourceId: "legacy",
          sourceName: event.sourceName,
          sourceRecordId: event.id,
          sourceUrl: event.sourceUrl,
          ticketUrl: event.ticketUrl,
          scrapedAt: event.scrapedAt,
        }]).map((source) => (
          <a key={source.sourceRecordId} href={source.sourceUrl} target="_blank" rel="noreferrer">
            <span>{source.sourceName}</span>
            <small>{formatDateTime(source.scrapedAt)}</small>
          </a>
        ))}
      </div>
    </section>
  );
}

function ProgramRow({
  item,
  entity,
  onExplore,
}: {
  item: ProgramItem;
  entity?: EntityRecord;
  onExplore: (entity: EntityRecord) => void;
}) {
  const keyword = [item.composer, item.title, ...(item.alternateTitles ?? []), item.opus].filter(Boolean).join(" ");
  return (
    <article className="program-row">
      <div className="program-copy">
        {entity ? <button className="work-link" onClick={() => onExplore(entity)}>{item.title}</button> : <strong>{item.title}</strong>}
        {item.alternateTitles?.length ? (
          <small className="program-alternate-title">{item.alternateTitles.join(" / ")}</small>
        ) : null}
        <span>{[item.composer, item.opus].filter(Boolean).join(" · ") || "曲目信息待补充"}</span>
        {item.movements?.length ? (
          <ol className="movement-list">
            {item.movements.map((movement, index) => (
              <li key={`${movement.number ?? index}-${movement.title}`}>
                {movement.number ? <span>{movement.number}.</span> : null}
                <div>
                  {movement.title}
                  {movement.alternateTitles?.length ? <small>{movement.alternateTitles.join(" / ")}</small> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <details className="listen-menu">
        <summary><Search size={14} />查找录音</summary>
        <div>
          <a href={neteaseSearchUrl(keyword)} target="_blank" rel="noreferrer">网易云</a>
          <a href={qqMusicSearchUrl(keyword)} target="_blank" rel="noreferrer">QQ 音乐</a>
          <a href={bilibiliSearchUrl(keyword)} target="_blank" rel="noreferrer">B 站</a>
          <a href={resourceSearchUrl(keyword)} target="_blank" rel="noreferrer">资料</a>
          <a href={imslpSearchUrl(keyword)} target="_blank" rel="noreferrer">IMSLP</a>
          <a href={musicBrainzWorkSearchUrl(keyword)} target="_blank" rel="noreferrer">MusicBrainz</a>
        </div>
      </details>
    </article>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="section-title">{icon}{title}</div>;
}

function DetailClose({ onClose }: { onClose: () => void }) {
  return (
    <button className="detail-close" onClick={onClose} aria-label="关闭详情" title="关闭详情">
      <X size={20} />
    </button>
  );
}
