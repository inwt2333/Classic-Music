import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpenText,
  CalendarDays,
  Clock,
  Database,
  ExternalLink,
  MapPin,
  Music,
  Search,
  Sparkles,
  Ticket,
  UserRound,
} from "lucide-react";
import "./styles.css";
import type { ConcertDataset, ConcertEvent, ProgramItem } from "./types";

const fallbackDataset: ConcertDataset = {
  generatedAt: null,
  city: "上海",
  events: [],
  sources: [],
  stats: { rawEvents: 0, normalizedEvents: 0, aiEnhancedEvents: 0, errors: [] },
};

const quickFilters = ["本周", "本月", "东方艺术中心", "上海音乐厅", "交响", "钢琴", "贝多芬", "马勒"];

function App() {
  const [dataset, setDataset] = useState<ConcertDataset>(fallbackDataset);
  const [query, setQuery] = useState("");
  const [venue, setVenue] = useState("全部场馆");
  const [selected, setSelected] = useState<ConcertEvent | null>(null);
  const [loadState, setLoadState] = useState("读取本地采集数据中");

  useEffect(() => {
    fetch("/data/events.json", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: ConcertDataset) => {
        setDataset(data);
        setSelected(data.events[0] ?? null);
        setLoadState(data.generatedAt ? "已加载自动采集数据" : "还没有采集数据");
      })
      .catch(() => setLoadState("数据文件未生成，请先运行 npm run scrape"));
  }, []);

  const venues = useMemo(
    () => ["全部场馆", ...Array.from(new Set(dataset.events.map((event) => event.venue))).sort()],
    [dataset.events],
  );

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dataset.events.filter((event) => {
      const venueMatched = venue === "全部场馆" || event.venue === venue;
      const haystack = [
        event.title,
        event.venue,
        event.ensemble,
        event.conductor,
        event.description,
        ...event.performers,
        ...event.composers,
        ...event.tags,
        ...event.program.map(
          (item) =>
            `${item.composer ?? ""} ${item.title} ${item.opus ?? ""} ${item.movements
              ?.map((movement) => `${movement.number ?? ""} ${movement.title}`)
              .join(" ") ?? ""}`,
        ),
      ]
        .join(" ")
        .toLowerCase();
      return venueMatched && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [dataset.events, query, venue]);

  const stats = useMemo(() => {
    const works = new Set(dataset.events.flatMap((event) => event.program.map((item) => item.title)));
    const people = new Set(
      dataset.events.flatMap((event) => [event.conductor, ...event.performers].filter(Boolean) as string[]),
    );
    return {
      eventCount: dataset.events.length,
      venueCount: venues.length - 1,
      workCount: works.size,
      peopleCount: people.size,
    };
  }, [dataset.events, venues.length]);

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div>
          <div className="eyebrow">
            <Database size={16} />
            上海 demo · 自动采集实验
          </div>
          <h1>上海古典乐历</h1>
          <p>
            聚合上海音乐厅、乐团和演出场馆信息，按时间、场馆、曲目和音乐家检索。当前版本从公开页面自动采集，
            DeepSeek 抽取接口已预留。
          </p>
        </div>
        <div className="pipeline-panel">
          <div className="pipeline-title">采集状态</div>
          <strong>{loadState}</strong>
          <span>{dataset.generatedAt ? `生成时间：${formatDateTime(dataset.generatedAt)}` : "等待首次采集"}</span>
          <span>
            来源 {dataset.sources.filter((source) => source.ok).length}/{dataset.sources.length || 0} · 原始事件{" "}
            {dataset.stats.rawEvents} · 入库 {dataset.stats.normalizedEvents}
          </span>
        </div>
      </section>

      <section className="stat-row">
        <Stat icon={<CalendarDays size={18} />} label="演出" value={stats.eventCount} />
        <Stat icon={<MapPin size={18} />} label="场馆" value={stats.venueCount} />
        <Stat icon={<Music size={18} />} label="曲目候选" value={stats.workCount} />
        <Stat icon={<UserRound size={18} />} label="人物候选" value={stats.peopleCount} />
      </section>

      <section className="workspace">
        <aside className="control-panel">
          <label className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜贝多芬、马勒、钢琴、乐团、场馆..."
            />
          </label>

          <div className="filter-block">
            <span>快速筛选</span>
            <div className="chip-grid">
              {quickFilters.map((filter) => (
                <button key={filter} onClick={() => setQuery(filter)}>
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <label className="filter-block">
            <span>场馆</span>
            <select value={venue} onChange={(event) => setVenue(event.target.value)}>
              {venues.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <div className="source-list">
            <span>数据来源</span>
            {dataset.sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                <span className={source.ok ? "source-dot ok" : "source-dot"} />
                {source.name}
                <small>{source.eventCount} 场</small>
              </a>
            ))}
          </div>
        </aside>

        <section className="event-list" aria-label="演出列表">
          <div className="list-heading">
            <h2>演出列表</h2>
            <span>{filteredEvents.length} 场匹配</span>
          </div>
          {filteredEvents.map((event) => (
            <button
              key={event.id}
              className={`event-card ${selected?.id === event.id ? "active" : ""}`}
              onClick={() => setSelected(event)}
            >
              <div className="date-block">
                <strong>{event.dateLabel}</strong>
                <span>{event.weekday}</span>
              </div>
              <div className="event-main">
                <h3>{event.title}</h3>
                <div className="event-meta">
                  <span>
                    <Clock size={14} />
                    {event.timeLabel}
                  </span>
                  <span>
                    <MapPin size={14} />
                    {event.venue}
                  </span>
                </div>
                <div className="tag-line">
                  {event.tags.slice(0, 4).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </section>

        <EventDetail event={selected} />
      </section>
    </main>
  );
}

function EventDetail({ event }: { event: ConcertEvent | null }) {
  if (!event) {
    return (
      <section className="detail-panel empty">
        <Music size={28} />
        <p>运行采集脚本后，这里会展示音乐会详情。</p>
      </section>
    );
  }

  const entities = Array.from(
    new Set(
      [event.ensemble, event.conductor, ...event.performers, ...event.composers, ...event.tags].filter(
        (entity): entity is string => Boolean(entity),
      ),
    ),
  );

  return (
    <section className="detail-panel">
      <div className="detail-kicker">
        <span>{event.dataQuality}</span>
        <span>{event.sourceName}</span>
      </div>
      <h2>{event.title}</h2>
      <div className="detail-meta">
        <span>
          <CalendarDays size={16} />
          {formatDateTime(event.startTime)}
        </span>
        <span>
          <MapPin size={16} />
          {event.venue}
        </span>
        {event.price && (
          <span>
            <Ticket size={16} />
            {event.price}
          </span>
        )}
      </div>

      <div className="action-row">
        {event.ticketUrl && (
          <a className="primary-link" href={event.ticketUrl} target="_blank" rel="noreferrer">
            <Ticket size={16} />
            购票/来源
          </a>
        )}
        <a href={event.sourceUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          原始页面
        </a>
      </div>

      {event.priceTiers?.length ? (
        <div className="price-tier-list" aria-label="票价档位">
          <span>票价档位</span>
          <div>
            {event.priceTiers.map((price) => (
              <strong key={price}>{formatTicketPrice(price)}</strong>
            ))}
          </div>
        </div>
      ) : null}

      {event.description ? (
        <>
          <div className="section-title">
            <BookOpenText size={17} />
            演出简介
          </div>
          <div className="event-description">
            {event.description.split(/\n{2,}/).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
            ))}
          </div>
        </>
      ) : null}

      <div className="section-title">
        <Music size={17} />
        节目单候选
      </div>
      <div className="program-list">
        {event.program.length ? (
          event.program.map((item, index) => <ProgramRow key={`${item.title}-${index}`} item={item} />)
        ) : (
          <p className="muted">当前来源没有节目单正文。后续可用 DeepSeek 从详情页补全。</p>
        )}
      </div>

      <div className="section-title">
        <Sparkles size={17} />
        人物与标签
      </div>
      <div className="entity-list">
        {entities.map((entity) => (
          <a key={entity} href={bilibiliSearchUrl(entity)} target="_blank" rel="noreferrer">
            {entity}
          </a>
        ))}
      </div>
    </section>
  );
}

function ProgramRow({ item }: { item: ProgramItem }) {
  const keyword = [item.composer, item.title, item.opus].filter(Boolean).join(" ");
  return (
    <div className="program-row">
      <div>
        <strong>{item.title}</strong>
        <span>{[item.composer, item.opus].filter(Boolean).join(" · ") || item.confidence}</span>
        {item.movements?.length ? (
          <ol className="movement-list">
            {item.movements.map((movement, index) => (
              <li key={`${movement.number ?? index}-${movement.title}`}>
                {movement.number && <span>{movement.number}.</span>}
                {movement.title}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <div className="music-links">
        <a href={neteaseSearchUrl(keyword)} target="_blank" rel="noreferrer">
          网易云
        </a>
        <a href={qqMusicSearchUrl(keyword)} target="_blank" rel="noreferrer">
          QQ音乐
        </a>
        <a href={bilibiliSearchUrl(keyword)} target="_blank" rel="noreferrer">
          B站
        </a>
        <a href={resourceSearchUrl(keyword)} target="_blank" rel="noreferrer">
          资料检索
        </a>
        <a href={imslpSearchUrl(keyword)} target="_blank" rel="noreferrer">
          IMSLP
        </a>
        <a href={musicBrainzWorkSearchUrl(keyword)} target="_blank" rel="noreferrer">
          MusicBrainz
        </a>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="stat-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTicketPrice(price: number) {
  return price === 0 ? "免费" : `¥${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

function neteaseSearchUrl(keyword: string) {
  return `https://music.163.com/#/search/m/?s=${encodeURIComponent(keyword)}&type=1`;
}

function qqMusicSearchUrl(keyword: string) {
  return `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(keyword)}`;
}

function bilibiliSearchUrl(keyword: string) {
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`;
}

function resourceSearchUrl(keyword: string) {
  return `https://cn.bing.com/search?q=${encodeURIComponent(`${keyword} 古典音乐 作品介绍`)}`;
}

function imslpSearchUrl(keyword: string) {
  return `https://imslp.org/wiki/Special:Search?search=${encodeURIComponent(keyword)}`;
}

function musicBrainzWorkSearchUrl(keyword: string) {
  return `https://musicbrainz.org/search?query=${encodeURIComponent(keyword)}&type=work&method=indexed`;
}

createRoot(document.getElementById("root")!).render(<App />);
