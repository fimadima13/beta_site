// RelationSync.ai — общая логика авторизации для login.html и cabinet.html
// Использует Supabase JS SDK (через ESM CDN, без сборки — подходит для GitHub Pages).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function isConfigured() {
  const c = window.SUPABASE_CONFIG || {};
  return (
    c.url &&
    c.anonKey &&
    !c.url.includes("YOUR-PROJECT-REF") &&
    !c.anonKey.includes("YOUR-ANON-PUBLIC-KEY")
  );
}

export function getClient() {
  if (!isConfigured()) return null;
  return createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
}

export async function getSession(client) {
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data.session;
}
