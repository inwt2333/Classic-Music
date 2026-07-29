import { ArrowLeft, Check, CircleAlert, ExternalLink, Music } from "lucide-react";
import { useEffect, useState } from "react";
import { loadEventIndex } from "../data";
import type { ConcertIndexDataset } from "../types";

type SourceStatus = ConcertIndexDataset["sources"][number];

export default function SourcesWorkspace() {
  const [dataset, setDataset] = useState<ConcertIndexDataset>();
  const [error, setError] = useState("");

  useEffect(() => {
    loadEventIndex().then(setDataset).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, []);

  const successfulSources = dataset?.sources.filter((source) => source.ok).length ?? 0;

  return (
    <main className="source-workspace">
      <header className="app-header source-page-header">
        <div className="brand-block">
          <Music size={22} />
          <div><strong>古典乐演出日历</strong><span>数据来源</span></div>
        </div>
        <a className="header-link" href={import.meta.env.BASE_URL}>
          <ArrowLeft size={15} />
          返回演出日历
        </a>
      </header>

      <section className="source-page">
        <header className="source-page-intro">
          <div>
            <span>DATA SOURCES</span>
            <h1>数据来源</h1>
            <p>各场馆与乐团官方网站的采集状态和当前收录数量。</p>
          </div>
          {dataset ? (
            <dl>
              <div><dt>来源</dt><dd>{dataset.sources.length}</dd></div>
              <div><dt>正常</dt><dd>{successfulSources}</dd></div>
              <div><dt>演出</dt><dd>{dataset.events.length}</dd></div>
            </dl>
          ) : null}
        </header>

        {error ? (
          <div className="source-page-error">
            <CircleAlert size={18} />
            数据来源加载失败：{error}
          </div>
        ) : dataset ? (
          <>
            <div className="source-table-heading" aria-hidden="true">
              <span>官方网站</span>
              <span>采集状态</span>
              <span>演出数量</span>
              <span>链接</span>
            </div>
            <div className="source-table">
              {dataset.sources.map((source) => <SourceRow key={source.id} source={source} />)}
            </div>
            <p className="source-updated">
              数据更新时间：{formatTimestamp(dataset.generatedAt)}
            </p>
          </>
        ) : (
          <div className="source-page-loading">正在加载数据来源</div>
        )}
      </section>
    </main>
  );
}

function SourceRow({ source }: { source: SourceStatus }) {
  return (
    <article className="source-row">
      <div>
        <i className={source.ok ? "ok" : ""} />
        <strong>{source.name}</strong>
      </div>
      <span className={source.ok ? "source-health ok" : "source-health warning"}>
        {source.ok ? <Check size={14} /> : <CircleAlert size={14} />}
        {source.ok ? "采集正常" : "沿用上一版"}
      </span>
      <strong className="source-event-count">{source.eventCount}<small>场</small></strong>
      <a href={source.url} target="_blank" rel="noreferrer" aria-label={`打开${source.name}`}>
        <ExternalLink size={16} />
        <span>官网</span>
      </a>
      {source.message ? <small className="source-message">{source.message}</small> : null}
    </article>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
