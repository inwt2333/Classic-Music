import { Bell, BellRing, CheckCheck, Music, Trash2, X } from "lucide-react";
import type { FollowNotification } from "../discovery-features";

const changeLabels: Record<FollowNotification["change"]["type"], string> = {
  added: "新演出",
  removed: "已下架",
  rescheduled: "演出改期",
  cancelled: "演出取消",
  lineup: "阵容变化",
  program: "曲目变化",
  price: "票价变化",
};

export default function NotificationCenter({
  open,
  notifications,
  onClose,
  onReadAll,
  onRead,
  onDelete,
  onOpenEvent,
}: {
  open: boolean;
  notifications: FollowNotification[];
  onClose: () => void;
  onReadAll: () => void;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  if (!open) return null;
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="feature-dialog notification-dialog" role="dialog" aria-modal="true" aria-label="消息提醒">
        <header>
          <div><BellRing size={18} /><span><small>我的古典日历</small><strong>消息提醒</strong></span></div>
          <button type="button" onClick={onClose} aria-label="关闭提醒中心"><X size={19} /></button>
        </header>

        <div className="notification-heading">
          <span><Bell size={16} />提醒 {unread ? <em>{unread} 条未读</em> : null}</span>
          <button type="button" disabled={!unread} onClick={onReadAll}><CheckCheck size={15} />全部已读</button>
        </div>
        <div className="notification-list">
          {notifications.length ? notifications.slice(0, 30).map((item) => (
            <div
              key={item.id}
              className={`notification-item ${item.read ? "" : "unread"}`}
            >
              <button
                className="notification-open"
                type="button"
                onClick={() => {
                  onRead(item.id);
                  if (item.event) onOpenEvent(item.event.id);
                }}
              >
                <i />
                <span>
                  <small>{changeLabels[item.change.type]} · {item.targets.map((target) => target.name).join("、")}</small>
                  <strong>{item.event?.title ?? item.change.summary}</strong>
                  <em>{new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.change.detectedAt))}</em>
                </span>
              </button>
              <button
                className="notification-delete"
                type="button"
                title="删除提醒"
                aria-label={`删除提醒：${item.event?.title ?? item.change.summary}`}
                onClick={() => onDelete(item.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )) : (
            <div className="feature-empty"><Music size={24} /><strong>暂无相关变化</strong><span>你关注的内容发生演出变化后，消息会出现在这里。</span></div>
          )}
        </div>
      </section>
    </div>
  );
}
