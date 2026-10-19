export function hasLiveWorkspaceConfig() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    process.env.DATABASE_URL?.trim(),
  );
}
