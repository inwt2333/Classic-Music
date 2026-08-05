import { Bookmark, Save, Trash2 } from "lucide-react";
import type { SavedFilter } from "../discovery-features";

export default function SavedFilterMenu({
  filters,
  onSave,
  onApply,
  onRemove,
}: {
  filters: SavedFilter[];
  onSave: () => void;
  onApply: (filter: SavedFilter) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="saved-filter-actions">
      <button type="button" onClick={onSave}><Save size={15} />保存筛选</button>
      <details>
        <summary><Bookmark size={15} />筛选方案 {filters.length || ""}</summary>
        <div>
          {filters.length ? filters.map((filter) => (
            <span key={filter.id}>
              <button type="button" onClick={() => onApply(filter)}>{filter.name}</button>
              <button type="button" title="删除筛选方案" aria-label={`删除${filter.name}`} onClick={() => onRemove(filter.id)}><Trash2 size={14} /></button>
            </span>
          )) : <p>尚未保存筛选方案</p>}
        </div>
      </details>
    </div>
  );
}
