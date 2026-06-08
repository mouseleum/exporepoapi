import { describe, expect, it } from "vitest";
import {
  computeEngagementSignals,
  pickPipelineSignal,
} from "../lib/hubspot/sync";
import type { HubSpotDeal, HubSpotEngagement } from "../lib/hubspot/client";

// Phase 9: signal-computation policy. The orchestrator's network plumbing is
// best verified via local curl against a real HubSpot portal; here we lock
// down the logic that turns raw engagements/deals into the three booleans the
// UI renders.

function engagement(partial: Partial<HubSpotEngagement> & Pick<HubSpotEngagement, "id">): HubSpotEngagement {
  return {
    type: partial.type ?? "meetings",
    ownerId: partial.ownerId ?? null,
    timestamp: partial.timestamp ?? null,
    ...partial,
  };
}

function deal(partial: Partial<HubSpotDeal> & Pick<HubSpotDeal, "id">): HubSpotDeal {
  return {
    dealstage: partial.dealstage ?? "open-stage",
    amount: partial.amount ?? null,
    pipeline: partial.pipeline ?? "default",
    ...partial,
  };
}

describe("computeEngagementSignals", () => {
  it("flags met_by_me when an engagement's owner matches the current user", () => {
    const sig = computeEngagementSignals(
      [engagement({ id: "e1", ownerId: "owner-me", timestamp: "2026-05-01T10:00:00Z" })],
      "owner-me",
    );
    expect(sig.metByMe).toBe(true);
    expect(sig.metByTeam).toBe(false);
    expect(sig.latest?.id).toBe("e1");
  });

  it("flags met_by_team when an engagement's owner is someone else", () => {
    const sig = computeEngagementSignals(
      [engagement({ id: "e1", ownerId: "owner-other", timestamp: "2026-05-01T10:00:00Z" })],
      "owner-me",
    );
    expect(sig.metByMe).toBe(false);
    expect(sig.metByTeam).toBe(true);
  });

  it("flags both when multiple engagements have different owners", () => {
    const sig = computeEngagementSignals(
      [
        engagement({ id: "e1", ownerId: "owner-me", timestamp: "2026-05-01T10:00:00Z" }),
        engagement({ id: "e2", ownerId: "owner-other", timestamp: "2026-06-01T10:00:00Z" }),
      ],
      "owner-me",
    );
    expect(sig.metByMe).toBe(true);
    expect(sig.metByTeam).toBe(true);
    expect(sig.latest?.id).toBe("e2");
  });

  it("treats owner-less engagements as team", () => {
    const sig = computeEngagementSignals(
      [engagement({ id: "e1", ownerId: null, timestamp: "2026-05-01T10:00:00Z" })],
      "owner-me",
    );
    expect(sig.metByMe).toBe(false);
    expect(sig.metByTeam).toBe(true);
  });

  it("treats every engagement as team when no current user is configured", () => {
    const sig = computeEngagementSignals(
      [engagement({ id: "e1", ownerId: "anyone", timestamp: "2026-05-01T10:00:00Z" })],
      null,
    );
    expect(sig.metByMe).toBe(false);
    expect(sig.metByTeam).toBe(true);
  });

  it("returns no latest when input is empty", () => {
    const sig = computeEngagementSignals([], "owner-me");
    expect(sig).toEqual({ metByMe: false, metByTeam: false, latest: null });
  });

  it("breaks timestamp ties deterministically by id", () => {
    const sig = computeEngagementSignals(
      [
        engagement({ id: "a", timestamp: "2026-05-01T10:00:00Z", ownerId: "owner-me" }),
        engagement({ id: "z", timestamp: "2026-05-01T10:00:00Z", ownerId: "owner-other" }),
      ],
      "owner-me",
    );
    expect(sig.latest?.id).toBe("z");
  });
});

describe("pickPipelineSignal", () => {
  const closedStageIds = new Set(["closedwon", "closedlost"]);
  const stageLabelById = new Map([
    ["discovery", "Discovery"],
    ["proposal", "Proposal"],
    ["closedwon", "Closed Won"],
    ["closedlost", "Closed Lost"],
  ]);

  it("flags in_pipeline only when at least one open deal exists", () => {
    expect(
      pickPipelineSignal(
        [deal({ id: "d1", dealstage: "closedwon", amount: 10_000 })],
        closedStageIds,
        stageLabelById,
      ),
    ).toEqual({ inPipeline: false, latestOpenDealStage: null, latestOpenDealAmount: null });

    expect(
      pickPipelineSignal(
        [deal({ id: "d1", dealstage: "discovery", amount: 5_000 })],
        closedStageIds,
        stageLabelById,
      ),
    ).toEqual({ inPipeline: true, latestOpenDealStage: "Discovery", latestOpenDealAmount: 5_000 });
  });

  it("picks the highest-amount open deal, labels it, and ignores closed", () => {
    const sig = pickPipelineSignal(
      [
        deal({ id: "d1", dealstage: "discovery", amount: 5_000 }),
        deal({ id: "d2", dealstage: "proposal", amount: 25_000 }),
        deal({ id: "d3", dealstage: "closedwon", amount: 99_999 }),
      ],
      closedStageIds,
      stageLabelById,
    );
    expect(sig.inPipeline).toBe(true);
    expect(sig.latestOpenDealStage).toBe("Proposal");
    expect(sig.latestOpenDealAmount).toBe(25_000);
  });

  it("falls back to the raw dealstage id when no label is registered", () => {
    const sig = pickPipelineSignal(
      [deal({ id: "d1", dealstage: "custom-stage-id", amount: 1_000 })],
      closedStageIds,
      stageLabelById,
    );
    expect(sig.latestOpenDealStage).toBe("custom-stage-id");
  });
});
