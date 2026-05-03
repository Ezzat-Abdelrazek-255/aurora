import { defineConfig } from "@trigger.dev/sdk";
import {
  ffmpeg,
  syncEnvVars,
} from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./trigger"],
  maxDuration: 180,
  build: {
    extensions: [
      // Installs ffmpeg + ffprobe into the deployed task container and
      // exposes them via FFMPEG_PATH / FFPROBE_PATH env vars.
      ffmpeg(),
      // Push the local .env.local Supabase creds into Trigger.dev's deployed
      // environment so the task can read/write the DB and Storage. Runs at
      // deploy time only.
      syncEnvVars(async () => ({
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        SUPABASE_SERVICE_ROLE_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      })),
    ],
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
