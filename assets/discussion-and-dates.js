// ============================================================
// assets/discussion-and-dates.js (v2)
// Модуль "Темы для обсуждения" (3 статуса + архив) и "Генератор
// свиданий" (реакции, история, расширенный пул идей).
// ============================================================

/* ============================================================
ТЕМЫ ДЛЯ ОБСУЖДЕНИЯ
============================================================ */

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

// filter: "active" (new+snoozed), "discussed", "archived"
export async function loadDiscussionCards(client, coupleLinkId, filter = "active") {
  try {
    let query = client.from("discussion_cards").select("*").eq("couple_link_id", coupleLinkId);
    if (filter === "active") query = query.in("status", ["new", "snoozed"]);
    else if (filter === "discussed") query = query.eq("status", "discussed");
    else if (filter === "archived") query = query.eq("status", "archived");
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) { console.error("loadDiscussionCards error:", error); return []; }
    return data || [];
  } catch (err) { console.error("loadDiscussionCards exception:", err); return []; }
}

export async function countDiscussionCardsByStatus(client, coupleLinkId) {
  const counts = { active: 0, discussed: 0, archived: 0 };
  try {
    const { data, error } = await client.from("discussion_cards").select("status").eq("couple_link_id", coupleLinkId);
    if (error) { console.error("countDiscussionCardsByStatus error:", error); return counts; }
    (data || []).forEach(row => {
      if (row.status === "new" || row.status === "snoozed") counts.active++;
      else if (row.status === "discussed") counts.discussed++;
      else if (row.status === "archived") counts.archived++;
    });
    return counts;
  } catch (err) { console.error("countDiscussionCardsByStatus exception:", err); return counts; }
}

// action: "discussed" | "snoozed" | "archived" | "restore" (restore -> "new")
export async function markDiscussionCard(client, cardId, action) {
  const payload = {};
  if (action === "discussed") { payload.status = "discussed"; payload.discussed_at = new Date().toISOString(); }
  else if (action === "snoozed") {
    payload.status = "snoozed";
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + 7);
    payload.snoozed_until = snoozeUntil.toISOString();
  }
  else if (action === "archived") { payload.status = "archived"; }
  else if (action === "restore") { payload.status = "new"; payload.discussed_at = null; payload.snoozed_until = null; }
  else throw new Error("Неизвестное действие: " + action);

  const { data, error } = await client.from("discussion_cards").update(payload).eq("id", cardId).select().single();
  if (error) throw error;
  return data;
}

/* ============================================================
ГЕНЕРАТОР СВИДАНИЙ
============================================================
Детерминированный, без LLM и без сети — пул идей хранится прямо
в этом файле. Персонализация строится на анкете пары и истории
реакций (лайк/дизлайк), которая хранится в таблице date_history.
============================================================ */

export const DATE_IDEAS = [
  { id: "d1", budget: "free", format: "home", duration: "evening", surprise: false, text: "Приготовьте ужин вместе вслепую — один выбирает рецепт, другой не знает, что готовите, пока не начнёте.", tags: ["acts", "humor"] },
  { id: "d2", budget: "free", format: "home", duration: "evening", surprise: false, text: "Составьте плейлист «наша история» — по одной песне на каждый важный момент отношений, слушайте и рассказывайте, почему выбрали именно её.", tags: ["words", "time"] },
  { id: "d3", budget: "free", format: "city", duration: "evening", surprise: false, text: "Прогуляйтесь без телефонов по незнакомому району города и найдите место, где ни разу не были.", tags: ["time", "growth"] },
  { id: "d4", budget: "free", format: "home", duration: "day", surprise: false, text: "Устройте день без экранов: только разговоры, игры и совместные дела по дому.", tags: ["time", "communication"] },
  { id: "d5", budget: "budget", format: "city", duration: "evening", surprise: false, text: "Сходите на местную выставку или маленькое культурное событие, о котором раньше не думали.", tags: ["growth"] },
  { id: "d6", budget: "budget", format: "active", duration: "day", surprise: false, text: "Возьмите напрокат велосипеды и проедьте новый маршрут, которого раньше не видели.", tags: ["growth", "acts"] },
  { id: "d7", budget: "free", format: "home", duration: "evening", surprise: false, text: "Напишите друг другу по 10 вещей, за которые благодарны — прочитайте вслух друг другу.", tags: ["words", "appreciation"] },
  { id: "d8", budget: "budget", format: "city", duration: "evening", surprise: false, text: "Сходите в кафе, которое ни разу не пробовали, и закажите то, что обычно не заказываете.", tags: ["time"] },
  { id: "d9", budget: "premium", format: "city", duration: "evening", surprise: false, text: "Забронируйте столик в ресторане высокой кухни без специального повода — просто чтобы отметить друг друга.", tags: ["acts", "words"] },
  { id: "d10", budget: "free", format: "active", duration: "day", surprise: false, text: "Устройте пеший поход или долгую прогулку на природе с остановкой на разговор без телефонов.", tags: ["time", "communication"] },
  { id: "d11", budget: "budget", format: "home", duration: "evening", surprise: false, text: "Сыграйте в настольную игру, в которую никогда не играли, и договоритесь, что победитель выбирает следующее свидание.", tags: ["humor"] },
  { id: "d12", budget: "premium", format: "active", duration: "day", surprise: false, text: "Попробуйте вдвоём новую активность — скалодром, танцы, кулинарный мастер-класс — что-то, где оба новички.", tags: ["growth", "humor"] },
  { id: "d13", budget: "free", format: "home", duration: "evening", surprise: true, text: "Один партнёр организует «сюрприз-вечер»: выбирает фильм, еду и атмосферу, не раскрывая деталей заранее.", tags: ["acts", "romance"] },
  { id: "d14", budget: "budget", format: "city", duration: "evening", surprise: true, text: "Один партнёр выбирает место, куда поедете, и не говорит куда — второй просто садится в машину/такси.", tags: ["growth", "romance"] },
  { id: "d15", budget: "free", format: "home", duration: "evening", surprise: false, text: "Пересмотрите старые фото и видео вдвоём — вспомните, каким был ваш первый год вместе.", tags: ["words", "time"] },
  { id: "d16", budget: "budget", format: "home", duration: "day", surprise: false, text: "Устройте фотосессию друг для друга дома на телефон — без профессиональной техники, просто ради удовольствия.", tags: ["humor", "acts"] },
  { id: "d17", budget: "free", format: "active", duration: "evening", surprise: false, text: "Потанцуйте дома под любимые песни — так, будто вас никто не видит.", tags: ["touch", "humor"] },
  { id: "d18", budget: "premium", format: "active", duration: "day", surprise: true, text: "Забронируйте что-то совершенно новое для вас обоих: полёт на воздушном шаре, дегустация вин, спа на двоих.", tags: ["romance", "growth"] },
  { id: "d19", budget: "free", format: "home", duration: "evening", surprise: false, text: "Составьте список из 20 вещей, которые хотите попробовать вместе в следующем году.", tags: ["growth", "communication"] },
  { id: "d20", budget: "budget", format: "city", duration: "day", surprise: false, text: "Съездите в соседний город или район, где ни разу не были, без чёткого плана — просто посмотреть, что там.", tags: ["growth", "time"] },
  { id: "d21", budget: "free", format: "home", duration: "evening", surprise: false, text: "Сделайте друг другу массаж по очереди — 15 минут каждому, без телефонов рядом.", tags: ["touch"] },
  { id: "d22", budget: "budget", format: "home", duration: "evening", surprise: true, text: "Один партнёр готовит «меню-сюрприз» из 3 маленьких блюд, а второй пробует их с закрытыми глазами и угадывает.", tags: ["acts", "humor"] },
];

