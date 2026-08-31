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
 * Сохраняет (создаёт или обновляет) расширенную анкету пары для текущего пользователя.
 * Таблица: public.couple_profiles, PK/unique — user_id.
 * Требует настроенных RLS-политик (см. supabase-schema.sql).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId - session.user.id
 * @param {object} profile - поля анкеты (см. questionnaire.html: state)
 */
export async function saveCoupleProfile(client, userId, profile) {
  const toIntOrNull = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  const payload = {
    user_id: userId,

    // о пользователе — база
    user_age: toIntOrNull(profile.user_age),
    user_name: profile.user_name || "",
    user_gender: profile.user_gender || "",
    relationship_orientation: profile.relationship_orientation || "",

    // о пользователе — ценности и ожидания
    values: profile.values || [],
    expectations: profile.expectations || "",

    // о пользователе — стиль привязанности / язык любви
    attachment_style: profile.attachment_style || "",
    love_language: profile.love_language || "",

    // о пользователе — конфликты и опыт
    conflict_style: profile.conflict_style || "",
    triggers: profile.triggers || "",
    past_experience: profile.past_experience || "",

    // о партнёре — база
    partner_age: toIntOrNull(profile.partner_age),
    partner_gender: profile.partner_gender || "",
    known_duration: profile.known_duration || "",
    how_met: profile.how_met || "",

    // о партнёре — характер
    partner_info: profile.partner_info || "",
    partner_attachment_style: profile.partner_attachment_style || "",
    partner_conflict_style: profile.partner_conflict_style || "",
    appreciation: profile.appreciation || "",

    // стадия отношений и цели
    relationship_stage: profile.relationship_stage || "",
    stage_detail: profile.stage_detail || "",
    stage_note: profile.stage_note || "",
    goals: profile.goals || [],

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
 * Возвращает null, если анкета ещё не заполнена (или таблицы/доступа нет —
 * ошибка логируется в консоль, но не блокирует остальной UI).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 */
export async function loadCoupleProfile(client, userId) {
  try {
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
  } catch (err) {
    console.error("loadCoupleProfile exception:", err);
    return null;
  }
}

/**
 * Проверяет, заполнена ли анкета (для показа статуса в кабинете).
 * Никогда не бросает исключение — при любой ошибке возвращает false,
 * чтобы не блокировать отрисовку личного кабинета.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 */
export async function hasCoupleProfile(client, userId) {
  try {
    const profile = await loadCoupleProfile(client, userId);
    return !!(profile && profile.relationship_stage);
  } catch (err) {
    console.error("hasCoupleProfile exception:", err);
    return false;
  }
}
