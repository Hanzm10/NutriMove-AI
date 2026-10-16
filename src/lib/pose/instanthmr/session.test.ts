import { describe, expect, it } from "vitest";
import { fakeModel } from "../test-fakes";
import { JOINT_OUTPUTS, createRunner } from "./session";

describe("createRunner: the model only computes and returns the joints", () => {
  it("asks ORT for exactly joints_2d and joints_3d, never the other outputs", async () => {
    const { model, runs } = fakeModel();
    const runner = createRunner(model);
    const out = await runner.run();
    expect(runner.fetches).toEqual([...JOINT_OUTPUTS]);
    expect(runs[0]!.fetches).toEqual(["joints_2d", "joints_3d"]);
    expect(Object.keys(out).sort()).toEqual(["joints2dNorm", "joints3d"]);
    expect(out.joints2dNorm).toHaveLength(140);
    expect(out.joints3d).toHaveLength(210);
  });

  it("falls back to output positions 3 and 4 when the model uses other names", async () => {
    const { model, runs } = fakeModel(["a", "b", "c", "j2", "j3"]);
    await createRunner(model).run();
    expect(runs[0]!.fetches).toEqual(["j2", "j3"]);
  });

  it("creates its buffers and tensors once, however many frames run", async () => {
    const { model, runs, tensorsMade } = fakeModel();
    const runner = createRunner(model);
    const input = runner.input, cliff = runner.cliff;
    for (let i = 0; i < 50; i++) await runner.run();
    expect(tensorsMade).toHaveBeenCalledTimes(2); // image + cliff_cond, at creation only
    expect(new Set(runs.map((r) => r.feeds)).size).toBe(1); // same feeds object every frame
    expect(runs.every((r) => r.feeds.image!.data === input && r.feeds.cliff_cond!.data === cliff)).toBe(true);
    expect(runner.input).toBe(input);
    expect(runner.input).toHaveLength(3 * 224 * 224);
  });
});
