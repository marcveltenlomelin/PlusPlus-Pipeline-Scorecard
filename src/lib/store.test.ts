import { describe, expect, it } from "vitest";
import { STAGE_GOALS } from "./config";
import { applyPatch, latestVersion, versionPathname } from "./store";
import type { Store } from "./types";

function emptyStore(): Store {
  return {
    goals: Object.fromEntries(
      Object.entries(STAGE_GOALS).map(([k, v]) => [k, { ...v }])
    ) as Store["goals"],
    overrides: {},
    sdrs: [],
    dealSdrs: {},
  };
}

describe("applyPatch — SDR semantics", () => {
  it("adds trimmed, deduped SDR names", () => {
    const s = applyPatch(emptyStore(), { addSdrs: ["Ana", "  Ana  ", "Ben", ""] });
    expect(s.sdrs).toEqual(["Ana", "Ben"]);
  });

  it("assigns deals only to known SDRs and clears with null", () => {
    let s = applyPatch(emptyStore(), { addSdrs: ["Ana"] });
    s = applyPatch(s, { setDealSdrs: { d1: "Ana", d2: "Ghost" } });
    expect(s.dealSdrs).toEqual({ d1: "Ana" }); // unknown name ignored
    s = applyPatch(s, { setDealSdrs: { d1: null } });
    expect(s.dealSdrs).toEqual({});
  });

  it("removing an SDR unassigns their deals", () => {
    let s = applyPatch(emptyStore(), { addSdrs: ["Ana", "Ben"] });
    s = applyPatch(s, { setDealSdrs: { d1: "Ana", d2: "Ben" } });
    s = applyPatch(s, { removeSdrs: ["Ana"] });
    expect(s.sdrs).toEqual(["Ben"]);
    expect(s.dealSdrs).toEqual({ d2: "Ben" });
  });

  it("leaves the legacy goals/overrides contract intact", () => {
    const s = applyPatch(emptyStore(), {
      goals: { sal: { month: 40 } },
      setOverrides: { "tp:sal:2026-06": { value: 9, at: 1 } },
    });
    expect(s.goals.sal.month).toBe(40);
    expect(s.goals.sal.year).toBe(STAGE_GOALS.sal.year); // merge, not replace
    expect(s.overrides["tp:sal:2026-06"].value).toBe(9);
    const cleared = applyPatch(s, { clearOverrides: ["tp:sal:2026-06"] });
    expect(cleared.overrides).toEqual({});
  });
});

describe("blob version pathnames", () => {
  it("sort chronologically as strings (zero-padded ms)", () => {
    const early = versionPathname(999, "aaaaaaaa");
    const late = versionPathname(1765000000000, "00000000");
    expect(early < late).toBe(true); // padding beats digit-count pitfalls
    expect(early).toBe("store/00000000000999-aaaaaaaa.json");
  });

  it("latestVersion picks the newest and ignores foreign pathnames", () => {
    const v1 = versionPathname(1765000000000, "aaaaaaaa");
    const v2 = versionPathname(1765000000001, "00000000");
    expect(latestVersion([v2, "other/zzz.json", v1])).toBe(v2);
    expect(latestVersion(["other/zzz.json"])).toBeNull();
    expect(latestVersion([])).toBeNull();
  });
});
