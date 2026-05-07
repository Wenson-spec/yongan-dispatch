/**
 * 通用批量操作组件
 * 包含：批量导入（CSV解析+预览）和批量删除（多选+确认）
 */
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Trash2, AlertTriangle, CheckCircle2, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";

// ============================================================
// 类型定义
// ============================================================
export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
  /** 导入模板中的示例值 */
  example?: string;
  /** 可选枚举值映射（中文->英文） */
  enumMap?: Record<string, string>;
}

interface BatchImportProps {
  columns: ColumnDef[];
  entityName: string;
  onImport: (items: Record<string, any>[]) => Promise<{ count: number }>;
  onSuccess?: () => void;
}

interface BatchDeleteProps {
  selectedIds: number[];
  entityName: string;
  onDelete: (ids: number[]) => Promise<{ count: number }>;
  onSuccess?: () => void;
  onClear: () => void;
}

// ============================================================
// CSV解析工具
// ============================================================
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = "";
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(current.trim());
        if (row.some(c => c !== "")) rows.push(row);
        row = [];
        current = "";
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some(c => c !== "")) rows.push(row);
  return rows;
}

// ============================================================
// 生成CSV模板
// ============================================================
function generateTemplate(columns: ColumnDef[]): string {
  const header = columns.map(c => c.label + (c.required ? "*" : "")).join(",");
  const example = columns.map(c => {
    if (c.example) return c.example;
    if (c.enumMap) return Object.keys(c.enumMap)[0] || "";
    return "";
  }).join(",");
  return "\uFEFF" + header + "\n" + example + "\n";
}

