import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import type { ConcertEventSummary } from "../types";
import {
  buildCalendarDays,
  eventDateKey,
  formatDayHeading,
  formatEventVenue,
  formatMonth,
  localDateKey,
  monthKey,
  startOfMonth,
} from "../utils";

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

export default function CalendarView({
  events,
  selectedId,
  month,
  onMonthChange,
  onSelect,
}: {
  events: ConcertEventSummary[];
  selectedId?: string;
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelect: (event: ConcertEventSummary) => void;
}) {
  const monthValue = monthKey(month);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, ConcertEventSummary[]>();
    for (const event of events) {
      const key = eventDateKey(event.startTime);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [events]);
  const monthEvents = useMemo(
    () => events.filter((event) => eventDateKey(event.startTime).startsWith(monthValue)),
    [events, monthValue],
  );
  const [activeDay, setActiveDay] = useState(() => eventDateKey(monthEvents[0]?.startTime ?? month));
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const firstEventDay = monthEvents[0] ? eventDateKey(monthEvents[0].startTime) : `${monthValue}-01`;
    if (!activeDay.startsWith(monthValue)) setActiveDay(firstEventDay);
  }, [activeDay, monthEvents, monthValue]);

  useEffect(() => {
    setExpandedDays((current) => {
      const next = new Set([...current].filter((day) => day.startsWith(monthValue)));
      return next.size === current.size ? current : next;
    });
  }, [monthValue]);

  const activeDayEvents = eventsByDate.get(activeDay) ?? [];
  const todayKey = eventDateKey(new Date());

  return (
    <section className="calendar-panel" aria-label={`${formatMonth(month)}演出日历`}>
      <header className="calendar-header">
        <div>
          <h2>{formatMonth(month)}</h2>
          <p>{monthEvents.length} 场匹配</p>
        </div>
        <div className="month-nav">
          <button title="上个月" aria-label="上个月" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={18} />
          </button>
          <button className="today-button" onClick={() => onMonthChange(startOfMonth(new Date()))}>
            今天
          </button>
          <button title="下个月" aria-label="下个月" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="calendar-weekdays" aria-hidden="true">
        {weekdayLabels.map((day) => <span key={day}>周{day}</span>)}
      </div>

      <div className="calendar-grid">
        {buildCalendarDays(month).map((day) => {
          const key = localDateKey(day);
          const inMonth = day.getMonth() === month.getMonth();
          const dayEvents = inMonth ? eventsByDate.get(key) ?? [] : [];
          const isExpanded = expandedDays.has(key);
          const visibleEvents = isExpanded ? dayEvents : dayEvents.slice(0, 3);
          return (
            <div
              key={key}
              className={`calendar-cell ${isExpanded ? "expanded" : ""} ${inMonth ? "" : "outside"} ${key === todayKey ? "today" : ""} ${
                key === activeDay ? "active-day" : ""
              }`}
            >
              <button
                className="day-number"
                aria-label={`${day.getMonth() + 1}月${day.getDate()}日，${dayEvents.length}场演出`}
                disabled={!inMonth}
                onClick={() => setActiveDay(key)}
              >
                {day.getDate()}
              </button>
              {dayEvents.length ? <span className="calendar-count">{dayEvents.length}</span> : null}
              <div className="calendar-events">
                {visibleEvents.map((event) => (
                  <button
                    key={event.id}
                    className={`calendar-event ${selectedId === event.id ? "active" : ""}`}
                    onClick={() => {
                      setActiveDay(key);
                      onSelect(event);
                    }}
                    title={event.title}
                  >
                    <span>{event.timeLabel}</span>
                    <strong>{event.title}</strong>
                  </button>
                ))}
                {dayEvents.length > 3 ? (
                  <button
                    className="calendar-more-button"
                    aria-expanded={isExpanded}
                    onClick={() => {
                      setActiveDay(key);
                      setExpandedDays((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                    }}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp size={11} />
                        收起
                      </>
                    ) : (
                      <>
                        <ChevronDown size={11} />
                        另有 {dayEvents.length - 3} 场
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <section className="day-agenda" aria-label="当日演出">
        <div className="agenda-heading">
          <h3>{formatDayHeading(activeDay)}</h3>
          <span>{activeDayEvents.length} 场</span>
        </div>
        {activeDayEvents.length ? (
          activeDayEvents.map((event) => (
            <button
              key={event.id}
              className={`agenda-event ${selectedId === event.id ? "active" : ""}`}
              onClick={() => onSelect(event)}
            >
              <time>{event.timeLabel}</time>
              <span>
                <strong>{event.title}</strong>
                <small>{formatEventVenue(event)}</small>
              </span>
            </button>
          ))
        ) : <p className="muted">当天暂无匹配演出</p>}
      </section>
    </section>
  );
}
