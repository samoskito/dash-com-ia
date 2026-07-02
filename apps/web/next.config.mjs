import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const sharedSourceDir = path.resolve(appDir, "../../packages/shared/src");

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@wpptrack/shared"],
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias["@wpptrack/shared"] = sharedSourceDir;

    return config;
  }
};

export default nextConfig;
