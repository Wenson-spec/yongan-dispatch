import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  /** 高亮样式（用于收货备注等重要字段） */
  highlight?: boolean;
  /** 是否多行 */
  multiline?: boolean;
  /** 最大显示字符数（超出截断） */
  maxDisplay?: number;
  /** 空值时的显示文本 */
  emptyText?: string;
  /** 前缀图标文字 */
  prefix?: string;
}

export default function InlineEdit({
  value,
  onSave,
  placeholder = "点击编辑...",
  className = "",
  highlight = false,
  multiline = false,
  maxDisplay = 50,
  emptyText = "点击添加",
  prefix,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // 光标移到末尾
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.setSelectionRange(draft.length, draft.length);
      }
    }
  }, [editing]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e) {
      // 保存失败，恢复原值
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (editing) {
    return (
      <div className={`flex items-start gap-1 ${className}`}>
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            className="flex-1 text-xs border border-orange-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white resize-none min-w-[140px]"
            disabled={saving}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 text-xs border border-orange-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white min-w-[120px]"
            disabled={saving}
          />
        )}
        <div className="flex items-center gap-0.5 mt-0.5">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                className="p-0.5 rounded hover:bg-green-100 text-green-600"
                title="保存"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="p-0.5 rounded hover:bg-red-100 text-red-500"
                title="取消"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const displayValue = value
    ? value.length > maxDisplay
      ? value.slice(0, maxDisplay) + "..."
      : value
    : "";

  return (
    <div
      className={`group cursor-pointer rounded px-2 py-1 transition-colors ${
        highlight && value
          ? "bg-orange-100 border border-orange-300 text-orange-800 hover:bg-orange-200"
          : value
            ? "hover:bg-muted/50 border border-transparent hover:border-border"
            : "hover:bg-muted/30 border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
      } ${className}`}
      onClick={() => setEditing(true)}
      title={value || placeholder}
    >
      {value ? (
        <div className="flex items-center gap-1 text-xs">
          {prefix && <span className="font-semibold">{prefix}</span>}
          <span className={highlight ? "font-medium" : ""}>{displayValue}</span>
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0 ml-auto" />
        </div>
      ) : (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{emptyText}</span>
          <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0" />
        </div>
      )}
    </div>
  );
}
