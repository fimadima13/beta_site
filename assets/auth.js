// RelationSync.ai — общая логика авторизации и данных для всех страниц кабинета.
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

/* ============================================================
   ПРОФИЛЬ АККАУНТА
   ============================================================ */

export async function updateDisplayName(client, userId, name) {
  const { error: authError } = await client.auth.updateUser({ data: { display_name: name } });
  if (authError) throw authError;

  const { error: profileError } = await client
    .from("couple_profiles")
    .upsert({ user_id: userId, user_name: name, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (profileError) throw profileError;

  return true;
}

export async function requestEmailChange(client, newEmail) {
  const { error } = await client.auth.updateUser({ email: newEmail });
  if (error) throw error;
  return true;
}

export async function updatePassword(client, newPassword) {
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return true;
}

export function getDisplayProfile(session) {
  if (!session) return null;
  const meta = session.user.user_metadata || {};
  return {
    email: session.user.email,
    displayName: meta.display_name || session.user.email.split("@")[0],
  };
}

/* ============================================================
   АНКЕТА О ПАРЕ (couple_profiles)
   ============================================================ */

export async function saveCoupleProfile(client, userId, profile) {
  const toIntOrNull = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  const payload = {
    user_id: userId,
    user_age: toIntOrNull(profile.user_age),
    user_name: profile.user_name || "",
    user_gender: profile.user_gender || "",
    relationship_orientation: profile.relationship_orientation || "",
    values: profile.values || [],
    expectations: profile.expectations || "",
    attachment_style: profile.attachment_style || "",
    love_language: profile.love_language || "",
    conflict_style: profile.conflict_style || "",
    triggers: profile.triggers || "",
    past_experience: profile.past_experience || "",
    partner_age: toIntOrNull(profile.partner_age),
    partner_gender: profile.partner_gender || "",
    known_duration: profile.known_duration || "",
    how_met: profile.how_met || "",
    partner_info: profile.partner_info || "",
    partner_attachment_style: profile.partner_attachment_style || "",
    partner_conflict_style: profile.partner_conflict_style || "",
    appreciation: profile.appreciation || "",
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

export async function hasCoupleProfile(client, userId) {
  try {
    const profile = await loadCoupleProfile(client, userId);
    return !!(profile && profile.relationship_stage);
  } catch (err) {
    console.error("hasCoupleProfile exception:", err);
    return false;
  }
}

/* ============================================================
   ТАРИФ (couple_profiles.selected_plan)
   ============================================================ */

const VALID_PLANS = ["free", "premium", "couple"];

export async function setSelectedPlan(client, userId, plan) {
  if (!VALID_PLANS.includes(plan)) throw new Error("Некорректный тариф: " + plan);

  const { data, error } = await client
    .from("couple_profiles")
    .upsert(
      { user_id: userId, selected_plan: plan, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getSelectedPlan(client, userId) {
  try {
    const { data, error } = await client
      .from("couple_profiles")
      .select("selected_plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("getSelectedPlan error:", error);
      return "free";
    }
    return (data && data.selected_plan) || "free";
  } catch (err) {
    console.error("getSelectedPlan exception:", err);
    return "free";
  }
}

export function getLandingSelectedPlan() {
  try {
    const plan = localStorage.getItem("relationsync_selected_plan");
    return VALID_PLANS.includes(plan) ? plan : null;
  } catch (e) {
    return null;
  }
}

/* ============================================================
   ЧЕК-ЛИСТ (checklists)
   ============================================================ */

const STAGE_LABELS = {
  dating_start: "Знакомство", dating: "Свидания", relationship: "Отношения",
  crisis: "Кризис", recovery: "Восстановление",
};
const ATTACHMENT_LABELS = {
  secure: "надёжный", anxious: "тревожный", avoidant: "избегающий",
  fearful: "тревожно-избегающий", unsure: "не определён",
};
const CONFLICT_LABELS = {
  discuss: "сразу обсуждать", withdraw: "отойти и подумать", appease: "сглаживать и уступать",
  escalate: "повышать тон", avoid: "избегать темы", unsure: "неизвестно",
};
const VALUE_LABELS = {
  honesty: "честность", support: "поддержка", independence: "личное пространство",
  passion: "страсть и близость", stability: "стабильность", growth: "совместный рост",
  humor: "юмор и лёгкость", loyalty: "верность", communication: "открытое общение",
  ambition: "общие цели и амбиции",
};
const GOAL_LABELS = {
  understand_partner: "лучше понимать партнёра", communication: "улучшить общение",
  resolve_conflict: "разрешить текущий конфликт", rebuild_trust: "восстановить доверие",
  deepen_intimacy: "больше близости", decide_future: "понять, куда движутся отношения",
};

function buildPlaceholderItems(profile) {
  const items = [];
  let id = 1;
  const stageLabel = STAGE_LABELS[profile.relationship_stage] || "текущий этап";
  items.push({ id: id++, title: `Учитывайте, что вы сейчас на этапе «${stageLabel}»`, detail: profile.stage_detail || profile.stage_note || "Уточните детали ситуации в анкете, чтобы советы были точнее.", tag: "Стадия", done: false });
  if (profile.attachment_style) items.push({ id: id++, title: `Ваш стиль привязанности — ${ATTACHMENT_LABELS[profile.attachment_style] || profile.attachment_style}`, detail: "Это влияет на то, как вы реагируете на дистанцию и близость в паре — держите это в уме при следующем разговоре с партнёром.", tag: "О вас", done: false });
  if (profile.partner_attachment_style && profile.partner_attachment_style !== "unsure") items.push({ id: id++, title: `У партнёра предположительно ${ATTACHMENT_LABELS[profile.partner_attachment_style] || profile.partner_attachment_style} стиль привязанности`, detail: "Сравните со своим стилем — часто именно разница в стилях привязанности объясняет повторяющиеся недопонимания.", tag: "О партнёре", done: false });
  if (profile.conflict_style) items.push({ id: id++, title: `В конфликте вам свойственно ${CONFLICT_LABELS[profile.conflict_style] || profile.conflict_style}`, detail: profile.partner_conflict_style ? `У партнёра противоположная/схожая тенденция: ${CONFLICT_LABELS[profile.partner_conflict_style] || profile.partner_conflict_style}. Обсудите это напрямую, не дожидаясь следующего спора.` : "Обсудите с партнёром, как каждый из вас предпочитает решать разногласия.", tag: "Коммуникация", done: false });
  if (profile.values && profile.values.length) items.push({ id: id++, title: "Ваши ключевые ценности в отношениях", detail: `Вы отметили: ${profile.values.map(v => VALUE_LABELS[v] || v).join(", ")}. Проверьте, насколько партнёр в курсе, что это важно для вас.`, tag: "Ценности", done: false });
  if (profile.triggers) items.push({ id: id++, title: "Отметьте свои триггеры партнёру, если ещё не делали этого", detail: profile.triggers, tag: "Опыт", done: false });
  if (profile.goals && profile.goals.length) items.push({ id: id++, title: "Ваш текущий приоритет", detail: `Вы отметили: ${profile.goals.map(g => GOAL_LABELS[g] || g).join(", ")}. Все следующие шаги стоит сверять с этим приоритетом.`, tag: "Цель", done: false });
  if (items.length === 0) items.push({ id: id++, title: "Заполните анкету подробнее", detail: "Чем больше деталей о себе и партнёре, тем точнее будет чек-лист.", tag: "Анкета", done: false });
  return items;
}

export async function generateChecklistPlaceholder(client, userId, profile, options = {}) {
  const items = buildPlaceholderItems(profile);
  const payload = {
    user_id: userId, items, generation_status: "placeholder",
    source_profile_updated_at: profile.updated_at || new Date().toISOString(),
    raw_prompt_input: profile, generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const { data, error } = await client.from("checklists").upsert(payload, { onConflict: "user_id" }).select().single();
  if (error) throw error;
  return data;
}

export async function loadChecklist(client, userId) {
  try {
    const { data, error } = await client.from("checklists").select("*").eq("user_id", userId).maybeSingle();
    if (error) { console.error("loadChecklist error:", error); return null; }
    return data;
  } catch (err) { console.error("loadChecklist exception:", err); return null; }
}

export async function toggleChecklistItem(client, userId, itemIndex, doneValue) {
  const { data: current, error: readError } = await client.from("checklists").select("items").eq("user_id", userId).single();
  if (readError) throw readError;
  const items = current.items || [];
  if (!items[itemIndex]) throw new Error("Пункт чек-листа не найден");
  items[itemIndex].done = doneValue;
  const { data, error } = await client.from("checklists").update({ items, updated_at: new Date().toISOString() }).eq("user_id", userId).select().single();
  if (error) throw error;
  return data;
}

export async function saveChecklist(client, userId, items, options = {}) {
  const payload = {
    user_id: userId, items, generation_status: options.generationStatus || "ai_generated",
    source_profile_updated_at: options.sourceProfileUpdatedAt || new Date().toISOString(),
    raw_prompt_input: options.rawPromptInput || null,
    generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const { data, error } = await client.from("checklists").upsert(payload, { onConflict: "user_id" }).select().single();
  if (error) throw error;
  return data;
}

/* ============================================================
   ДНЕВНИК: настроение (mood_entries)
   ============================================================ */

/**
 * Сохраняет отметку настроения на сегодня (одна запись в день на пользователя —
 * повторная отметка в тот же день обновляет существующую запись).
 * @param {number} moodValue - 1..5 (1 = очень плохо, 5 = очень хорошо)
 */
export async function saveMoodEntry(client, userId, moodValue, note = "") {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data, error } = await client
    .from("mood_entries")
    .upsert(
      { user_id: userId, entry_date: today, mood_value: moodValue, note: note || "" },
      { onConflict: "user_id,entry_date" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Загружает последние N отметок настроения, по возрастанию даты (для графика).
 */
export async function loadMoodHistory(client, userId, days = 14) {
  try {
    const { data, error } = await client
      .from("mood_entries")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(days);
    if (error) { console.error("loadMoodHistory error:", error); return []; }
    return (data || []).reverse();
  } catch (err) {
    console.error("loadMoodHistory exception:", err);
    return [];
  }
}

/* ============================================================
   ДНЕВНИК: записи (diary_entries)
   ============================================================ */

export async function saveDiaryEntry(client, userId, text, prompt = "") {
  const payload = { user_id: userId, entry_text: text, prompt_used: prompt || "" };
  const { data, error } = await client.from("diary_entries").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function loadDiaryEntries(client, userId, limit = 30) {
  try {
    const { data, error } = await client
      .from("diary_entries")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) { console.error("loadDiaryEntries error:", error); return []; }
    return data || [];
  } catch (err) {
    console.error("loadDiaryEntries exception:", err);
    return [];
  }
}

export async function deleteDiaryEntry(client, userId, entryId) {
  const { error } = await client.from("diary_entries").delete().eq("id", entryId).eq("user_id", userId);
  if (error) throw error;
  return true;
}

/* ============================================================
   ВАЖНЫЕ ДАТЫ ПАРЫ (important_dates)
   ============================================================ */

export async function saveImportantDate(client, userId, title, dateValue, isRecurringYearly = true) {
  const payload = { user_id: userId, title, date_value: dateValue, is_recurring_yearly: isRecurringYearly };
  const { data, error } = await client.from("important_dates").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function loadImportantDates(client, userId) {
  try {
    const { data, error } = await client
      .from("important_dates")
      .select("*")
      .eq("user_id", userId)
      .order("date_value", { ascending: true });
    if (error) { console.error("loadImportantDates error:", error); return []; }
    return data || [];
  } catch (err) {
    console.error("loadImportantDates exception:", err);
    return [];
  }
}

export async function deleteImportantDate(client, userId, dateId) {
  const { error } = await client.from("important_dates").delete().eq("id", dateId).eq("user_id", userId);
  if (error) throw error;
  return true;
}

/**
 * Вычисляет для важной даты: сколько дней до следующего наступления
 * (с учётом is_recurring_yearly — переносит на следующий год, если дата уже прошла).
 */
export function daysUntilNext(dateValue, isRecurringYearly) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let target = new Date(dateValue);
  target.setHours(0, 0, 0, 0);

  if (isRecurringYearly) {
    target.setFullYear(today.getFullYear());
    if (target < today) target.setFullYear(today.getFullYear() + 1);
  }

  const diffMs = target - today;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
