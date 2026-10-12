// MHR70 joint indices from mohamdev/InstantHMR instanthmr/skeleton.py (PRD Appendix B).
export const MHR70 = {
  nose: 0,
  left_shoulder: 5,
  right_shoulder: 6,
  left_elbow: 7,
  right_elbow: 8,
  left_hip: 9,
  right_hip: 10,
  left_knee: 11,
  right_knee: 12,
  left_ankle: 13,
  right_ankle: 14,
  left_big_toe: 15,
  left_heel: 17,
  right_big_toe: 18,
  right_heel: 20,
  right_wrist: 41,
  left_wrist: 62,
  neck: 69,
} as const;

export const NUM_JOINTS = 70;

/** Body-only edges to draw (hands omitted for the MVP). */
export const BODY_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 69],
  [69, 5], [69, 6],
  [5, 9], [6, 10], [9, 10],
  [5, 7], [7, 62],
  [6, 8], [8, 41],
  [9, 11], [11, 13], [13, 17], [13, 15],
  [10, 12], [12, 14], [14, 20], [14, 18],
];

/** Joints used to derive a tracking box from the previous frame. */
export const BODY_JOINTS: readonly number[] = [...new Set(BODY_EDGES.flat())];
