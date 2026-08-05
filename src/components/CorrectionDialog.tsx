import { AlertTriangle, ExternalLink, Flag, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  buildGithubCorrectionUrl,
  formatCorrectionField,
  saveCorrectionReport,
  type CorrectionField,
} from "../discovery-features";
import type { ConcertEvent } from "../types";

const fields: CorrectionField[] = ["venue", "time", "price", "program", "lineup", "other"];

export default function CorrectionDialog({
  event,
  issues,
  open,
  onClose,
}: {
  event: ConcertEvent;
  issues: string[];
  open: boolean;
  onClose: () => void;
}) {
  const [field, setField] = useState<CorrectionField>(issues.some((issue) => issue.includes("节目单")) ? "program" : "other");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setField(issues.some((issue) => issue.includes("节目单")) ? "program" : "other");
    setDescription(issues.join("；"));
  }, [event.id, issues, open]);

  if (!open) return null;

  const submit = () => {
    const report = saveCorrectionReport({
      eventId: event.id,
      eventTitle: event.title,
      field,
      description: description.trim(),
      sourceUrl: event.sourceUrl,
      submitted: true,
    });
    window.open(buildGithubCorrectionUrl(report), "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(mouseEvent) => {
      if (mouseEvent.target === mouseEvent.currentTarget) onClose();
    }}>
      <section className="feature-dialog correction-dialog" role="dialog" aria-modal="true" aria-label="报告信息错误">
        <header>
          <div><Flag size={18} /><span><small>数据纠错</small><strong>报告信息错误</strong></span></div>
          <button type="button" onClick={onClose} aria-label="关闭纠错窗口"><X size={19} /></button>
        </header>
        {issues.length ? (
          <div className="detected-issues">
            <AlertTriangle size={17} />
            <div><strong>系统检测到可能的问题</strong>{issues.map((issue) => <span key={issue}>{issue}</span>)}</div>
          </div>
        ) : null}
        <p className="dialog-event-title">{event.title}</p>
        <label>
          <span>需要修正的字段</span>
          <select value={field} onChange={(changeEvent) => setField(changeEvent.target.value as CorrectionField)}>
            {fields.map((value) => <option key={value} value={value}>{formatCorrectionField(value)}</option>)}
          </select>
        </label>
        <label>
          <span>问题说明</span>
          <textarea
            rows={5}
            value={description}
            onChange={(changeEvent) => setDescription(changeEvent.target.value)}
            placeholder="请写明当前内容和正确内容"
          />
        </label>
        <p className="dialog-note">反馈会保存在本机，并打开项目纠错页供你确认提交。</p>
        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={!description.trim()} onClick={submit}>
            <ExternalLink size={16} />前往提交
          </button>
        </footer>
      </section>
    </div>
  );
}
