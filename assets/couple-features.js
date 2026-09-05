// RelationSync.ai — couple-features.js
// Модуль режима "Пара" (Couple Mode): привязка аккаунтов, статус "онлайн",
// совместные тесты и общий результат пары.
//
// Использует Supabase client, переданный явным аргументом в каждую функцию —
// НЕ создаёт свой собственный клиент и не импортирует getClient() напрямую,
// чтобы исключить рассинхронизацию с уже инициализированным client на странице.

const VALID_TEST_KEYS = ["couple_sync", "couple_values"];

/* ============================================================
   ПРИВЯЗКА АККАУНТА ПАРТНЁРА
   ============================================================ */

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов (0/O, 1/I)
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

  // Сначала читаем приглашение, чтобы дать точную и понятную ошибку —
  // включая явную защиту от привязки аккаунта к самому себе. Эта проверка
  // выполняется здесь, на уровне приложения, а не только в RLS Supabase,
  // потому что RLS может по-разному вести себя в зависимости от настроек
  // политики update, и полагаться только на базу данных недостаточно надёжно.
  const { data: invite, error: fetchError } = await client
    .from("couple_links")
    .select("*")
    .eq("invite_code", code)
    .maybeSingle();

  if (fetchError) {
    console.error("acceptCoupleInvite fetch error:", fetchError);
    throw new Error("Не удалось проверить код. Попробуйте снова.");
  }

  if (!invite) {
    throw new Error("Код не найден. Проверьте, что ввели его без ошибок.");
  }

  if (invite.user_a_id === userId) {
    throw new Error("Это ваш собственный код — попросите партнёра ввести его в своём аккаунте.");
  }

  if (invite.status !== "pending") {
    throw new Error("Этот код уже был использован или отменён.");
  }

  if (invite.user_b_id) {
    throw new Error("Этот код уже использован другим аккаунтом.");
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new Error("Код просрочен. Попросите партнёра создать новый.");
  }

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
   СОВМЕСТНЫЕ ТЕСТЫ ПАРЫ (бесплатные)
   ============================================================ */

export const COUPLE_TEST_META = {
  couple_sync: {
    title: "Насколько вы синхронны",
    shortTitle: "Синхронность",
    description: "10 вопросов о повседневных привычках и ожиданиях — сравните ответы сразу после прохождения обоими.",
  },
  couple_values: {
    title: "Совпадение ценностей",
    shortTitle: "Ценности пары",
    description: "8 пар утверждений о приоритетах в отношениях — узнайте, где вы на одной волне, а где стоит поговорить.",
  },
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

export function computeCoupleMatchScore(answersA, answersB) {
  const keys = Object.keys(answersA || {});
  if (!keys.length) return { score: null, matched: 0, total: 0, mismatches: [] };

  let matched = 0;
  const mismatches = [];
  keys.forEach((k) => {
    if (answersA[k] === answersB[k]) {
      matched += 1;
    } else {
      mismatches.push(k);
    }
  });

  const score = Math.round((matched / keys.length) * 100);
  return { score, matched, total: keys.length, mismatches };
}

export function scoreLabel(score) {
  if (score === null) return "Пройдите тест вдвоём, чтобы увидеть оценку";
  if (score >= 85) return "Отличная синхронность";
  if (score >= 65) return "Хорошее совпадение, есть пара нюансов";
  if (score >= 40) return "Взгляды расходятся примерно поровну";
  return "Много различий — хороший повод для разговора";
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
