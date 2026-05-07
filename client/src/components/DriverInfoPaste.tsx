import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ClipboardPaste, Check } from "lucide-react";

interface ParsedInfo {
  plateNumber?: string;
  driverName?: string;
  driverPhone?: string;
  driverIdCard?: string;
}

interface DriverInfoPasteProps {
  onParsed: (info: ParsedInfo) => void;
}

function parseDriverInfo(text: string): ParsedInfo {
  const result: ParsedInfo = {};
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const plateMatch = line.match(/(?:车号|车牌|车牌号)[：:\s]*([^\s,，]+)/);
    if (plateMatch) result.plateNumber = plateMatch[1];

    const nameMatch = line.match(/(?:司机|姓名|驾驶员|师傅)[：:\s]*([^\s,，0-9]{2,4})/);
    if (nameMatch) result.driverName = nameMatch[1];

    const idMatch = line.match(/(?:身份证|身份证号|证件号)[：:\s]*(\d{17}[\dXx])/);
    if (idMatch) result.driverIdCard = idMatch[1];

    const phoneMatch = line.match(/(?:电话|手机|联系方式|联系电话|Tel)[：:\s]*(1[3-9]\d{9})/i);
    if (phoneMatch) result.driverPhone = phoneMatch[1];
  }

  if (!result.plateNumber) {
    const m = text.match(/([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-Z0-9]{5,6})/);
    if (m) result.plateNumber = m[1];
  }
  if (!result.driverPhone) {
    const m = text.match(/(1[3-9]\d{9})/);
    if (m) result.driverPhone = m[1];
  }
  if (!result.driverIdCard) {
    const m = text.match(/(\d{17}[\dXx])/);
    if (m) result.driverIdCard = m[1];
  }

  return result;
}

export default function DriverInfoPaste({ onParsed }: DriverInfoPasteProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedInfo | null>(null);

  const handleParse = () => {
    const info = parseDriverInfo(text);
    setParsed(info);
    onParsed(info);
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="text-blue-600 border-blue-300" onClick={() => setOpen(true)}>
        <ClipboardPaste className="h-3.5 w-3.5 mr-1" />
        粘贴司机信息
      </Button>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-blue-50/50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-blue-700">粘贴司机信息（自动识别）</span>
        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setOpen(false); setText(""); setParsed(null); }}>关闭</Button>
      </div>
      <Textarea
        placeholder={"车号：粤W75646\n司机：张天祥\n身份证：445323199311281216\n电话：13026626316"}
        value={text}
        onChange={(e) => { setText(e.target.value); setParsed(null); }}
        rows={4}
        className="text-xs bg-white"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleParse} disabled={!text.trim()}>
          <Check className="h-3.5 w-3.5 mr-1" />识别并填充
        </Button>
        {parsed && (
          <div className="flex flex-wrap gap-1">
            {parsed.plateNumber && <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">车牌: {parsed.plateNumber}</Badge>}
            {parsed.driverName && <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">姓名: {parsed.driverName}</Badge>}
            {parsed.driverPhone && <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">电话: {parsed.driverPhone}</Badge>}
            {parsed.driverIdCard && <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">身份证: {parsed.driverIdCard}</Badge>}
            {!parsed.plateNumber && !parsed.driverName && !parsed.driverPhone && !parsed.driverIdCard && (
              <span className="text-xs text-red-500">未识别到有效信息，请检查格式</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { parseDriverInfo };
export type { ParsedInfo };
