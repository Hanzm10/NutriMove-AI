import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static files, images and the ONNX/WASM assets.
    "/((?!_next/static|_next/image|favicon.ico|models/|ort/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|onnx|wasm|mjs)$).*)",
  ],
};
