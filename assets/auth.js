// RelationSync.ai — общая логика авторизации и данных для login.html, cabinet.html,
// questionnaire.html и checklist.html.
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
   АНКЕТА О ПАРЕ (couple_profiles)
   ============================================================ */

/**
 * Сохраняет (создаёт или обновляет) расширенную анкету пары для текущего пользователя.
 * Таблица: public.couple_profiles, PK/unique — user_id.
 * Требует настроенных RLS-политик (см. supabase-schema.sql).
 */
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

/**
 * Загружает анкету пары текущего пользователя, если она уже существует.
 * Возвращает null при отсутствии анкеты или ошибке доступа (логируется в консоль).
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
 * Никогда не бросает исключение.
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

/* ============================================================
   ЧЕК-ЛИСТ (checklists)
   ============================================================

   Структура таблицы (см. supabase-schema.sql):
     user_id                     uuid, PK
     items                       jsonb[]  -- [{ id, title, detail, tag, done }]
     generation_status           text     -- 'placeholder' | 'ai_generated'
     source_profile_updated_at   timestamptz  -- снапшот updated_at анкеты на момент генерации
     raw_prompt_input            jsonb    -- то, что уходило "на вход" генерации (для отладки/аудита)
     generated_at                timestamptz
     updated_at                  timestamptz

   ВАЖНО ДЛЯ LLM-ИНТЕГРАЦИИ:
   Функция generateChecklistPlaceholder() ниже — это ВРЕМЕННАЯ заглушка без ИИ.
   Она напрямую раскладывает поля анкеты в читаемые пункты по шаблонам.
   Когда будет готова реальная генерация через LLM, эту функцию нужно
   заменить вызовом серверной функции (Supabase Edge Function или другой backend),
   которая:
     1) принимает profile (те же поля, что видно ниже в PLACEHOLDER_TEMPLATES),
     2) отправляет их в LLM с промптом,
     3) возвращает items в ТОМ ЖЕ формате: [{ id, title, detail, tag, done: false }],
     4) сохраняет результат через saveChecklist() с generation_status: 'ai_generated'.
   UI (checklist.html) менять не нужно — он рассчитан на этот формат items уже сейчас.
   Подробности контракта — см. файл LLM-SPEC.md.
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

/**
 * ВРЕМЕННАЯ ЗАГЛУШКА (без ИИ). Собирает чек-лист напрямую из полей анкеты
 * по фиксированным шаблонам. См. комментарий выше блока — заменить на вызов
 * LLM-генерации, когда она будет готова (контракт формата items не меняется).
 *
 * @param {object} options.force - если true, пересобирает даже если чек-лист уже есть и не устарел
 */
export async function generateChecklistPlaceholder(client, userId, profile, options = {}) {
  const items = buildPlaceholderItems(profile);

  const payload = {
    user_id: userId,
    items,
    generation_status: "placeholder",
    source_profile_updated_at: profile.updated_at || new Date().toISOString(),
    raw_prompt_input: profile, // снапшот входных данных — полезно для будущей отладки промптов
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

/**
 * Загружает текущий чек-лист пользователя. Возвращает null, если ещё не сгенерирован.
 */
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

/**
 * Отмечает/снимает отметку выполнения конкретного пункта чек-листа по индексу.
 * Читает текущий items, меняет нужный элемент, сохраняет обратно.
 */
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

/**
 * Универсальная точка сохранения чек-листа — предназначена для будущей
 * LLM-генерации. Специалист по интеграции LLM вызывает эту функцию после
 * получения ответа от модели, передавая items в контрактном формате.
 * generationStatus должен быть 'ai_generated' для результатов реальной генерации.
 */
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
