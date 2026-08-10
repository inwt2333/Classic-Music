import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  MessageSquareText,
  Plus,
  ScanText,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProgramItem, ReviewQueueItem } from "../types";
import { formatDateTime, formatEventVenue } from "../utils";
import WechatImportWorkspace from "./WechatImportWorkspace";

type EditableProgramItem = {
  composer: string;
  title: string;
  opus: string;
  alternateTitles: string;
};

export default function ReviewWorkspace() {
  const [workspace, setWorkspace] = useState<"program" | "wechat">("program");
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [program, setProgram] = useState<EditableProgramItem[]>([]);
  const [note, setNote] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [status, setStatus] = useState("正在加载审核队列");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => items.find((item) => item.event.id === selectedId) ?? items[0],
    [items, selectedId],
  );

  useEffect(() => {
    loadQueue()
      .then((queue) => {
        setItems(queue);
        setSelectedId(queue[0]?.event.id ?? "");
        setStatus(queue.length ? `${queue.length} 项待审核` : "审核队列已清空");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    if (!selected) {
      setProgram([]);
      return;
    }
    const candidate = selected.event.program.length
      ? selected.event.program
      : selected.ocr?.program ?? [];
    setProgram(candidate.map(toEditableProgramItem));
    setNote("");
    setImageIndex(0);
  }, [selected?.event.id]);

  const submit = async (decisionStatus: "approved" | "rejected") => {
    if (!selected || saving) return;
    const normalizedProgram = program
      .map(toProgramItem)
      .filter((item) => item.title);
    if (decisionStatus === "approved" && !normalizedProgram.length) {
      setStatus("确认前至少需要填写一首曲目");
      return;
    }

    setSaving(true);
    setStatus(decisionStatus === "approved" ? "正在保存确认结果" : "正在保存驳回结果");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: selected.event.id,
          sourceRecordIds: selected.sourceRecordIds,
          status: decisionStatus,
          program: normalizedProgram,
          note: note.trim() || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存审核结果失败");
      const queue = result.queue as ReviewQueueItem[];
      setItems(queue);
      setSelectedId(queue[0]?.event.id ?? "");
      setStatus(queue.length ? `已保存，剩余 ${queue.length} 项` : "审核队列已清空");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const updateProgram = (
    index: number,
    field: keyof EditableProgramItem,
    value: string,
  ) => {
    setProgram((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const images = selected?.ocr?.images ?? [];

  return (
    <main className="review-shell">
      <header className="review-header">
        <div className="brand-block">
          <ScanText size={22} />
          <div>
            <strong>数据审核</strong>
            <span>{workspace === "program" ? status : "公众号文章半自动导入"}</span>
          </div>
        </div>
        <div className="review-header-actions">
          <div className="review-workspace-tabs" aria-label="审核类型">
            <button className={workspace === "program" ? "active" : ""} onClick={() => setWorkspace("program")}>
              <ScanText size={15} />
              节目单审核
            </button>
            <button className={workspace === "wechat" ? "active" : ""} onClick={() => setWorkspace("wechat")}>
              <MessageSquareText size={15} />
              公众号导入
            </button>
          </div>
          <a href="?profile=1">
            <ArrowLeft size={16} />
            返回个人页
          </a>
        </div>
      </header>

      {workspace === "wechat" ? <WechatImportWorkspace /> : <section className="review-layout">
        <aside className="review-queue" aria-label="待审核演出">
          <div className="review-pane-title">
            <span>待审核</span>
            <strong>{items.length}</strong>
          </div>
          {items.length ? items.map((item) => (
            <button
              key={item.event.id}
              className={item.event.id === selected?.event.id ? "active" : ""}
              onClick={() => setSelectedId(item.event.id)}
            >
              <small>{formatDateTime(item.event.startTime)}</small>
              <strong>{item.event.title}</strong>
              <span>{item.reason}</span>
            </button>
          )) : (
            <div className="review-empty">
              <Check size={28} />
              <strong>没有待审核项目</strong>
              <span>新的 OCR 或 AI 结果会出现在这里。</span>
            </div>
          )}
        </aside>

        {selected ? (
          <>
            <section className="review-editor">
              <div className="review-event-heading">
                <div>
                  <span>{selected.reason}</span>
                  <h1>{selected.event.title}</h1>
                  <p>
                    {formatDateTime(selected.event.startTime)}
                    <i>·</i>
                    {formatEventVenue(selected.event)}
                  </p>
                </div>
                <a href={selected.event.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  官网
                </a>
              </div>

              <div className="review-program-heading">
                <div>
                  <strong>结构化节目单</strong>
                  <span>{program.length} 首</span>
                </div>
                <button
                  title="添加曲目"
                  onClick={() => setProgram((current) => [
                    ...current,
                    { composer: "", title: "", opus: "", alternateTitles: "" },
                  ])}
                >
                  <Plus size={16} />
                  添加曲目
                </button>
              </div>

              <div className="review-program-list">
                {program.map((item, index) => (
                  <div className="review-program-row" key={index}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div className="review-fields">
                      <label>
                        <span>曲目</span>
                        <input
                          value={item.title}
                          onChange={(event) => updateProgram(index, "title", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>作曲家</span>
                        <input
                          value={item.composer}
                          onChange={(event) => updateProgram(index, "composer", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>作品号</span>
                        <input
                          value={item.opus}
                          onChange={(event) => updateProgram(index, "opus", event.target.value)}
                        />
                      </label>
                      <label className="review-wide-field">
                        <span>英文或其他原文名</span>
                        <input
                          value={item.alternateTitles}
                          placeholder="多个名称使用 / 分隔"
                          onChange={(event) =>
                            updateProgram(index, "alternateTitles", event.target.value)}
                        />
                      </label>
                    </div>
                    <button
                      className="review-delete"
                      title="删除曲目"
                      aria-label={`删除第 ${index + 1} 首曲目`}
                      onClick={() =>
                        setProgram((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {!program.length ? (
                  <button
                    className="review-add-empty"
                    onClick={() => setProgram([
                      { composer: "", title: "", opus: "", alternateTitles: "" },
                    ])}
                  >
                    <Plus size={18} />
                    添加第一首曲目
                  </button>
                ) : null}
              </div>

              <label className="review-note">
                <span>审核备注</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="可选：记录修改依据或驳回原因"
                />
              </label>

              <div className="review-actions">
                <button
                  className="review-reject"
                  disabled={saving}
                  onClick={() => submit("rejected")}
                >
                  <X size={17} />
                  驳回候选
                </button>
                <button
                  className="review-approve"
                  disabled={saving}
                  onClick={() => submit("approved")}
                >
                  {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
                  确认节目单
                </button>
              </div>
            </section>

            <aside className="review-evidence">
              <div className="review-pane-title">
                <span>识别依据</span>
                {selected.ocr ? <strong>{selected.ocr.confidence}</strong> : null}
              </div>
              {images.length ? (
                <>
                  <div className="review-image">
                    <img src={images[imageIndex]} alt={`官网详情图片 ${imageIndex + 1}`} />
                    {images.length > 1 ? (
                      <div>
                        <button
                          title="上一张"
                          onClick={() =>
                            setImageIndex((imageIndex - 1 + images.length) % images.length)}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <span>{imageIndex + 1} / {images.length}</span>
                        <button
                          title="下一张"
                          onClick={() => setImageIndex((imageIndex + 1) % images.length)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="review-no-image">
                  <ImageIcon size={25} />
                  <span>没有 OCR 图片记录</span>
                </div>
              )}
              {selected.ocr ? (
                <>
                  {selected.ocr.reasons.length ? (
                    <div className="review-reasons">
                      {selected.ocr.reasons.map((reason) => <span key={reason}>{reason}</span>)}
                    </div>
                  ) : null}
                  <details className="review-raw-text" open>
                    <summary>OCR 原始文字</summary>
                    <pre>{selected.ocr.rawText || "未识别到文字"}</pre>
                  </details>
                </>
              ) : null}
            </aside>
          </>
        ) : (
          <section className="review-editor review-complete">
            <Check size={36} />
            <h1>审核完成</h1>
            <p>当前没有需要人工处理的节目单。</p>
          </section>
        )}
      </section>}
    </main>
  );
}

async function loadQueue() {
  const response = await fetch("/api/reviews");
  if (!response.ok) {
    throw new Error("本地审核服务不可用，请使用 npm run dev 启动项目");
  }
  return response.json() as Promise<ReviewQueueItem[]>;
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
    alternateTitles: item.alternateTitles
      .split("/")
      .map((title) => title.trim())
      .filter(Boolean),
    confidence: "manual",
  };
}
