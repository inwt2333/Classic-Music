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
  ImageIcon,
  MapPin,
  LoaderCircle,
  Maximize2,
  Music,
  Search,
  Share2,
  Star,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import CorrectionDialog from "./CorrectionDialog";
import {
  detectDataIssues,
  makeFollowTarget,
  type FollowMap,
  type FollowTarget,
} from "../discovery-features";
import type { ConcertEvent, EntityRecord, EventEvidenceImage, ProgramCredit, ProgramItem } from "../types";
import type { KnowledgeWorkSummary } from "../knowledge/types";
import type { PersonalEventStatus } from "../product-features";
import {
  bilibiliSearchUrl,
  formatDateTime,
  formatEventVenue,
  imslpSearchUrl,
  musicBrainzWorkSearchUrl,
  normalizeEnsembleName,
  resourceSearchUrl,
} from "../utils";

export default function EventDetail({
  event,
  loading,
  open,
  modal,
  entitiesByKey,
  knowledgeWorksById,
  panelRef,
  closeButtonRef,
  onClose,
  onExplore,
  onExploreWork,
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
  modal: boolean;
  entitiesByKey: Map<string, EntityRecord>;
  knowledgeWorksById: Map<string, KnowledgeWorkSummary>;
  panelRef?: RefObject<HTMLElement | null>;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onExplore: (entity: EntityRecord) => void;
  onExploreWork: (workId: string) => void;
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
  const [evidenceImage, setEvidenceImage] = useState<EventEvidenceImage>();
  useEffect(() => setEvidenceImage(undefined), [event?.id]);
  useEffect(() => {
    if (!evidenceImage) return undefined;
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") setEvidenceImage(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [evidenceImage]);
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
  const ensemble = normalizeEnsembleName(event.ensemble) ?? event.ensemble;
  const dataIssues = detectDataIssues(event);
  const evidenceImages = event.extraction?.images ?? [];
  const showEvidenceImages = evidenceImages.length > 0
    && event.dataQuality !== "manual-reviewed"
    && (event.program.length === 0 || event.dataQuality === "ocr-assisted" || event.extraction?.accepted === false);

  return (
    <section
      ref={panelRef}
      className={`detail-panel ${open ? "open" : ""}`}
      role={modal ? "dialog" : "region"}
      aria-modal={modal ? "true" : undefined}
      aria-label="演出详情"
    >
      <DetailClose buttonRef={closeButtonRef} onClose={onClose} />
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

      {dataIssues.length ? <div className="quality-card warning">
        <Flag size={18} />
        <div>
          <strong>部分信息可能不完整</strong>
          {dataIssues.map((issue) => <small key={issue}>{issue}</small>)}
        </div>
        <button type="button" onClick={() => setCorrectionOpen(true)}><Flag size={14} />信息有误</button>
      </div> : null}

      {event.priceTiers?.length ? (
        <div className="price-tier-list" aria-label="票价档位">
          <span>票价档位</span>
          <div>{event.priceTiers.map((price) => <strong key={price}>{price === 0 ? "免费" : `¥${price}`}</strong>)}</div>
        </div>
      ) : null}

      {people.length || ensemble ? (
        <>
          <SectionTitle icon={<UserRound size={17} />} title="人物与乐团" />
          <div className="entity-list">
            {ensemble ? (
              <EntityChip
                name={ensemble}
                entity={entitiesByKey.get(`ensemble:${ensemble}`)}
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
          节目单来自官方图片，文字信息可能不完整，请结合下方原图查看。
        </p>
      ) : null}
      <div className="program-list">
        {event.program.length ? (
          event.program.map((item, index) => (
            <ProgramRow
              key={item.id ?? `${item.title}-${index}`}
              item={item}
              entity={item.workId ? entitiesByKey.get(`work:${item.workId}`) : undefined}
              knowledge={item.knowledgeWorkId ? knowledgeWorksById.get(item.knowledgeWorkId) : undefined}
              onExplore={onExplore}
              onExploreWork={onExploreWork}
              follows={follows}
              onToggleFollow={onToggleFollow}
            />
          ))
        ) : (
          <p className="muted">官网暂未提供完整的文字节目单。</p>
        )}
      </div>

      {showEvidenceImages ? (
        <details className="ocr-evidence-disclosure">
          <summary>
            <ImageIcon size={17} />
            <span>原始节目单图片</span>
            <small>{evidenceImages.length} 张</small>
          </summary>
          <div className="ocr-evidence-content">
            <p>以下图片来自演出官方页面，可展开查看完整内容。</p>
            <div className="ocr-evidence-gallery">
              {evidenceImages.map((image, index) => (
                <button key={image.url} type="button" onClick={() => setEvidenceImage(image)}>
                  <img
                    src={image.url}
                    alt={`官方节目单原图 ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                  <span><Maximize2 size={13} />查看第 {index + 1} 张大图</span>
                </button>
              ))}
            </div>
            <a href={event.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />查看官方演出页面
            </a>
          </div>
        </details>
      ) : null}

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
            <ExternalLink size={13} />
          </a>
        ))}
      </div>
      <CorrectionDialog event={event} issues={dataIssues} open={correctionOpen} onClose={() => setCorrectionOpen(false)} />
      {evidenceImage ? (
        <div
          className="ocr-evidence-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="原始节目单大图"
          onClick={(clickEvent) => {
            if (clickEvent.target === clickEvent.currentTarget) setEvidenceImage(undefined);
          }}
        >
          <div>
            <header>
              <strong>原始节目单图片</strong>
              <button type="button" aria-label="关闭大图" onClick={() => setEvidenceImage(undefined)}><X size={19} /></button>
            </header>
            <img src={evidenceImage.url} alt="官方节目单原图" referrerPolicy="no-referrer" />
            <a href={evidenceImage.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />在新窗口打开原图</a>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProgramRow({
  item,
  entity,
  knowledge,
  onExplore,
  onExploreWork,
  follows,
  onToggleFollow,
}: {
  item: ProgramItem;
  entity?: EntityRecord;
  knowledge?: KnowledgeWorkSummary;
  onExplore: (entity: EntityRecord) => void;
  onExploreWork: (workId: string) => void;
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
  const target = knowledge
    ? makeFollowTarget("work", knowledge.title, knowledge.id)
    : entity ? makeFollowTarget("work", entity.name, entity.id) : undefined;
  const followed = target ? Boolean(follows[target.key]) : false;
  return (
    <article className="program-row">
      <div className="program-copy">
        {item.knowledgeWorkId ? (
          <button className="work-link" onClick={() => onExploreWork(item.knowledgeWorkId!)}>{item.title}</button>
        ) : entity ? (
          <button className="work-link" onClick={() => onExplore(entity)}>{item.title}</button>
        ) : <strong>{item.title}</strong>}
        {item.knowledgeWorkId ? (
          <button
            className="knowledge-work-link"
            type="button"
            data-knowledge-work-id={item.knowledgeWorkId}
            onClick={() => onExploreWork(item.knowledgeWorkId!)}
          >
            <BookOpenText size={13} />了解作品
          </button>
        ) : null}
        {target ? (
          <button
            type="button"
            className={`work-follow-button ${followed ? "active" : ""}`}
            title={followed ? "取消关注作品" : "关注作品"}
            aria-label={`${followed ? "取消关注" : "关注"}${knowledge?.title ?? entity?.name}`}
            onClick={() => onToggleFollow(target)}
          >
            <Star size={13} />
          </button>
        ) : null}
        {item.alternateTitles?.length ? (
          <small className="program-alternate-title">{item.alternateTitles.join(" / ")}</small>
        ) : null}
        {[item.composer, item.opus].some(Boolean) ? (
          <span>{[item.composer, item.opus].filter(Boolean).join(" · ")}</span>
        ) : null}
        {knowledge ? (
          <div className="program-knowledge-preview">
            <p>{knowledge.summary}</p>
            <div>
              {knowledge.durationMinutes ? <span><Clock size={11} />约 {knowledge.durationMinutes} 分钟</span> : null}
              {knowledge.difficulty ? <span>{knowledge.difficulty}</span> : null}
              {knowledge.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>
        ) : null}
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
