// Bump a version when its text changes; users are asked to consent again.
export const CONSENT_VERSIONS = {
  data: "2026-10-12",
  health: "2026-10-12",
  camera: "2026-10-12",
  camera_remote: "2026-10-12",
} as const;

export type ConsentType = keyof typeof CONSENT_VERSIONS;
