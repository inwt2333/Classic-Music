import { ArrowLeft, Bell, CalendarClock, ExternalLink, MapPin, Music, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadChanges, loadEventIndex } from "../data";
import type { ChangeDataset, ConcertIndexDataset, DatasetChange } from "../types";
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

export default function ChangesWorkspace() {
  const [changes, setChanges] = useState<ChangeDataset | null>(null);
  const [dataset, setDataset] = useState<ConcertIndexDataset | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([loadChanges(), loadEventIndex()])
      .then(([changeData, eventData]) => {
        setChanges(changeData);
        setDataset(eventData);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  const eventsById = useMemo(() => new Map(dataset?.events.map((event) => [event.id, event])), [dataset]);
  const grouped = useMemo(() => {
    const map = new Map<DatasetChange["type"], DatasetChange[]>();
    for (const change of changes?.changes ?? []) {
      map.set(change.type, [...(map.get(change.type) ?? []), change]);
    }
    return [...map.entries()];
  }, [changes]);

  return (
    <main className="source-workspace">
      <header className="review-header source-page-header">
        <div className="brand-block">
          <Bell size={22} />
          <div><strong>最近变化</strong><span>新增、取消、延期和字段变化</span></div>
        </div>
        <a href="./"><ArrowLeft size={15} />返回日历</a>
      </header>

      <section className="source-page changes-page">
        <div className="source-page-intro">
          <div>
            <span>CHANGELOG</span>
            <h1>采集变化记录</h1>
            <p>展示最近一次采集相对上一版数据发现的结构化变化。</p>
          </div>
          <dl>
            <div>
              <dt>更新时间</dt>
              <dd>{changes?.generatedAt ? new Date(changes.generatedAt).toLocaleDateString("zh-CN") : "--"}</dd>
            </div>
            <div>
              <dt>变化数</dt>
              <dd>{changes?.changes.length ?? 0}</dd>
            </div>
          </dl>
        </div>

        {error ? <p className="muted">加载失败：{error}</p> : null}
        {!error && changes && !changes.changes.length ? (
          <div className="empty-results changes-empty">
            <CalendarClock size={30} />
            <h2>最近一次采集没有发现结构化变化</h2>
            <p>新增、取消、延期、换人、换曲和票价变化会显示在这里。</p>
          </div>
        ) : null}

        {grouped.map(([type, items]) => (
          <section className="change-group" key={type}>
            <h2>{changeLabels[type]} <span>{items.length}</span></h2>
            <div>
              {items.map((change) => {
                const event = eventsById.get(change.eventId);
                return (
                  <details className="change-row" key={change.id}>
                    <summary>
                      <span>
                        <time>{new Date(change.detectedAt).toLocaleString("zh-CN", { hour12: false })}</time>
                        <strong>{event?.title ?? change.eventId}</strong>
                        <p>{change.summary}</p>
                        {event ? <small>{event.dateLabel} {event.timeLabel} · {formatEventVenue(event)}</small> : null}
                      </span>
                    </summary>
                    <div className="change-detail">
                      <dl>
                        <div>
                          <dt>变化类型</dt>
                          <dd>{changeLabels[change.type]}</dd>
                        </div>
                        <div>
                          <dt>检测时间</dt>
                          <dd>{new Date(change.detectedAt).toLocaleString("zh-CN", { hour12: false })}</dd>
                        </div>
                        <div>
                          <dt>事件 ID</dt>
                          <dd>{change.eventId}</dd>
                        </div>
                        <div>
                          <dt>摘要</dt>
                          <dd>{change.summary}</dd>
                        </div>
                      </dl>

                      {event ? (
                        <>
                          <div className="change-event-meta">
                            <span><CalendarClock size={15} />{event.dateLabel} {event.weekday} {event.timeLabel}</span>
                            <span><MapPin size={15} />{formatEventVenue(event)}</span>
                            {event.price ? <span><Ticket size={15} />{event.price}</span> : null}
                          </div>

                          {event.programPreview.length ? (
                            <div className="change-program">
                              <span><Music size={15} />节目单预览</span>
                              <ul>
                                {event.programPreview.slice(0, 5).map((item) => (
                                  <li key={`${item.workId ?? item.title}-${item.title}`}>
                                    {[item.composer, item.title].filter(Boolean).join(" · ")}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <a className="change-open-event" href={`./?event=${encodeURIComponent(event.id)}`}>
                            <ExternalLink size={15} />在日历中打开
                          </a>
                        </>
                      ) : (
                        <p className="muted">这条变化对应的演出不在当前索引中，可能已下架或被合并到其他记录。</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
