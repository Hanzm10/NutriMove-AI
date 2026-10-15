"""Convert the public EC3D dataset into NutriMove clip files for held-out testing (docs/evaluation.md).

EC3D (Zhao et al., "3D Pose Based Feedback for Physical Exercises", ACCV 2022) has 3D skeletons of 4 people doing
squats and lunges, each sequence one repetition, labelled correct or with a named mistake.

    python3 scripts/ec3d-to-clips.py path/to/data_3D.pickle

writes eval/ec3d/ec3d.joints.json + eval/ec3d/ec3d.labels.csv (gitignored: the dataset has no stated licence, so it is
not redistributed). One clip per person and exercise: 1.5 s standing, then every repetition with a short standing pause
between them, so the coach sees a normal set. Joints only (no images exist in this file).
"""
import collections
import json
import os
import pickle
import sys

import numpy as np

# The pickle only holds numpy arrays; refuse anything else so loading it cannot run code.
ALLOWED = {("numpy.core.multiarray", "_reconstruct"), ("numpy", "ndarray"), ("numpy", "dtype")}


class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if (module, name) not in ALLOWED:
            raise pickle.UnpicklingError(f"blocked {module}.{name}")
        if module.startswith("numpy.core") and not hasattr(np, "core"):
            module = module.replace("numpy.core", "numpy._core")
        return super().find_class(module, name)


# OpenPose BODY_25 index for each NutriMove canonical joint (src/lib/pose/types.ts order).
BODY25 = {
    "nose": 0, "neck": 1, "l_shoulder": 5, "r_shoulder": 2, "l_elbow": 6, "r_elbow": 3, "l_wrist": 7, "r_wrist": 4,
    "l_hip": 12, "r_hip": 9, "l_knee": 13, "r_knee": 10, "l_ankle": 14, "r_ankle": 11,
    "l_heel": 21, "r_heel": 24, "l_big_toe": 19, "r_big_toe": 22,
}
CANONICAL = list(BODY25)

# EC3D instruction ids (Table 1 of the paper) → NutriMove label words (src/lib/pose/eval/score.ts LABEL_CODES).
# Mistakes the app does not check keep a descriptive name and are reported as "not checked". "Front bent" is kept out
# of the torso-lean score on purpose: EC3D rotates every pose so the spine is vertical (paper §4), so lean can't be
# measured from these skeletons.
LABELS = {
    ("SQUAT", "1"): "good", ("SQUAT", "2"): "feet-too-wide", ("SQUAT", "3"): "knees-in",
    ("SQUAT", "4"): "shallow", ("SQUAT", "5"): "front-bent",
    ("Lunges", "1"): "good", ("Lunges", "4"): "shallow", ("Lunges", "6"): "knee-past-toe",
}
EXERCISE = {"SQUAT": "squat", "Lunges": "lunge"}
FPS = 30
LEAD_S, PAUSE_S = 1.5, 0.5
NOSE_TO_ANKLE_M = 1.55  # EC3D coordinates are not in metres; scale each person to a typical adult


def main(src: str, out_dir: str = "eval/ec3d") -> None:
    data = SafeUnpickler(open(src, "rb")).load()
    labels, poses = data["labels"], data["poses"]  # (N, 5) [exercise, subject, instruction, rep, frame]; (N, 3, 25), Z up

    seqs = collections.OrderedDict()
    for i, row in enumerate(labels):
        seqs.setdefault(tuple(row[:4]), []).append(i)

    clips, csv, skipped = {}, ["file,rep,errors"], collections.Counter()
    for (ex, subject, instr, _rep), idx in seqs.items():
        label = LABELS.get((ex, instr))
        if label is None:
            skipped[f"{ex} {instr}"] += 1  # planks, and squat id 10 which the paper's Table 1 does not list
            continue
        idx = sorted(idx, key=lambda i: int(labels[i][4]))
        name = f"{EXERCISE[ex]}_ec-{subject.lower()}.joints"
        clip = clips.setdefault(name, {"exercise": EXERCISE[ex], "frames": [], "scale": None, "reps": 0})
        p = poses[idx].transpose(0, 2, 1)  # (n, 25, 3)
        # To NutriMove's InstantHMR convention: Y down, metres.
        p = np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)
        if clip["scale"] is None:
            height = (p[0, 11, 1] + p[0, 14, 1]) / 2 - p[0, 0, 1]
            clip["scale"] = NOSE_TO_ANKLE_M / height
        p = p * clip["scale"]
        frames = clip["frames"]
        hold = round((LEAD_S if not frames else PAUSE_S) * FPS)
        frames.extend([p[0]] * hold + list(p))
        clip["reps"] += 1
        csv.append(f"{name.removesuffix('.joints')}.mp4,{clip['reps']},{label}")

    out = []
    for name, c in clips.items():
        frames = [
            {
                "t": round(k * 1000 / FPS),
                "v": 1,
                # 2D is only used for drawing; a simple side projection keeps the file valid.
                "j2": [round(float(v), 1) for j in CANONICAL for v in (320 + f[BODY25[j], 0] * 200, 480 + f[BODY25[j], 1] * 200)],
                "j3": [round(float(v), 4) for j in CANONICAL for v in f[BODY25[j]]],
            }
            for k, f in enumerate(c["frames"])
        ]
        out.append({
            "version": 1, "file": name.removesuffix(".joints") + ".mp4", "exercise": c["exercise"], "fps": FPS,
            "width": 640, "height": 960, "durationS": round(len(frames) / FPS, 1), "backend": "ec3d-triangulated",
            "frames": frames,
        })

    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "ec3d.joints.json"), "w") as f:
        json.dump({"version": 1, "clips": out}, f, separators=(",", ":"))
    with open(os.path.join(out_dir, "ec3d.labels.csv"), "w") as f:
        f.write("\n".join(csv) + "\n")
    print(f"{len(out)} clips, {len(csv) - 1} reps → {out_dir}; skipped {dict(skipped)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(*sys.argv[1:])
