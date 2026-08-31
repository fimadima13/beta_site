// RelationSync.ai — общая логика авторизации и данных для login.html, cabinet.html,
// questionnaire.html, checklist.html, pricing.html и account.html.
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
   ПРОФИЛЬ АККАУНТА (auth.users + user_metadata, couple_profiles.user_name)
   ============================================================ */

/**
 * Обновляет отображаемое имя пользователя. Хранится в двух местах:
 * - Supabase Auth user_metadata.display_name (источник истины для входа/сессии)
 * - couple_profiles.user_name (уже используется в анкете и чек-листе)
 * Обе записи обновляются, чтобы не разошлись данные между анкетой и профилем.
 */
export async function updateDisplayName(client, userId, name) {
  const { error: authError } = await client.auth.updateUser({
    data: { display_name: name },
  });
  if (authError) throw authError;

  // Не критично, если у пользователя ещё нет строки в couple_profiles —
  // тогда просто создаём минимальную запись с именем.
  const { error: profileError } = await client
    .from("couple_profiles")
    .upsert(
      { user_id: userId, user_name: name, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (profileError) throw profileError;

  return true;
}

/**
 * Запрашивает смену email. Supabase отправляет письмо для подтверждения
 * на НОВЫЙ адрес — смена вступит в силу только после подтверждения по ссылке
 * из письма. До подтверждения текущий email продолжает действовать для входа.
 */
export async function requestEmailChange(client, newEmail) {
  const { error } = await client.auth.updateUser({ email: newEmail });
  if (error) throw error;
  return true;
}

/**
 * Меняет пароль текущего пользователя. Требует активной сессии — не запрашивает
 * старый пароль повторно (пользователь уже прошёл auth через сессию).
 */
export async function updatePassword(client, newPassword) {
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return true;
}

/**
 * Возвращает удобный для отображения профиль: email, отображаемое имя
 * (из user_metadata, либо часть email до @, если имя не задано).
 */
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
  dating_start: "Знакомство",
  dating: "Свидания",
  relationship: "Отношения",
  crisis: "Кризис",
  recovery: "Восстановление",
};

const ATTACHMENT_LABELS = {
  secure: "надёжный",
  anxious: "тревожный",
  avoidant: "избегающий",
  fearful: "тревожно-избегающий",
  unsure: "не определён",
};

const CONFLICT_LABELS = {
  discuss: "сразу обсуждать",
  withdraw: "отойти и подумать",
  appease: "сглаживать и уступать",
  escalate: "повышать тон",
  avoid: "избегать темы",
  unsure: "неизвестно",
};

const VALUE_LABELS = {
  honesty: "честность", support: "поддержка", independence: "личное пространство",
  passion: "страсть и близость", stability: "стабильность", growth: "совместный рост",
  humor: "юмор и лёгкость", loyalty: "верность", communication: "открытое общение",
  ambition: "общие цели и амбиции",
};

const GOAL_LABELS = {
  understand_partner: "лучше понимать партнёра",
  communication: "улучшить общение",
  resolve_conflict: "разрешить текущий конфликт",
  rebuild_trust: "восстановить доверие",
  deepen_intimacy: "больше близости",
  decide_future: "понять, куда движутся отношения",
};

function buildPlaceholderItems(profile) {
  const items = [];
  let id = 1;

  const stageLabel = STAGE_LABELS[profile.relationship_stage] || "текущий этап";
  items.push({
    id: id++,
    title: `Учитывайте, что вы сейчас на этапе «${stageLabel}»`,
    detail: profile.stage_detail || profile.stage_note || "Уточните детали ситуации в анкете, чтобы советы были точнее.",
    tag: "Стадия",
    done: false,
  });

  if (profile.attachment_style) {
    items.push({
      id: id++,
      title: `Ваш стиль привязанности — ${ATTACHMENT_LABELS[profile.attachment_style] || profile.attachment_style}`,
      detail: "Это влияет на то, как вы реагируете на дистанцию и близость в паре — держите это в уме при следующем разговоре с партнёром.",
      tag: "О вас",
      done: false,
    });
  }

  if (profile.partner_attachment_style && profile.partner_attachment_style !== "unsure") {
    items.push({
      id: id++,
      title: `У партнёра предположительно ${ATTACHMENT_LABELS[profile.partner_attachment_style] || profile.partner_attachment_style} стиль привязанности`,
      detail: "Сравните со своим стилем — часто именно разница в стилях привязанности объясняет повторяющиеся недопонимания.",
      tag: "О партнёре",
      done: false,
    });
  }

  if (profile.conflict_style) {
    items.push({
      id: id++,
      title: `В конфликте вам свойственно ${CONFLICT_LABELS[profile.conflict_style] || profile.conflict_style}`,
      detail: profile.partner_conflict_style
        ? `У партнёра противоположная/схожая тенденция: ${CONFLICT_LABELS[profile.partner_conflict_style] || profile.partner_conflict_style}. Обсудите это напрямую, не дожидаясь следующего спора.`
        : "Обсудите с партнёром, как каждый из вас предпочитает решать разногласия.",
      tag: "Коммуникация",
      done: false,
    });
  }

  if (profile.values && profile.values.length) {
    const labels = profile.values.map(v => VALUE_LABELS[v] || v).join(", ");
    items.push({
      id: id++,
      title: "Ваши ключевые ценности в отношениях",
      detail: `Вы отметили: ${labels}. Проверьте, насколько партнёр в курсе, что это важно для вас.`,
      tag: "Ценности",
      done: false,
    });
  }

  if (profile.triggers) {
    items.push({
      id: id++,
      title: "Отметьте свои триггеры партнёру, если ещё не делали этого",
      detail: profile.triggers,
      tag: "Опыт",
      done: false,
    });
  }

  if (profile.goals && profile.goals.length) {
    const labels = profile.goals.map(g => GOAL_LABELS[g] || g).join(", ");
    items.push({
      id: id++,
      title: "Ваш текущий приоритет",
      detail: `Вы отметили: ${labels}. Все следующие шаги стоит сверять с этим приоритетом.`,
      tag: "Цель",
      done: false,
    });
  }

  if (items.length === 0) {
    items.push({
      id: id++,
      title: "Заполните анкету подробнее",
      detail: "Чем больше деталей о себе и партнёре, тем точнее будет чек-лист.",
      tag: "Анкета",
      done: false,
    });
  }

  return items;
}

export async function generateChecklistPlaceholder(client, userId, profile, options = {}) {
  const items = buildPlaceholderItems(profile);

  const payload = {
    user_id: userId,
    items,
    generation_status: "placeholder",
    source_profile_updated_at: profile.updated_at || new Date().toISOString(),
    raw_prompt_input: profile,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("checklists")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadChecklist(client, userId) {
  try {
    const { data, error } = await client
      .from("checklists")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("loadChecklist error:", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("loadChecklist exception:", err);
    return null;
  }
}

export async function toggleChecklistItem(client, userId, itemIndex, doneValue) {
  const { data: current, error: readError } = await client
    .from("checklists")
    .select("items")
    .eq("user_id", userId)
    .single();

  if (readError) throw readError;

  const items = current.items || [];
  if (!items[itemIndex]) throw new Error("Пункт чек-листа не найден");
  items[itemIndex].done = doneValue;

  const { data, error } = await client
    .from("checklists")
    .update({ items, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveChecklist(client, userId, items, options = {}) {
  const payload = {
    user_id: userId,
    items,
    generation_status: options.generationStatus || "ai_generated",
    source_profile_updated_at: options.sourceProfileUpdatedAt || new Date().toISOString(),
    raw_prompt_input: options.rawPromptInput || null,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("checklists")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}
