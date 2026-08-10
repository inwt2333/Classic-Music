import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarClock,
  ExternalLink,
  MapPin,
  Music,
  RotateCcw,
  Search,
  Ticket,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadChanges, loadEventIndex } from "../data";
import type {
  ChangeEventSnapshot,
  ChangeDataset,
  ConcertEventSummary,
  ConcertIndexDataset,
  DatasetChange,
} from "../types";
import { formatEventVenue } from "../utils";

const changeLabels: Record<DatasetChange["type"], string> = {
  added: "新增",
  removed: "下架",
  rescheduled: "延期/改期",
  cancelled: "取消",
  lineup: "阵容变化",
  program: "曲目变化",
  price: "票价变化",
};

const changeTypes = Object.entries(changeLabels) as Array<[DatasetChange["type"], string]>;
const PAGE_SIZE = 80;

export default function ChangesWorkspace() {
  const [changes, setChanges] = useState<ChangeDataset | null>(null);
  const [dataset, setDataset] = useState<ConcertIndexDataset | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DatasetChange["type"] | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [latestOnly, setLatestOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    Promise.all([loadChanges(), loadEventIndex()])
      .then(([changeData, eventData]) => {
        setChanges(changeData);
        setDataset(eventData);
      })
      .catch((reason) => {
        console.error("Unable to load change history", reason);
        setError("变化记录暂时无法载入，请稍后重试。");
      });
  }, []);

  useEffect(() => setVisibleCount(PAGE_SIZE), [query, typeFilter, fromDate, toDate, latestOnly]);

  const eventsById = useMemo(
    () => new Map(dataset?.events.map((event) => [event.id, event])),
    [dataset],
  );
  const latestIds = useMemo(() => {
    if (!changes) return new Set<string>();
    if (changes.latestChangeIds) return new Set(changes.latestChangeIds);
    return new Set(
      changes.changes
        .filter((item) => item.detectedAt === changes.generatedAt)
        .map((item) => item.id),
    );
  }, [changes]);
  const filteredChanges = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return (changes?.changes ?? []).filter((change) => {
      if (latestOnly && !latestIds.has(change.id)) return false;
      if (typeFilter !== "all" && change.type !== typeFilter) return false;
      const dateKey = localDateKey(change.detectedAt);
      if (fromDate && dateKey < fromDate) return false;
      if (toDate && dateKey > toDate) return false;
      if (!normalizedQuery) return true;
      const current = eventsById.get(change.eventId);
      const snapshot = change.after ?? change.before;
      const program = current?.programPreview ?? snapshot?.programPreview ?? [];
      return [
        change.summary,
        changeLabels[change.type],
        current?.title,
        current?.searchText,
        snapshot?.title,
        snapshot?.city,
        snapshot?.venue,
        snapshot?.hall,
        snapshot?.sourceName,
        ...program.flatMap((item) => [item.composer, item.title, item.opus]),
      ].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    });
  }, [changes, eventsById, fromDate, latestIds, latestOnly, query, toDate, typeFilter]);
  const visibleChanges = filteredChanges.slice(0, visibleCount);
  const grouped = useMemo(() => {
    const map = new Map<string, DatasetChange[]>();
    for (const change of visibleChanges) {
      const key = localDateKey(change.detectedAt);
      map.set(key, [...(map.get(key) ?? []), change]);
    }
    return [...map.entries()];
  }, [visibleChanges]);
  const hasFilters = Boolean(query || fromDate || toDate || latestOnly || typeFilter !== "all");
  const changeTypeCount = new Set(changes?.changes.map((item) => item.type)).size;
  function resetFilters() {
    setQuery("");
    setTypeFilter("all");
    setFromDate("");
    setToDate("");
    setLatestOnly(false);
  }

  return (
    <main className="source-workspace">
      <header className="review-header source-page-header">
        <div className="brand-block">
          <Bell size={22} />
          <div><strong>变化历史</strong><span>演出数据变更记录</span></div>
        </div>
        <a href="./"><ArrowLeft size={15} />返回日历</a>
      </header>

      <section className="source-page changes-page">
        <div className="source-page-intro">
          <div>
            <span>CHANGELOG</span>
            <h1>演出数据变更历史</h1>
            <p>新增、下架、改期、取消、阵容、曲目与票价</p>
          </div>
          <dl>
            <div>
              <dt>数据更新时间</dt>
              <dd>{changes?.generatedAt ? formatDate(changes.generatedAt) : "--"}</dd>
            </div>
            <div>
              <dt>历史变更</dt>
              <dd>{changes?.changes.length ?? 0}</dd>
            </div>
            <div>
              <dt>变化类型</dt>
              <dd>{changeTypeCount}</dd>
            </div>
          </dl>
        </div>

        <div className="change-filters" aria-label="变更记录筛选">
          <label className="change-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索演出、场馆、曲目或来源"
            />
          </label>
          <label>
            <span>变化类型</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
              <option value="all">全部类型</option>
              {changeTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>起始日期</span>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            <span>结束日期</span>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
          </label>
          {latestIds.size ? <label className="change-latest-toggle">
            <input type="checkbox" checked={latestOnly} onChange={(event) => setLatestOnly(event.target.checked)} />
            <span>仅看最近更新</span>
          </label> : null}
          <button type="button" className="change-reset" title="重置筛选" aria-label="重置筛选" disabled={!hasFilters} onClick={resetFilters}>
            <RotateCcw size={16} />
          </button>
        </div>

        <div className="change-result-summary">
          <span>{filteredChanges.length} 条记录</span>
          {latestOnly ? <small>最近更新 {latestIds.size} 条</small> : null}
        </div>

        {error ? <p className="muted">{error}</p> : null}
        {!error && changes && !changes.changes.length ? (
          <div className="empty-results changes-empty">
            <CalendarClock size={30} />
            <h2>尚无历史变更</h2>
            <p>演出时间、阵容、曲目或票价发生变化后，会记录在这里。</p>
          </div>
        ) : null}
        {!error && changes?.changes.length && !filteredChanges.length ? (
          <div className="empty-results changes-empty">
            <Search size={30} />
            <h2>没有符合条件的记录</h2>
            <button type="button" onClick={resetFilters}>清除筛选</button>
          </div>
        ) : null}

        {grouped.map(([date, items]) => (
          <section className="change-group" key={date}>
            <h2>{formatDateHeading(date)} <span>{items.length}</span></h2>
            <div>
              {items.map((change) => (
                <ChangeRow key={change.id} change={change} event={eventsById.get(change.eventId)} />
              ))}
            </div>
          </section>
        ))}

        {visibleCount < filteredChanges.length ? (
          <button className="change-load-more" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            加载更多
          </button>
        ) : null}
      </section>
    </main>
  );
}

