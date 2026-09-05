// RelationSync.ai — couple-features.js
// Модуль режима "Пара" (Couple Mode): привязка аккаунтов, статус "онлайн",
// совместные тесты и общий результат пары.
//
// Подключается ДОПОЛНИТЕЛЬНО к auth.js на странице couple.html:
//   <script type="module" src="./auth.js"></script>
//   <script type="module" src="./couple-features.js"></script>
//
// Ничего не меняет в существующем auth.js — использует его экспорт getClient().

import { getClient, getSession } from "./auth.js";

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

export async function createCoupleInvite(client, userId) {
  // Отзываем предыдущие неиспользованные приглашения этого пользователя
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
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) throw new Error("Введите код приглашения");

  const { data, error } = await client.from("couple_links")
    .update({ user_b_id: userId, status: "active", linked_at: new Date().toISOString() })
    .eq("invite_code", code)
    .eq("status", "pending")
    .is("user_b_id", null)
    .gt("expires_at", new Date().toISOString())
    .select().single();

  if (error || !data) {
    throw new Error("Код неверен, уже использован или просрочен");
  }
  return data;
}

export async function getCoupleLink(client, userId) {
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
  const { error } = await client.from("couple_links")
    .update({ status: "revoked" })
    .eq("id", coupleLinkId);
  if (error) throw error;
  return true;
}


/* ============================================================
   СТАТУС "ПОСЛЕДНИЙ ОНЛАЙН"
   ============================================================ */

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // раз в 60 секунд
let heartbeatTimer = null;

export async function pingLastSeen(client, userId) {
  try {
    await client.from("couple_profiles")
      .upsert({ user_id: userId, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
  } catch (err) {
    console.error("pingLastSeen exception:", err);
  }
}

// Запускается один раз на любой странице кабинета (не только couple.html),
// чтобы last_seen_at обновлялся, пока пользователь активен на сайте.
export function startHeartbeat(client, userId) {
  if (heartbeatTimer) return;
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

// Возвращает { online: bool, label: "в сети" | "был(а) 5 мин назад" | ... }
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

// Общий результат пары с оценкой (0-100), на основе совпадения ответов.
// answers ожидается как { "q1": "a" | "b", ... } — одинаковые ключи вопросов у обоих.
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
