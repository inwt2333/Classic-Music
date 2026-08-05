import {
  Check,
  ExternalLink,
  FileInput,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ProgramItem,
  WechatImportCandidate,
  WechatImportEventDraft,
  WechatImportRecord,
  WechatImportState,
} from "../types";

type CandidateSelection = {
  record: WechatImportRecord;
  candidate: WechatImportCandidate;
};

type EditableProgramItem = {
  composer: string;
  title: string;
  opus: string;
  alternateTitles: string;
};

export default function WechatImportWorkspace() {
  const [state, setState] = useState<WechatImportState>({ aiAvailable: false, imports: [] });
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState<WechatImportEventDraft | null>(null);
  const [program, setProgram] = useState<EditableProgramItem[]>([]);
  const [articleUrl, setArticleUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [status, setStatus] = useState("正在加载公众号收件箱");
  const [busy, setBusy] = useState(false);

  const pending = useMemo<CandidateSelection[]>(() =>
    state.imports.flatMap((record) => record.candidates
      .filter((candidate) => candidate.status === "pending")
      .map((candidate) => ({ record, candidate }))),
  [state.imports]);
  const selected = pending.find(({ record, candidate }) =>
    `${record.id}:${candidate.id}` === selectedKey,
  ) ?? pending[0];

  useEffect(() => {
    loadWechatImports()
      .then((next) => {
        setState(next);
        setStatus(next.imports.length ? `${pendingCount(next)} 项待确认` : "公众号收件箱为空");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      setProgram([]);
      return;
    }
    setDraft({ ...selected.candidate.event });
    setProgram(selected.candidate.event.program.map(toEditableProgramItem));
  }, [selected?.record.id, selected?.candidate.id]);

  const createImport = async () => {
    if (busy || (!articleUrl.trim() && !rawText.trim())) {
      setStatus("请填写公众号文章链接或正文");
      return;
    }
    setBusy(true);
    setStatus("正在读取并解析公众号文章");
    try {
      const result = await postWechatImport({
        action: "create",
        articleUrl: articleUrl.trim() || undefined,
        rawText: rawText.trim() || undefined,
        useAi,
      });
      setState(result);
      const firstPending = firstPendingKey(result);
      setSelectedKey(firstPending);
      setStatus(result.message || `已生成 ${pendingCount(result)} 项待确认候选`);
      setRawText("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (action: "approve" | "reject") => {
    if (!selected || !draft || busy) return;
    const event = {
      ...draft,
      title: draft.title.trim(),
      city: draft.city.trim(),
      venue: draft.venue.trim(),
      hall: draft.hall?.trim() || undefined,
      startTime: normalizeDateTime(draft.startTime),
      endTime: draft.endTime ? normalizeDateTime(draft.endTime) : undefined,
      performers: unique(draft.performers),
      tags: unique(draft.tags),
      program: program.map(toProgramItem).filter((item) => item.title),
    };
    setBusy(true);
    setStatus(action === "approve" ? "正在写入正式演出数据" : "正在驳回候选");
    try {
      const result = await postWechatImport({
        action,
        importId: selected.record.id,
        candidateId: selected.candidate.id,
        event,
      });
      setState(result);
      setSelectedKey(firstPendingKey(result));
      setStatus(result.message || (action === "approve" ? "已确认演出" : "已驳回候选"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const updateDraft = <K extends keyof WechatImportEventDraft>(
    field: K,
    value: WechatImportEventDraft[K],
  ) => setDraft((current) => current ? { ...current, [field]: value } : current);

  const updateProgram = (index: number, field: keyof EditableProgramItem, value: string) => {
    setProgram((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field]: value } : item,
    ));
  };

  return (
    <section className="wechat-import-layout">
      <aside className="wechat-inbox">
        <div className="review-pane-title">
          <span>公众号收件箱</span>
          <strong>{pending.length}</strong>
        </div>
        <div className="wechat-import-form">
          <label>
            <span>文章链接</span>
            <input
              value={articleUrl}
              placeholder="https://mp.weixin.qq.com/s/..."
              onChange={(event) => setArticleUrl(event.target.value)}
            />
          </label>
          <label>
            <span>文章正文</span>
            <textarea
              value={rawText}
              placeholder="链接读取失败时粘贴正文"
              onChange={(event) => setRawText(event.target.value)}
            />
          </label>
          <label className="wechat-ai-toggle">
            <input
              type="checkbox"
              checked={useAi}
              disabled={!state.aiAvailable}
              onChange={(event) => setUseAi(event.target.checked)}
            />
            <span>{state.aiAvailable ? "使用 DeepSeek 增强" : "DeepSeek 未配置"}</span>
          </label>
          <button disabled={busy} onClick={createImport}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <FileInput size={16} />}
            生成候选
          </button>
          <small>{status}</small>
        </div>
        <div className="wechat-candidate-list">
          {pending.map(({ record, candidate }) => {
            const key = `${record.id}:${candidate.id}`;
            return (
              <button
                className={key === `${selected?.record.id}:${selected?.candidate.id}` ? "active" : ""}
                key={key}
                onClick={() => setSelectedKey(key)}
              >
                <small>{formatCandidateTime(candidate.event.startTime)}</small>
                <strong>{candidate.event.title || record.articleTitle || "未命名候选"}</strong>
                <span>{[candidate.event.city, candidate.event.venue].filter(Boolean).join(" · ") || "场馆待填写"}</span>
              </button>
            );
          })}
          {!pending.length ? (
            <div className="review-empty">
              <Check size={28} />
              <strong>没有待确认候选</strong>
              <span>新导入的公众号文章会出现在这里。</span>
            </div>
          ) : null}
        </div>
      </aside>

      {selected && draft ? (
        <>
          <section className="review-editor wechat-event-editor">
            <div className="review-event-heading">
              <div>
                <span>{selected.record.extractionMethod === "deepseek" ? "DeepSeek 候选" : "规则解析候选"}</span>
                <h1>{draft.title || "未命名演出"}</h1>
                <p>{selected.candidate.reasons.join("；")}</p>
              </div>
              {selected.record.articleUrl ? (
                <a href={selected.record.articleUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  原文
                </a>
              ) : null}
            </div>

            <div className="wechat-event-fields">
              <label className="wechat-field-wide">
                <span>演出标题</span>
                <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
              </label>
              <label>
                <span>城市</span>
                <input value={draft.city} onChange={(event) => updateDraft("city", event.target.value)} />
              </label>
              <label>
                <span>场馆</span>
                <input value={draft.venue} onChange={(event) => updateDraft("venue", event.target.value)} />
              </label>
              <label>
                <span>厅堂</span>
                <input value={draft.hall ?? ""} onChange={(event) => updateDraft("hall", event.target.value)} />
              </label>
              <label>
                <span>开演时间</span>
                <input type="datetime-local" value={toLocalDateTime(draft.startTime)} onChange={(event) => updateDraft("startTime", event.target.value)} />
              </label>
              <label>
                <span>票价</span>
                <input value={draft.price ?? ""} onChange={(event) => updateDraft("price", event.target.value)} />
              </label>
              <label>
                <span>乐团</span>
                <input value={draft.ensemble ?? ""} onChange={(event) => updateDraft("ensemble", event.target.value)} />
              </label>
              <label>
                <span>指挥</span>
                <input value={draft.conductor ?? ""} onChange={(event) => updateDraft("conductor", event.target.value)} />
              </label>
              <label className="wechat-field-wide">
                <span>演奏者</span>
                <input value={draft.performers.join(" / ")} onChange={(event) => updateDraft("performers", splitValues(event.target.value))} />
              </label>
              <label className="wechat-field-wide">
                <span>购票链接</span>
                <input value={draft.ticketUrl ?? ""} onChange={(event) => updateDraft("ticketUrl", event.target.value)} />
              </label>
              <label className="wechat-field-wide">
                <span>演出简介</span>
                <textarea value={draft.description ?? ""} onChange={(event) => updateDraft("description", event.target.value)} />
              </label>
            </div>

            <div className="review-program-heading">
              <div><strong>结构化节目单</strong><span>{program.length} 首</span></div>
              <button onClick={() => setProgram((current) => [...current, emptyProgramItem()])}>
                <Plus size={16} />
                添加曲目
              </button>
            </div>
            <div className="review-program-list">
              {program.map((item, index) => (
                <div className="review-program-row" key={index}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div className="review-fields">
                    <label><span>曲目</span><input value={item.title} onChange={(event) => updateProgram(index, "title", event.target.value)} /></label>
                    <label><span>作曲家</span><input value={item.composer} onChange={(event) => updateProgram(index, "composer", event.target.value)} /></label>
                    <label><span>作品号</span><input value={item.opus} onChange={(event) => updateProgram(index, "opus", event.target.value)} /></label>
                    <label className="review-wide-field"><span>英文或其他原文名</span><input value={item.alternateTitles} onChange={(event) => updateProgram(index, "alternateTitles", event.target.value)} /></label>
                  </div>
                  <button className="review-delete" title="删除曲目" onClick={() => setProgram((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="review-actions">
              <button className="review-reject" disabled={busy} onClick={() => submit("reject")}><X size={17} />驳回候选</button>
              <button className="review-approve" disabled={busy} onClick={() => submit("approve")}>
                {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
                确认并发布
              </button>
            </div>
          </section>
          <aside className="review-evidence wechat-evidence">
            <div className="review-pane-title"><span>文章原文</span><strong>{selected.record.rawText.length}</strong></div>
            <div className="wechat-article-meta">
              <strong>{selected.record.articleTitle || "未读取到文章标题"}</strong>
              <span>{[selected.record.accountName, selected.record.publishedAt].filter(Boolean).join(" · ") || "公众号信息待核对"}</span>
            </div>
            <pre>{selected.record.rawText}</pre>
          </aside>
        </>
      ) : (
        <section className="review-editor review-complete">
          <FileInput size={36} />
          <h1>公众号收件箱</h1>
          <p>当前没有需要确认的导入候选。</p>
        </section>
      )}
    </section>
  );
}

async function loadWechatImports() {
  const response = await fetch("/api/wechat-imports");
  if (!response.ok) throw new Error("本地导入服务不可用，请使用 npm run dev 启动项目");
  return response.json() as Promise<WechatImportState>;
}

async function postWechatImport(body: Record<string, unknown>) {
  const response = await fetch("/api/wechat-imports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "公众号导入操作失败");
  return result as WechatImportState & { message?: string };
}

function firstPendingKey(state: WechatImportState) {
  for (const record of state.imports) {
    const candidate = record.candidates.find((item) => item.status === "pending");
    if (candidate) return `${record.id}:${candidate.id}`;
  }
  return "";
}

function pendingCount(state: WechatImportState) {
  return state.imports.reduce((count, record) =>
    count + record.candidates.filter((candidate) => candidate.status === "pending").length,
  0);
}

function toEditableProgramItem(item: ProgramItem): EditableProgramItem {
  return {
    composer: item.composer ?? "",
    title: item.title,
    opus: item.opus ?? "",
    alternateTitles: item.alternateTitles?.join(" / ") ?? "",
  };
}

function toProgramItem(item: EditableProgramItem): ProgramItem {
  return {
    composer: item.composer.trim() || undefined,
    title: item.title.trim(),
    opus: item.opus.trim() || undefined,
    alternateTitles: splitValues(item.alternateTitles),
    confidence: "manual",
  };
}

function emptyProgramItem(): EditableProgramItem {
  return { composer: "", title: "", opus: "", alternateTitles: "" };
}

function splitValues(value: string) {
  return value.split(/[\/、，,;；]/).map((item) => item.trim()).filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function toLocalDateTime(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parts.replace(" ", "T");
}

function normalizeDateTime(value: string) {
  if (!value) return "";
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return new Date(value).toISOString();
  return new Date(`${value}:00+08:00`).toISOString();
}

function formatCandidateTime(value: string) {
  const local = toLocalDateTime(value);
  return local ? local.replace("T", " ") : "时间待填写";
}
