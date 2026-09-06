// ============================================================
// НОВЫЙ ФАЙЛ: assets/discussion-and-dates.js
// Модуль "Темы для обсуждения" + "Генератор свиданий".
// Использует существующий Supabase client и таблицу important_dates
// для сохранения идей свиданий. Для карточек обсуждения нужна
// НОВАЯ таблица discussion_cards (см. discussion_cards_setup.sql).
// ============================================================

/* ============================================================
ТЕМЫ ДЛЯ ОБСУЖДЕНИЯ
============================================================ */

// Создаёт карточки для каждого несовпавшего ответа, если их ещё нет.
export async function syncDiscussionCards(client, coupleLinkId, testKey, mismatches) {
  if (!mismatches || !mismatches.length) return [];

  const { data: existing, error: readError } = await client
    .from("discussion_cards")
    .select("question_id")
    .eq("couple_link_id", coupleLinkId)
    .eq("test_key", testKey);
  if (readError) { console.error("syncDiscussionCards read error:", readError); return []; }

  const existingIds = new Set((existing || []).map(r => r.question_id));
  const toInsert = mismatches
    .filter(qId => !existingIds.has(qId))
    .map(qId => ({
      couple_link_id: coupleLinkId,
      test_key: testKey,
      question_id: qId,
      status: "new",
    }));

  if (!toInsert.length) return [];

  const { data, error } = await client.from("discussion_cards").insert(toInsert).select();
  if (error) { console.error("syncDiscussionCards insert error:", error); return []; }
  return data || [];
}

export async function loadDiscussionCards(client, coupleLinkId) {
  try {
    const { data, error } = await client
      .from("discussion_cards")
      .select("*")
      .eq("couple_link_id", coupleLinkId)
      .neq("status", "hidden")
      .order("created_at", { ascending: false });
    if (error) { console.error("loadDiscussionCards error:", error); return []; }
    return data || [];
  } catch (err) { console.error("loadDiscussionCards exception:", err); return []; }
}

