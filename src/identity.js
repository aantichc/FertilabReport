export function isFertilabUser(user) {
  return user?.app_metadata?.provider === "azure"
    && user.email?.trim().toLowerCase().endsWith("@fertilab.org") === true
    && !user.is_anonymous;
}

export function accountName(user) {
  const metadata = user?.user_metadata || {};
  const candidates = [metadata.full_name, metadata.name, metadata.custom_claims?.name, user?.email];
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}