function downloadTemplate(columns: ColumnDef[], entityName: string) {
  const csv = generateTemplate(columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${entityName}导入模板.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// 批量导入组件
// ============================================================
export function BatchImportButton({ columns, entityName, onImport, onSuccess }: BatchImportProps) {
  const [open, setOpen] = useState(false);
  const [parsedData, setParsedData] = useState<Record<string, any>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const resetState = useCallback(() => {
    setParsedData([]);
    setErrors([]);
    setFileName("");
    setImporting(false);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          setErrors(["文件为空或只有表头行"]);
          setParsedData([]);
          return;
        }

        const headerRow = rows[0];
        // 建立表头到列定义的映射
        const colMap: (ColumnDef | null)[] = headerRow.map(h => {
          const cleanH = h.replace(/\*$/, "").trim();
          return columns.find(c => c.label === cleanH) || null;
        });

        const errs: string[] = [];
        const items: Record<string, any>[] = [];

        // 检查必填列是否存在
        for (const col of columns) {
          if (col.required && !colMap.some(c => c?.key === col.key)) {
            errs.push(`缺少必填列: ${col.label}`);
          }
        }

        if (errs.length > 0) {
          setErrors(errs);
          setParsedData([]);
          return;
        }

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const item: Record<string, any> = {};
          let rowValid = true;

          colMap.forEach((col, idx) => {
            if (!col) return;
            let val = row[idx] || "";
            // 枚举映射
            if (col.enumMap && val) {
              val = col.enumMap[val] || val;
            }
            if (col.required && !val) {
              errs.push(`第${i + 1}行: ${col.label}不能为空`);
              rowValid = false;
            }
            item[col.key] = val || undefined;
          });

          if (rowValid) items.push(item);
        }

        setParsedData(items);
        setErrors(errs.slice(0, 10)); // 最多显示10条错误
      } catch (err) {
        setErrors(["文件解析失败，请检查文件格式"]);
        setParsedData([]);
      }
    };
    reader.readAsText(file, "utf-8");
    // 重置input以支持重复选择同一文件
    e.target.value = "";
  }, [columns]);

  const handleImport = useCallback(async () => {
    if (parsedData.length === 0) return;
    setImporting(true);
    try {
      const result = await onImport(parsedData);
      toast.success(`成功导入 ${result.count} 条${entityName}数据`);
      setOpen(false);
      resetState();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "导入失败，请检查数据格式");
    } finally {
      setImporting(false);
    }
  }, [parsedData, onImport, entityName, resetState, onSuccess]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { resetState(); setOpen(true); }}>
        <Upload className="h-4 w-4 mr-1" />
        批量导入
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              批量导入{entityName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 步骤1: 下载模板 */}
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">步骤1: 下载导入模板</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    下载CSV模板，按模板格式填写数据（带*号为必填列）
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadTemplate(columns, entityName)}>
                  <Download className="h-4 w-4 mr-1" />
                  下载模板
                </Button>
              </div>
            </div>

            {/* 步骤2: 上传文件 */}
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">步骤2: 上传数据文件</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    支持CSV格式，编码UTF-8
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {fileName && (
                    <Badge variant="secondary" className="text-xs">
                      {fileName}
                      <X className="h-3 w-3 ml-1 cursor-pointer" onClick={resetState} />
                    </Badge>
                  )}
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />
                    选择文件
                  </Button>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* 错误提示 */}
            {errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-red-700 mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  数据校验问题 ({errors.length}条)
                </div>
                <div className="space-y-0.5">
                  {errors.map((e, i) => (
                    <div key={i} className="text-xs text-red-600">{e}</div>
                  ))}
                </div>
              </div>
            )}

            {/* 预览数据 */}
            {parsedData.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">
                    解析成功: {parsedData.length} 条数据
                  </span>
                </div>
                <div className="rounded-lg border overflow-auto max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-center">#</TableHead>
                        {columns.map(c => (
                          <TableHead key={c.key} className="text-xs whitespace-nowrap">
                            {c.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.slice(0, 20).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                          {columns.map(c => (
                            <TableCell key={c.key} className="text-xs">
                              {c.enumMap
                                ? Object.entries(c.enumMap).find(([, v]) => v === item[c.key])?.[0] || item[c.key] || "-"
                                : item[c.key] || "-"
                              }
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {parsedData.length > 20 && (
                    <div className="text-center py-2 text-xs text-muted-foreground border-t">
                      ... 还有 {parsedData.length - 20} 条数据未显示
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetState(); setOpen(false); }}>
              取消
            </Button>
            <Button
              onClick={handleImport}
              disabled={parsedData.length === 0 || importing}
            >
              {importing ? "导入中..." : `确认导入 (${parsedData.length}条)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// 批量删除按钮组件
// ============================================================
export function BatchDeleteButton({ selectedIds, entityName, onDelete, onSuccess, onClear }: BatchDeleteProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    try {
      const result = await onDelete(selectedIds);
      toast.success(`成功删除 ${result.count} 条${entityName}数据`);
      setOpen(false);
      onClear();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "删除失败");
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, onDelete, entityName, onClear, onSuccess]);

  if (selectedIds.length === 0) return null;

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 mr-1" />
        批量删除 ({selectedIds.length})
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              确认批量删除
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              确定要删除选中的 <strong className="text-red-600">{selectedIds.length}</strong> 条{entityName}数据吗？
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              此操作不可撤销，请谨慎操作。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : `确认删除 (${selectedIds.length}条)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// 行选择Checkbox组件
// ============================================================
export function SelectCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(v) => onChange(!!v)}
      className="data-[state=checked]:bg-primary"
    />
  );
}

// ============================================================
// 全选Checkbox组件
// ============================================================
export function SelectAllCheckbox({
  allIds,
  selectedIds,
  onSelectAll,
  onClearAll,
}: {
  allIds: number[];
  selectedIds: number[];
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.includes(id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <Checkbox
      checked={allSelected}
      // @ts-ignore - indeterminate is valid but not typed
      data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
      onCheckedChange={(v) => {
        if (v) onSelectAll();
        else onClearAll();
      }}
      className={`data-[state=checked]:bg-primary ${someSelected ? "opacity-50" : ""}`}
    />
  );
}