export async function markDiscussionCard(client, cardId, status) {
  const payload = { status };
  if (status === "discussed") payload.discussed_at = new Date().toISOString();
  const { data, error } = await client
    .from("discussion_cards")
    .update(payload)
    .eq("id", cardId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ============================================================
ГЕНЕРАТОР СВИДАНИЙ
============================================================
Полностью детерминированный, без LLM и без сети — пул идей хранится
прямо в этом файле. Персонализация строится на анкете (couple_profiles)
и результатах индивидуальных/парных тестов, переданных снаружи.
============================================================ */

export const DATE_IDEAS = [
  { id: "d1", budget: "free", format: "home", duration: "evening", text: "Приготовьте ужин вместе вслепую — один выбирает рецепт, другой не знает, что готовите, пока не начнёте.", tags: ["acts", "humor"] },
  { id: "d2", budget: "free", format: "home", duration: "evening", text: "Составьте плейлист «наша история» — по одной песне на каждый важный момент отношений, слушайте и рассказывайте, почему выбрали именно её.", tags: ["words", "time"] },
  { id: "d3", budget: "free", format: "city", duration: "evening", text: "Прогуляйтесь без телефонов по незнакомому району города и найдите место, где ни разу не были.", tags: ["time", "growth"] },
  { id: "d4", budget: "free", format: "home", duration: "day", text: "Устройте день без экранов: только разговоры, игры и совместные дела по дому.", tags: ["time", "communication"] },
  { id: "d5", budget: "budget", format: "city", duration: "evening", text: "Сходите на местную выставку или маленькое культурное событие, о котором раньше не думали.", tags: ["growth"] },
  { id: "d6", budget: "budget", format: "active", duration: "day", text: "Возьмите напрокат велосипеды и проедьте новый маршрут, которого раньше не видели.", tags: ["growth", "acts"] },
  { id: "d7", budget: "free", format: "home", duration: "evening", text: "Напишите друг другу по 10 вещей, за которые благодарны — прочитайте вслух друг другу.", tags: ["words", "appreciation"] },
  { id: "d8", budget: "budget", format: "city", duration: "evening", text: "Сходите в кафе, которое ни разу не пробовали, и закажите то, что обычно не заказываете.", tags: ["time"] },
  { id: "d9", budget: "premium", format: "city", duration: "evening", text: "Забронируйте столик в ресторане высокой кухни без специального повода — просто чтобы отметить друг друга.", tags: ["acts", "words"] },
  { id: "d10", budget: "free", format: "active", duration: "day", text: "Устройте пеший поход или долгую прогулку на природе с остановкой на разговор без телефонов.", tags: ["time", "communication"] },
  { id: "d11", budget: "budget", format: "home", duration: "evening", text: "Сыграйте в настольную игру, в которую никогда не играли, и договоритесь, что победитель выбирает следующее свидание.", tags: ["humor"] },
  { id: "d12", budget: "premium", format: "active", duration: "day", text: "Попробуйте вдвоём новую активность — скалодром, танцы, кулинарный мастер-класс — что-то, где оба новички.", tags: ["growth", "humor"] },
];

const BUDGET_LABELS = { free: "Бесплатно", budget: "До 30$", premium: "Люкс" };
const FORMAT_LABELS = { home: "Дома", city: "В городе", active: "Активно" };
const DURATION_LABELS = { evening: "Вечер", day: "Выходной день" };

export function filterDateIdeas({ budget, format, duration }) {
  return DATE_IDEAS.filter(idea =>
    (!budget || idea.budget === budget) &&
    (!format || idea.format === format) &&
    (!duration || idea.duration === duration)
  );
}

// Строит объяснение "почему это вам подходит" на основе анкеты пары.
// profile — объект из loadCoupleProfile(client, userId) в auth.js.
export function explainDateIdea(idea, profile) {
  if (!profile) return "Эта идея подходит для разнообразия — попробуйте и посмотрите, понравится ли.";

  const values = profile.values || [];
  const loveLanguage = profile.love_language;

  if (loveLanguage && idea.tags.includes(loveLanguage)) {
    const LOVE_LABELS = { words: "слова поддержки", time: "время вместе", gifts: "подарки", acts: "заботу через действия", touch: "физический контакт" };
    return "Судя по анкете, для вас особенно важны " + (LOVE_LABELS[loveLanguage] || loveLanguage) + " — это свидание построено именно на этом.";
  }
  const matchedValue = values.find(v => idea.tags.includes(v));
  if (matchedValue) {
    const VALUE_LABELS = { humor: "юмор и лёгкость", growth: "совместный рост", communication: "открытое общение", stability: "стабильность" };
    return "Вы отмечали, что цените " + (VALUE_LABELS[matchedValue] || matchedValue) + " — эта идея как раз про это.";
  }
  return "Небольшая идея для разнообразия — иногда стоит пробовать новое, даже если это не «прямо ваше».";
}

export function pickRandomDateIdea(filtered) {
  if (!filtered.length) return null;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export { BUDGET_LABELS, FORMAT_LABELS, DURATION_LABELS };

// Сохраняет выбранную идею свидания в уже существующую таблицу important_dates.
// Дата по умолчанию — ближайшая суббота, пользователь может изменить на странице journal.html.
export async function saveDateIdeaToImportantDates(client, userId, idea) {
  const today = new Date();
  const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
  const target = new Date(today);
  target.setDate(today.getDate() + daysUntilSaturday);

  const payload = {
    user_id: userId,
    title: "Свидание: " + idea.text.slice(0, 60) + (idea.text.length > 60 ? "…" : ""),
    date_value: target.toISOString().slice(0, 10),
    is_recurring_yearly: false,
  };
  const { data, error } = await client.from("important_dates").insert(payload).select().single();
  if (error) throw error;
  return data;
}
