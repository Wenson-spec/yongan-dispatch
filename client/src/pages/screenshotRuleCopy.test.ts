import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) => {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
};

describe("screenshot rule copy closure", () => {
  it("keeps SmartPaste in suggestion-only wording instead of formal grouping wording", () => {
    const source = readProjectFile("client/src/pages/SmartPaste.tsx");

    expect(source).toContain("这里只做识别归并与录单建议");
    expect(source).toContain("参考批次只用于内部整理与录单建议");
    expect(source).toContain("个参考批次");
    expect(source).toContain("已进入录单待分流队列");
    expect(source).not.toContain("已自动分组");
  });

  it("keeps DispatchVehicle in self-operated internal allocation wording", () => {
    const source = readProjectFile("client/src/pages/DispatchVehicle.tsx");

    expect(source).toContain("自运参考批次");
    expect(source).toContain("仅用于自运内部配载整理，不形成正式外请分组");
    expect(source).toContain("当前仅展示已完成自运内部配载整理的记录");
    expect(source).toContain("批量派车成功，共 ");
    expect(source).toContain("运费已按内部配载结果分摊");
  });

  it("keeps LtlUnifiedWorkspace explicit about front/back outsource child chains", () => {
    const source = readProjectFile("client/src/pages/LtlUnifiedWorkspace.tsx");

    expect(source).toContain("前段外请、后段外请会继续挂在零担主单下流转");
    expect(source).toContain("前段外请子链");
    expect(source).toContain("后段外请子链");
    expect(source).toContain("参考批次号仅用于内部对照，不作为正式外请分组");
    expect(source).toContain("按整理批次询价完成");
  });
});