function ChangeRow({ change, event }: { change: DatasetChange; event?: ConcertEventSummary }) {
  const snapshot = change.after ?? change.before;
  const title = event?.title ?? snapshot?.title ?? titleFromSummary(change.summary) ?? change.eventId;
  const venue = event ? formatEventVenue(event) : snapshot ? formatSnapshotVenue(snapshot) : "";
  const startTime = event?.startTime ?? snapshot?.startTime;
  const price = event?.price ?? snapshot?.price;
  const program = event?.programPreview ?? snapshot?.programPreview ?? [];

  return (
    <details className={`change-row change-${change.type}`}>
      <summary>
        <span>
          <span className="change-row-heading">
            <time>{formatDateTime(change.detectedAt)}</time>
            <em>{changeLabels[change.type]}</em>
          </span>
          <strong>{title}</strong>
          <p>{change.summary}</p>
          {startTime || venue ? <small>{[startTime ? formatConcertTime(startTime) : "", venue].filter(Boolean).join(" · ")}</small> : null}
        </span>
      </summary>
      <div className="change-detail">
        <dl>
          <div><dt>变化类型</dt><dd>{changeLabels[change.type]}</dd></div>
          <div><dt>检测时间</dt><dd>{formatDateTime(change.detectedAt)}</dd></div>
          <div><dt>事件 ID</dt><dd>{change.eventId}</dd></div>
          <div><dt>数据来源</dt><dd>{snapshot?.sourceName ?? "--"}</dd></div>
        </dl>

        {change.before || change.after ? <ChangeComparison before={change.before} after={change.after} type={change.type} /> : null}

        <div className="change-event-meta">
          {startTime ? <span><CalendarClock size={15} />{formatConcertTime(startTime)}</span> : null}
          {venue ? <span><MapPin size={15} />{venue}</span> : null}
          {price ? <span><Ticket size={15} />{price}</span> : null}
        </div>

        {program.length ? (
          <div className="change-program">
            <span><Music size={15} />节目单快照</span>
            <ul>
              {program.slice(0, 8).map((item, index) => (
                <li key={`${item.title}-${index}`}>{[item.composer, item.title, item.opus].filter(Boolean).join(" · ")}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {event ? (
          <a className="change-open-event" href={`./?event=${encodeURIComponent(event.id)}`}>
            <ExternalLink size={15} />在日历中打开
          </a>
        ) : (
          <p className="muted">该演出不在当前索引中，以上内容来自变更发生时保存的快照。</p>
        )}
      </div>
    </details>
  );
}

function ChangeComparison({
  before,
  after,
  type,
}: {
  before?: ChangeEventSnapshot;
  after?: ChangeEventSnapshot;
  type: DatasetChange["type"];
}) {
  if (type === "program" && before && after) {
    return <ProgramDifference before={before.programPreview} after={after.programPreview} />;
  }
  if (type === "lineup" && before && after) {
    const previous = [before.conductor, ...before.performers].filter((value): value is string => Boolean(value));
    const current = [after.conductor, ...after.performers].filter((value): value is string => Boolean(value));
    return <ListDifference removed={previous.filter((item) => !current.includes(item))} added={current.filter((item) => !previous.includes(item))} />;
  }
  const beforeValue = snapshotValue(before, type);
  const afterValue = snapshotValue(after, type);
  return (
    <div className="change-value-difference">
      <section><span>变更前</span><p>{beforeValue || "无记录"}</p></section>
      <ArrowRight size={17} aria-hidden="true" />
      <section><span>变更后</span><p>{afterValue || "无记录"}</p></section>
    </div>
  );
}

function ProgramDifference({
  before,
  after,
}: {
  before: ChangeEventSnapshot["programPreview"];
  after: ChangeEventSnapshot["programPreview"];
}) {
  const removed = subtractProgramItems(before, after).map(formatProgramItem);
  const added = subtractProgramItems(after, before).map(formatProgramItem);
  if (!removed.length && !added.length && before.map(programKey).join("\n") !== after.map(programKey).join("\n")) {
    return (
      <div className="change-list-difference">
        <ProgramSequence label="原顺序" items={before} />
        <ProgramSequence label="新顺序" items={after} />
      </div>
    );
  }
  return <ListDifference removed={removed} added={added} />;
}

function ProgramSequence({ label, items }: { label: string; items: ChangeEventSnapshot["programPreview"] }) {
  return (
    <section>
      <span>{label}</span>
      <ol>{items.map((item, index) => <li key={`${programKey(item)}-${index}`}>{formatProgramItem(item)}</li>)}</ol>
    </section>
  );
}

function ListDifference({ removed, added }: { removed: string[]; added: string[] }) {
  if (!removed.length && !added.length) {
    return <p className="change-no-field-difference">未检测到可展示的字段差异</p>;
  }
  return (
    <div className="change-list-difference">
      <section className="change-removed-items">
        <span>删除 {removed.length}</span>
        {removed.length ? <ul>{removed.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>无</p>}
      </section>
      <section className="change-added-items">
        <span>新增 {added.length}</span>
        {added.length ? <ul>{added.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>无</p>}
      </section>
    </div>
  );
}

function snapshotValue(snapshot: ChangeEventSnapshot | undefined, type: DatasetChange["type"]) {
  if (!snapshot) return "";
  if (type === "rescheduled") return formatConcertTime(snapshot.startTime);
  if (type === "price") return snapshot.price || "票价待定";
  if (type === "cancelled") return snapshot.status === "cancelled" ? "已取消" : "正常演出";
  return `${snapshot.title} · ${formatConcertTime(snapshot.startTime)} · ${formatSnapshotVenue(snapshot)}`;
}

function programKey(item: ChangeEventSnapshot["programPreview"][number]) {
  return JSON.stringify({
    composer: item.composer ?? "",
    title: item.title,
    opus: item.opus ?? "",
    alternateTitles: item.alternateTitles ?? [],
    credits: item.credits ?? [],
    movements: item.movements ?? [],
  });
}

function formatProgramItem(item: ChangeEventSnapshot["programPreview"][number]) {
  const work = [item.composer, item.title, item.opus].filter(Boolean).join(" · ");
  const credits = item.credits?.map((credit) => `${credit.name}（${credit.role}）`).join("、");
  const movements = item.movements?.map((movement) => [movement.number, movement.title].filter(Boolean).join(" ")).join(" / ");
  return [work, credits, movements].filter(Boolean).join("；");
}

function subtractProgramItems(
  source: ChangeEventSnapshot["programPreview"],
  comparison: ChangeEventSnapshot["programPreview"],
) {
  const remaining = new Map<string, number>();
  for (const item of comparison) {
    const key = programKey(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return source.filter((item) => {
    const key = programKey(item);
    const count = remaining.get(key) ?? 0;
    if (!count) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

function formatSnapshotVenue(snapshot: ChangeEventSnapshot) {
  return [snapshot.city, snapshot.venue, snapshot.hall].filter(Boolean).join(" · ");
}

function titleFromSummary(summary: string) {
  const title = summary.replace(/^(?:新增演出|官网不再返回|演出时间变化|演出取消|票价变化|演出人员变化|节目单变化)：\s*/, "").trim();
  return title && title !== summary ? title : undefined;
}

function localDateKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN");
}

function formatDateHeading(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatConcertTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
