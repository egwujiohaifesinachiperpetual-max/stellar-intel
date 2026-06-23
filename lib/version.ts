// Placeholder version file. `scripts/emit-version` overwrites this at build time.
export const sha = process.env.BUILD_SHA ?? 'local';
export const buildTime = process.env.BUILD_TIME ?? new Date().toISOString();
export const version = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

export default {
  sha,
  buildTime,
  version,
};
