import { defineConfig, Plugin } from "vite";
import { spawn, ChildProcess } from "node:child_process";

const TTS_PORT = 5299;

/**
 * Starts the local neural voice server (scripts/voice/tts_server.py, needs `uv`)
 * alongside the dev server. Without it the game falls back to browser speech.
 */
function voiceServer(): Plugin {
  let child: ChildProcess | null = null;
  return {
    name: "voice-server",
    apply: "serve",
    configureServer(server) {
      child = spawn("uv", ["run", "--quiet", "scripts/voice/tts_server.py"], {
        stdio: ["ignore", "inherit", "inherit"],
        env: { ...process.env, TTS_PORT: String(TTS_PORT) },
      });
      child.on("error", () => console.warn("[tts] `uv` not found — using browser speech instead"));
      server.httpServer?.on("close", () => child?.kill());
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [voiceServer()],
  build: {
    target: "ES2020",
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      "/tts": `http://127.0.0.1:${TTS_PORT}`,
    },
  },
});
