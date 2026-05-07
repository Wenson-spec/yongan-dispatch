import { describe, expect, it } from "vitest";
import { WORKSTATION_CONFIGS, getMenuForRole, getWorkstationLabel } from "../shared/workstation";

describe("workstation configuration", () => {
  it("admin menu has 回单管理台 instead of 回单押金台", () => {
    const adminMenu = WORKSTATION_CONFIGS.admin.menuItems;
    const podItem = adminMenu.find(m => m.key === "pod-deposit");
    expect(podItem).toBeDefined();
    expect(podItem!.label).toBe("回单管理台");
    expect(podItem!.icon).toBe("FileText");
    // Should NOT contain 回单押金台
    const oldItem = adminMenu.find(m => m.label === "回单押金台");
    expect(oldItem).toBeUndefined();
  });

  it("finance_assistant role label is 回单管理台", () => {
    const config = WORKSTATION_CONFIGS.finance_assistant;
    expect(config.label).toBe("回单管理台");
    expect(config.menuItems[0].label).toBe("回单管理台");
    expect(config.menuItems[0].icon).toBe("FileText");
  });

  it("getWorkstationLabel returns 回单管理台 for finance_assistant", () => {
    expect(getWorkstationLabel("finance_assistant")).toBe("回单管理台");
  });

  it("getMenuForRole returns correct menu for outsource_dispatcher (找车台)", () => {
    const menu = getMenuForRole("outsource_dispatcher");
    expect(menu.length).toBeGreaterThan(0);
    const findVehicle = menu.find(m => m.key === "find-vehicle");
    expect(findVehicle).toBeDefined();
    expect(findVehicle!.label).toBe("找车台");
  });

  it("no workstation config references 回单押金台", () => {
    for (const [role, config] of Object.entries(WORKSTATION_CONFIGS)) {
      expect(config.label).not.toBe("回单押金台");
      for (const item of config.menuItems) {
        expect(item.label).not.toBe("回单押金台");
      }
    }
  });
});