const BUDGET_LABELS = { free: "Бесплатно", budget: "До 30$", premium: "Люкс" };
const FORMAT_LABELS = { home: "Дома", city: "В городе", active: "Активно" };
const DURATION_LABELS = { evening: "Вечер", day: "Выходной день" };

export function filterDateIdeas({ budget, format, duration, surpriseOnly }, excludeIds = []) {
  return DATE_IDEAS.filter(idea =>
    (!budget || idea.budget === budget) &&
    (!format || idea.format === format) &&
    (!duration || idea.duration === duration) &&
    (!surpriseOnly || idea.surprise === true) &&
    !excludeIds.includes(idea.id)
  );
}

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
  if (idea.surprise) return "Это формат с элементом сюрприза — иногда полезно удивить друг друга, а не только планировать вместе.";
  return "Небольшая идея для разнообразия — иногда стоит пробовать новое, даже если это не «прямо ваше».";
}

export function pickRandomDateIdea(filtered) {
  if (!filtered.length) return null;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export { BUDGET_LABELS, FORMAT_LABELS, DURATION_LABELS };

/* ---------- История и реакции ---------- */

export async function loadDateHistory(client, coupleLinkId) {
  try {
    const { data, error } = await client.from("date_history")
      .select("*").eq("couple_link_id", coupleLinkId)
      .order("created_at", { ascending: false });
    if (error) { console.error("loadDateHistory error:", error); return []; }
    return data || [];
  } catch (err) { console.error("loadDateHistory exception:", err); return []; }
}

export async function saveIdeaToHistory(client, coupleLinkId, idea) {
  const { data, error } = await client.from("date_history")
    .insert({ couple_link_id: coupleLinkId, idea_id: idea.id, idea_text: idea.text })
    .select().single();
  if (error) throw error;
  return data;
}

export async function reactToDateHistoryEntry(client, entryId, reaction) {
  const { data, error } = await client.from("date_history")
    .update({ reaction }).eq("id", entryId).select().single();
  if (error) throw error;
  return data;
}

export async function markDateHappened(client, entryId, happened) {
  const { data, error } = await client.from("date_history")
    .update({ happened }).eq("id", entryId).select().single();
  if (error) throw error;
  return data;
}

export function getDislikedIdeaIds(history) {
  return history.filter(h => h.reaction === "dislike").map(h => h.idea_id);
}

export function getLikedTags(history) {
  const likedIds = new Set(history.filter(h => h.reaction === "like").map(h => h.idea_id));
  const tags = [];
  DATE_IDEAS.forEach(idea => { if (likedIds.has(idea.id)) tags.push(...idea.tags); });
  return tags;
}

// Взвешенный выбор: идеи с тегами из "любимых" встречаются в пуле для выбора чаще.
export function pickWeightedDateIdea(filtered, likedTags) {
  if (!filtered.length) return null;
  if (!likedTags.length) return pickRandomDateIdea(filtered);

  const weighted = [];
  filtered.forEach(idea => {
    const matchCount = idea.tags.filter(t => likedTags.includes(t)).length;
    const weight = 1 + matchCount * 2;
    for (let i = 0; i < weight; i++) weighted.push(idea);
  });
  return weighted[Math.floor(Math.random() * weighted.length)];
}

// Сохраняет выбранную идею свидания в уже существующую таблицу important_dates.
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
