/** A frame a pose backend dropped (busy, too far behind) or couldn't read. The coach just skips it. */
export class SkippedFrame extends Error {
  override name = "SkippedFrame";
}
export const isSkippedFrame = (e: unknown) => e instanceof SkippedFrame;
