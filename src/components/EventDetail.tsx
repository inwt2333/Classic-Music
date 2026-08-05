import {
  BellPlus,
  BookOpenText,
  CalendarDays,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Flag,
  MapPin,
  LoaderCircle,
  Music,
  Search,
  Share2,
  ShieldCheck,
  Star,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import CorrectionDialog from "./CorrectionDialog";
import {
  detectDataIssues,
  makeFollowTarget,
  type FollowMap,
  type FollowTarget,
} from "../discovery-features";
import type { ConcertEvent, EntityRecord, ProgramCredit, ProgramItem } from "../types";
import type { PersonalEventStatus } from "../product-features";
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
  panelRef,
  closeButtonRef,
  onClose,
  onExplore,
  onExploreVenue,
  onCopy,
  onDownloadIcs,
  onShare,
  follows,
  onToggleFollow,
  personalStatus,
  onSetPersonalStatus,
}: {
  event: ConcertEvent | null;
  loading: boolean;
  open: boolean;
  entitiesByKey: Map<string, EntityRecord>;
  panelRef?: RefObject<HTMLElement | null>;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onExplore: (entity: EntityRecord) => void;
  onExploreVenue: (venue: string) => void;
  onCopy: (event: ConcertEvent) => void;
  onDownloadIcs: (event: ConcertEvent) => void;
  onShare: (event: ConcertEvent) => Promise<void>;
  follows: FollowMap;
  onToggleFollow: (target: FollowTarget) => void;
  personalStatus?: PersonalEventStatus;
  onSetPersonalStatus: (eventId: string, status: PersonalEventStatus | null) => void;
}) {
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  if (loading) {
    return (
      <section ref={panelRef} className={`detail-panel ${open ? "open" : ""}`} aria-live="polite">
        <DetailClose buttonRef={closeButtonRef} onClose={onClose} />
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
      <section ref={panelRef} className={`detail-panel empty ${open ? "open" : ""}`}>
        <DetailClose buttonRef={closeButtonRef} onClose={onClose} />
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
  const dataIssues = detectDataIssues(event);

  return (
    <section
      ref={panelRef}
      className={`detail-panel ${open ? "open" : ""}`}
      role={open ? "dialog" : undefined}
      aria-modal={open ? "true" : undefined}
      aria-label="演出详情"
    >
      <DetailClose buttonRef={closeButtonRef} onClose={onClose} />
      <div className="detail-kicker">
        <span>{qualityLabel}</span>
        <span>{event.sources?.length ?? 1} 个来源</span>
      </div>
      <h2>{event.title}</h2>

      <div className="detail-meta">
        <span><CalendarDays size={16} />{formatDateTime(event.startTime)}</span>
        <button type="button" onClick={() => onExploreVenue(event.venue)}>
          <MapPin size={16} />{formatEventVenue(event)}
        </button>
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
        <button type="button" onClick={() => onDownloadIcs(event)}>
          <Download size={16} />加入日历
        </button>
        <button type="button" onClick={() => onCopy(event)}>
          <Copy size={16} />复制信息
        </button>
        <button type="button" disabled={sharing} onClick={async () => {
          setSharing(true);
          try {
            await onShare(event);
          } finally {
            setSharing(false);
          }
        }}>
          {sharing ? <LoaderCircle className="spin" size={16} /> : <Share2 size={16} />}
          {sharing ? "正在生成" : "复制分享卡片"}
        </button>
      </div>

      <div className="personal-actions" aria-label="个人标记">
        <button
          type="button"
          className={personalStatus === "interested" ? "active" : ""}
          onClick={() => onSetPersonalStatus(event.id, personalStatus === "interested" ? null : "interested")}
        >
          <Clock size={15} />想去
        </button>
        <button
          type="button"
          className={personalStatus === "attended" ? "active" : ""}
          onClick={() => onSetPersonalStatus(event.id, personalStatus === "attended" ? null : "attended")}
        >
          <Check size={15} />已去
        </button>
      </div>

      <div className={`quality-card ${dataIssues.length ? "warning" : ""}`}>
        {dataIssues.length ? <Flag size={18} /> : <ShieldCheck size={18} />}
        <div>
          <strong>{dataIssues.length ? "这条信息可能需要核对" : "数据来源清晰"}</strong>
          <span>{qualityLabel} · {event.sources?.length ?? 1} 个来源 · 最后采集 {formatDateTime(event.scrapedAt)}</span>
          {dataIssues.map((issue) => <small key={issue}>{issue}</small>)}
        </div>
        <button type="button" onClick={() => setCorrectionOpen(true)}><Flag size={14} />信息有误</button>
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
            {event.ensemble ? (
              <EntityChip
                name={event.ensemble}
                entity={entitiesByKey.get(`ensemble:${event.ensemble}`)}
                follows={follows}
                onExplore={onExplore}
                onToggleFollow={onToggleFollow}
              />
            ) : null}
            {people.map((person) => {
              const entity = entitiesByKey.get(`person:${person}`);
              return (
                <EntityChip
                  key={person}
                  name={person}
                  entity={entity}
                  follows={follows}
                  onExplore={onExplore}
                  onToggleFollow={onToggleFollow}
                />
              );
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
              follows={follows}
              onToggleFollow={onToggleFollow}
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
      <CorrectionDialog event={event} issues={dataIssues} open={correctionOpen} onClose={() => setCorrectionOpen(false)} />
    </section>
  );
}

function ProgramRow({
  item,
  entity,
  onExplore,
  follows,
  onToggleFollow,
}: {
  item: ProgramItem;
  entity?: EntityRecord;
  onExplore: (entity: EntityRecord) => void;
  follows: FollowMap;
  onToggleFollow: (target: FollowTarget) => void;
}) {
  const keyword = [
    item.composer,
    item.title,
    ...(item.alternateTitles ?? []),
    item.opus,
    ...(item.credits?.map(formatProgramCredit) ?? []),
  ].filter(Boolean).join(" ");
  const target = entity ? makeFollowTarget("work", entity.name, entity.id) : undefined;
  const followed = target ? Boolean(follows[target.key]) : false;
  return (
    <article className="program-row">
      <div className="program-copy">
        {entity ? <button className="work-link" onClick={() => onExplore(entity)}>{item.title}</button> : <strong>{item.title}</strong>}
        {target ? (
          <button
            type="button"
            className={`work-follow-button ${followed ? "active" : ""}`}
            title={followed ? "取消关注作品" : "关注作品"}
            aria-label={`${followed ? "取消关注" : "关注"}${entity?.name}`}
            onClick={() => onToggleFollow(target)}
          >
            <Star size={13} />
          </button>
        ) : null}
        {item.alternateTitles?.length ? (
          <small className="program-alternate-title">{item.alternateTitles.join(" / ")}</small>
        ) : null}
        <span>{[item.composer, item.opus].filter(Boolean).join(" · ") || "曲目信息待补充"}</span>
        {item.credits?.length ? (
          <small className="program-credits">{item.credits.map(formatProgramCredit).join(" / ")}</small>
        ) : null}
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

function EntityChip({
  name,
  entity,
  follows,
  onExplore,
  onToggleFollow,
}: {
  name: string;
  entity?: EntityRecord;
  follows: FollowMap;
  onExplore: (entity: EntityRecord) => void;
  onToggleFollow: (target: FollowTarget) => void;
}) {
  const type = entity?.type === "ensemble" ? "ensemble" : "person";
  const target = makeFollowTarget(type, name, entity?.id);
  const followed = Boolean(follows[target.key]);
  return (
    <span className="entity-chip">
      {entity ? <button type="button" onClick={() => onExplore(entity)}>{name}</button> : <em>{name}</em>}
      <button
        type="button"
        className={followed ? "active" : ""}
        title={followed ? "取消关注" : "关注"}
        aria-label={`${followed ? "取消关注" : "关注"}${name}`}
        onClick={() => onToggleFollow(target)}
      >
        <BellPlus size={13} />
      </button>
    </span>
  );
}

function formatProgramCredit(credit: ProgramCredit) {
  return `${credit.name} ${credit.role}`;
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="section-title">{icon}{title}</div>;
}

function DetailClose({
  onClose,
  buttonRef,
}: {
  onClose: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button ref={buttonRef} className="detail-close" onClick={onClose} aria-label="关闭详情" title="关闭详情">
      <X size={20} />
    </button>
  );
}
