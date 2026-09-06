// RelationSync.ai — couple-features.js
// Модуль режима "Пара" (Couple Mode): привязка аккаунтов, статус "онлайн",
// совместные тесты и общий результат пары.
//
// ВАЖНО: этот файл должен ПОЛНОСТЬЮ ЗАМЕНИТЬ assets/couple-features.js.
// Если после замены третий тест (couple_support) всё ещё не появляется —
// проверьте, что couple-test.html действительно импортирует именно этот
// файл (assets/couple-features.js), а не старую копию по другому пути,
// и что в консоли браузера (F12) нет ошибки импорта.

const VALID_TEST_KEYS = ["couple_sync", "couple_values", "couple_support"];

/* ============================================================
ПРИВЯЗКА АККАУНТА ПАРТНЁРА
============================================================ */

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RS-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function assertClient(client) {
  if (!client || typeof client.from !== "function") {
    throw new Error("Supabase-клиент не инициализирован. Обновите страницу и попробуйте снова.");
  }
}

export async function createCoupleInvite(client, userId) {
  assertClient(client);
  await client.from("couple_links").update({ status: "revoked" })
    .eq("user_a_id", userId).eq("status", "pending");

  const code = generateInviteCode();
  const { data, error } = await client.from("couple_links")
    .insert({ user_a_id: userId, invite_code: code })
    .select().single();
  if (error) throw error;
  return data;
}

