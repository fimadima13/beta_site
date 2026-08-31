// RelationSync.ai — общая логика авторизации и данных для login.html, cabinet.html и questionnaire.html
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

/**
 * Сохраняет (создаёт или обновляет) анкету пары для текущего пользователя.
 * Таблица: public.couple_profiles, PK/unique — user_id.
 * Требует настроенных RLS-политик (см. supabase-schema.sql).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId - session.user.id
 * @param {object} profile - поля анкеты
 */
export async function saveCoupleProfile(client, userId, profile) {
  const payload = {
    user_id: userId,
    values: profile.values || [],
    expectations: profile.expectations || "",
    attachment_style: profile.attachment_style || "",
    partner_info: profile.partner_info || "",
    partner_attachment_style: profile.partner_attachment_style || "",
    relationship_stage: profile.relationship_stage || "",
    stage_note: profile.stage_note || "",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("couple_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Загружает анкету пары текущего пользователя, если она уже существует.
 * Возвращает null, если анкета ещё не заполнена.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 */
export async function loadCoupleProfile(client, userId) {
  const { data, error } = await client
    .from("couple_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("loadCoupleProfile error:", error);
    return null;
  }
  return data;
}

/**
 * Проверяет, заполнена ли анкета (для показа статуса в кабинете).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 */
export async function hasCoupleProfile(client, userId) {
  const profile = await loadCoupleProfile(client, userId);
  return !!(profile && profile.relationship_stage);
}
