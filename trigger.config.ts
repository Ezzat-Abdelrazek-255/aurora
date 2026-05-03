import { defineConfig } from "@trigger.dev/sdk";
import { ffmpeg } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./trigger"],
  maxDuration: 180,
  build: {
    // Installs ffmpeg + ffprobe into the deployed task container and exposes
    // them via FFMPEG_PATH / FFPROBE_PATH env vars.
    extensions: [ffmpeg()],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      randomize: true,
    },
  },
});