export async function acceptCoupleInvite(client, userId, rawCode) {
  assertClient(client);
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) throw new Error("Введите код приглашения");

  const { data: invite, error: fetchError } = await client
    .from("couple_links")
    .select("*")
    .eq("invite_code", code)
    .maybeSingle();

  if (fetchError) {
    console.error("acceptCoupleInvite fetch error:", fetchError);
    throw new Error("Не удалось проверить код. Попробуйте снова.");
  }

  if (!invite) throw new Error("Код не найден. Проверьте, что ввели его без ошибок.");
  if (invite.user_a_id === userId) throw new Error("Это ваш собственный код — попросите партнёра ввести его в своём аккаунте.");
  if (invite.status !== "pending") throw new Error("Этот код уже был использован или отменён.");
  if (invite.user_b_id) throw new Error("Этот код уже использован другим аккаунтом.");
  if (new Date(invite.expires_at).getTime() < Date.now()) throw new Error("Код просрочен. Попросите партнёра создать новый.");

  const { data, error } = await client
    .from("couple_links")
    .update({ user_b_id: userId, status: "active", linked_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("status", "pending")
    .is("user_b_id", null)
    .select()
    .single();

  if (error || !data) {
    console.error("acceptCoupleInvite update error:", error);
    throw new Error("Не удалось связать аккаунты. Возможно, код только что использовали. Попросите партнёра создать новый.");
  }

  return data;
}

export async function getCoupleLink(client, userId) {
  assertClient(client);
  try {
    const { data, error } = await client.from("couple_links")
      .select("*")
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .eq("status", "active")
      .maybeSingle();
    if (error) { console.error("getCoupleLink error:", error); return null; }
    return data;
  } catch (err) {
    console.error("getCoupleLink exception:", err);
    return null;
  }
}

export async function getPendingInvite(client, userId) {
  assertClient(client);
  try {
    const { data, error } = await client.from("couple_links")
      .select("*")
      .eq("user_a_id", userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (error) { console.error("getPendingInvite error:", error); return null; }
    return data;
  } catch (err) {
    console.error("getPendingInvite exception:", err);
    return null;
  }
}

export function getPartnerId(coupleLink, myUserId) {
  if (!coupleLink) return null;
  return coupleLink.user_a_id === myUserId ? coupleLink.user_b_id : coupleLink.user_a_id;
}

export async function unlinkCouple(client, coupleLinkId) {
  assertClient(client);
  const { error } = await client.from("couple_links")
    .update({ status: "revoked" })
    .eq("id", coupleLinkId);
  if (error) throw error;
  return true;
}

/* ============================================================
СТАТУС "ПОСЛЕДНИЙ ОНЛАЙН"
============================================================ */

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
let heartbeatTimer = null;

export async function pingLastSeen(client, userId) {
  if (!client || typeof client.from !== "function") return;
  try {
    await client.from("couple_profiles")
      .upsert({ user_id: userId, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
  } catch (err) {
    console.error("pingLastSeen exception:", err);
  }
}

export function startHeartbeat(client, userId) {
  if (heartbeatTimer || !client || !userId) return;
  pingLastSeen(client, userId);
  heartbeatTimer = setInterval(() => pingLastSeen(client, userId), HEARTBEAT_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pingLastSeen(client, userId);
  });
}

export function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

export async function getPartnerLastSeen(client, partnerUserId) {
  assertClient(client);
  try {
    const { data, error } = await client.from("couple_profiles")
      .select("last_seen_at, user_name")
      .eq("user_id", partnerUserId)
      .maybeSingle();
    if (error) { console.error("getPartnerLastSeen error:", error); return null; }
    return data;
  } catch (err) {
    console.error("getPartnerLastSeen exception:", err);
    return null;
  }
}

export function formatOnlineStatus(lastSeenAt) {
  if (!lastSeenAt) return { online: false, label: "нет данных" };
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 3) return { online: true, label: "в сети" };
  if (diffMin < 60) return { online: false, label: `был(а) ${diffMin} мин назад` };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return { online: false, label: `был(а) ${diffHr} ч назад` };
  const diffDays = Math.floor(diffHr / 24);
  return { online: false, label: `был(а) ${diffDays} дн назад` };
}

/* ============================================================
СОВМЕСТНЫЕ ТЕСТЫ ПАРЫ — расширенные метаданные
============================================================ */

export const COUPLE_TEST_META = {
  couple_sync: {
    title: "Насколько вы синхронны",
    shortTitle: "Синхронность",
    description: "10 вопросов о повседневных привычках и ожиданиях в паре.",
    about: "Этот тест не про правильные и неправильные ответы — он показывает, насколько ваши бытовые привычки, темп жизни и способ реагировать на ситуации совпадают с привычками партнёра. Синхронность в быту снижает количество мелких недопониманий, которые со временем накапливаются в конфликт.",
    why: "Пары часто спорят не из-за глобальных ценностей, а из-за разницы в темпе и привычках — кто-то любит планировать, кто-то действует по настроению. Понимание этой разницы заранее помогает договариваться, а не удивляться друг другу в моменте.",
    duration: "3–4 минуты",
    questionsCount: 10,
  },
  couple_values: {
    title: "Совпадение ценностей",
    shortTitle: "Ценности пары",
    description: "8 пар утверждений о приоритетах в отношениях.",
    about: "Тест показывает, насколько совпадают ваши базовые приоритеты в отношениях — от честности и близости до общих целей. Ценности — это фундамент, на котором строится доверие, а различия в них часто маскируются под «мелкие» бытовые конфликты.",
    why: "Совпадение ценностей не означает одинаковость взглядов на всё — но помогает понять, где у вас общий фундамент, а где потребуется больше диалога, чтобы двигаться в одну сторону.",
    duration: "2–3 минуты",
    questionsCount: 8,
  },
  couple_support: {
    title: "Как мы поддерживаем друг друга",
    shortTitle: "Поддержка",
    description: "8 вопросов о том, как каждый из вас проявляет и хочет получать заботу в трудный момент.",
    about: "Тест показывает разницу между «решить проблему» и «просто быть рядом» — двумя базовыми способами поддержки. Ни один из них не правильный: важно понимать, чего ждёт именно ваш партнёр.",
    why: "Одна из частых причин непонимания в паре — искренняя попытка помочь не тем способом, который нужен партнёру в моменте. Этот тест помогает заметить разницу заранее, а не в момент, когда кому-то плохо.",
    duration: "2–3 минуты",
    questionsCount: 8,
  },
};

// Полные банки вопросов с текстом и вариантами — нужны и странице теста,
// и странице отчёта (чтобы показывать реальный текст вопроса, а не только id).
export const COUPLE_QUESTION_BANKS = {
  couple_sync: [
    { id: "q1", text: "Как вы предпочитаете проводить свободный вечер вдвоём?", a: "Дома, в тишине и уюте", b: "Куда-то выйти, сменить обстановку" },
    { id: "q2", text: "Как быстро вы готовы обсуждать сложную тему?", a: "Сразу, пока свежо в памяти", b: "Нужно время подумать перед разговором" },
    { id: "q3", text: "Что для вас важнее в конфликте?", a: "Найти решение как можно быстрее", b: "Сначала убедиться, что чувства услышаны" },
    { id: "q4", text: "Как вы относитесь к совместным финансам?", a: "Всё общее и прозрачное", b: "У каждого своя часть и свобода трат" },
    { id: "q5", text: "Что вам ближе в планах на выходные?", a: "Заранее спланировать", b: "Решить по настроению в моменте" },
    { id: "q6", text: "Как вы выражаете заботу чаще всего?", a: "Словами и разговором", b: "Действиями и делами" },
    { id: "q7", text: "Как вы относитесь к личному пространству партнёра?", a: "Мне важно быть рядом почаще", b: "Мне комфортно, когда у каждого своё время" },
    { id: "q8", text: "Что вы делаете, если задели друг друга?", a: "Говорю об этом в тот же день", b: "Нужна пауза, прежде чем обсуждать" },
    { id: "q9", text: "Как вы относитесь к большим совместным целям?", a: "Люблю строить долгосрочные планы вместе", b: "Предпочитаю идти шаг за шагом, без далёких обещаний" },
    { id: "q10", text: "Что важнее в повседневном общении?", a: "Обсуждать бытовые детали дня", b: "Обсуждать мысли, идеи, чувства" },
  ],
  couple_values: [
    { id: "v1", text: "Что важнее в отношениях на этом этапе?", a: "Стабильность и предсказуемость", b: "Рост и новые совместные вызовы" },
    { id: "v2", text: "Что вам ближе в проявлении честности?", a: "Говорить всё, даже если это неприятно", b: "Выбирать момент и формулировки бережно" },
    { id: "v3", text: "Что важнее в поддержке партнёра?", a: "Дать практический совет", b: "Просто быть рядом и выслушать" },
    { id: "v4", text: "Как вы относитесь к разногласиям во взглядах на жизнь?", a: "Это нормально, если базовые ценности совпадают", b: "Хочу, чтобы взгляды совпадали как можно точнее" },
    { id: "v5", text: "Что вам важнее в близости?", a: "Эмоциональная близость важнее физической", b: "Обе важны в равной степени" },
    { id: "v6", text: "Как вы относитесь к юмору в отношениях?", a: "Юмор снимает напряжение почти всегда", b: "В серьёзные моменты юмор мешает" },
    { id: "v7", text: "Что важнее для доверия?", a: "Полная прозрачность в деталях", b: "Уверенность в намерениях, без детального контроля" },
    { id: "v8", text: "Как вы смотрите на общие цели?", a: "Важно, чтобы цели совпадали почти полностью", b: "Достаточно уважать цели друг друга, даже если они разные" },
  ],
  couple_support: [
    { id: "s1", text: "Когда партнёру плохо, что вы делаете в первую очередь?", a: "Пытаюсь сразу решить проблему", b: "Просто рядом, без советов" },
    { id: "s2", text: "Что вам самим важнее получить в трудный момент?", a: "Конкретный совет, что делать", b: "Чтобы меня просто выслушали" },
    { id: "s3", text: "Как вы реагируете на слёзы партнёра?", a: "Стараюсь быстрее переключить на позитив", b: "Даю время прожить эмоцию" },
    { id: "s4", text: "Что вам ближе после тяжёлого дня партнёра?", a: "Обсудить всё подробно", b: "Дать побыть в тишине, потом поговорить" },
    { id: "s5", text: "Как вы показываете, что заметили, что партнёру плохо?", a: "Прямо спрашиваю, что случилось", b: "Жду, пока сам(а) расскажет" },
    { id: "s6", text: "Что вы цените больше в поддержке партнёра?", a: "Практические действия (помочь, сделать)", b: "Слова и внимание" },
    { id: "s7", text: "Как вы относитесь к советам в сложной ситуации?", a: "Советы почти всегда полезны", b: "Часто советы раздражают, если их не просили" },
    { id: "s8", text: "Что помогает вам быстрее прийти в себя после стресса?", a: "Поговорить и разложить по полочкам", b: "Побыть в одиночестве, потом вернуться к разговору" },
  ],
};

export async function saveCoupleTestResult(client, coupleLinkId, userId, testKey, { answers = {}, scores = {} } = {}) {
  assertClient(client);
  if (!VALID_TEST_KEYS.includes(testKey)) throw new Error("Неизвестный совместный тест: " + testKey);
  const payload = {
    couple_link_id: coupleLinkId,
    user_id: userId,
    test_key: testKey,
    answers,
    scores,
    completed_at: new Date().toISOString(),
  };
  const { data, error } = await client.from("couple_test_results").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function loadCoupleTestResults(client, coupleLinkId, testKey) {
  assertClient(client);
  try {
    const { data, error } = await client.from("couple_test_results")
      .select("*")
      .eq("couple_link_id", coupleLinkId)
      .eq("test_key", testKey)
      .order("completed_at", { ascending: false });
    if (error) { console.error("loadCoupleTestResults error:", error); return []; }
    return data || [];
  } catch (err) {
    console.error("loadCoupleTestResults exception:", err);
    return [];
  }
}

// Загружает результаты СРАЗУ по всем совместным тестам — используется на
// странице couple.html, чтобы показать статус "прошли / не прошли" по каждому.
export async function loadAllCoupleTestStatus(client, coupleLinkId, userId, partnerId) {
  const statusByTest = {};
  for (const testKey of VALID_TEST_KEYS) {
    const results = await loadCoupleTestResults(client, coupleLinkId, testKey);
    const mine = results.find(r => r.user_id === userId) || null;
    const partner = results.find(r => r.user_id === partnerId) || null;
    statusByTest[testKey] = { mine, partner };
  }
  return statusByTest;
}

export function computeCoupleMatchScore(answersA, answersB) {
  const keys = Object.keys(answersA || {});
  if (!keys.length) return { score: null, matched: 0, total: 0, mismatches: [], matches: [] };

  let matched = 0;
  const mismatches = [];
  const matches = [];
  keys.forEach((k) => {
    if (answersA[k] === answersB[k]) {
      matched += 1;
      matches.push(k);
    } else {
      mismatches.push(k);
    }
  });

  const score = Math.round((matched / keys.length) * 100);
  return { score, matched, total: keys.length, mismatches, matches };
}

export function scoreLabel(score) {
  if (score === null) return "Пройдите тест вдвоём, чтобы увидеть оценку";
  if (score >= 85) return "Отличная синхронность";
  if (score >= 65) return "Хорошее совпадение, есть пара нюансов";
  if (score >= 40) return "Взгляды расходятся примерно поровну";
  return "Много различий — хороший повод для разговора";
}

export function scoreExplanation(score) {
  if (score === null) return "";
  if (score >= 85) return "Вы очень похоже смотрите на большинство бытовых и коммуникативных ситуаций. Это не значит, что у вас нет тем для разговора — но фундамент совпадения широкий, и разногласия скорее точечные.";
  if (score >= 65) return "У вас общий взгляд на большинство ситуаций, но есть конкретные зоны, где привычки и ожидания расходятся. Ниже отмечены именно эти вопросы — стоит обсудить их отдельно, не дожидаясь конфликта.";
  if (score >= 40) return "Примерно половина ваших ответов совпала, половина различается. Это нормально для пары с разными характерами — но такие различия стоит проговаривать явно, а не считать, что партнёр «должен понимать сам».";
  return "Заметная часть ваших ответов расходится. Это не значит, что отношения обречены — многие успешные пары сильно различаются по привычкам. Но именно эти различия стоит обсуждать открыто, иначе они будут проявляться как повторяющиеся мелкие конфликты.";
}

// Сравнение текущего результата с предыдущим прохождением (ретест).
export function compareWithPreviousResult(myHistory, partnerHistory) {
  if (myHistory.length < 2 || partnerHistory.length < 2) return null;
  const currentMatch = computeCoupleMatchScore(myHistory[0].answers, partnerHistory[0].answers);
  const previousMatch = computeCoupleMatchScore(myHistory[1].answers, partnerHistory[1].answers);
  if (currentMatch.score === null || previousMatch.score === null) return null;
  return {
    current: currentMatch.score,
    previous: previousMatch.score,
    delta: currentMatch.score - previousMatch.score,
    previousDate: myHistory[1].completed_at,
  };
}

/* ============================================================
ДОСТУП К ПЛАТНОМУ ПОЛНОМУ РЕЖИМУ ПАРЫ
============================================================ */

export async function hasCoupleFullAccess(client, userId) {
  assertClient(client);
  try {
    const { data, error } = await client.from("couple_profiles")
      .select("selected_plan").eq("user_id", userId).maybeSingle();
    if (error) { console.error("hasCoupleFullAccess error:", error); return false; }
    return (data && data.selected_plan) === "couple";
  } catch (err) {
    console.error("hasCoupleFullAccess exception:", err);
    return false;
  }
}
