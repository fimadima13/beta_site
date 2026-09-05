// RelationSync.ai — heartbeat-loader.js
// Универсальный автозапуск статуса "онлайн" на ЛЮБОЙ странице кабинета.
//
// Почему это отдельный файл: раньше heartbeat запускался только внутри
// couple.html, поэтому last_seen_at обновлялся лишь когда партнёр САМ
// открывал страницу "Режим пары" — то есть по факту статус почти никогда
// не показывал "в сети", потому что там никто не сидит постоянно.
//
// Это файл решает задачу иначе: он сам получает сессию и сам запускает
// heartbeat, поэтому достаточно подключить его ОДНОЙ строкой на каждой
// странице кабинета — без необходимости трогать существующий код init()
// на этих страницах.
//
// КУДА ПОДКЛЮЧИТЬ (в конец <body>, после подключения auth.js/supabase-config.js):
// cabinet.html, account.html, journal.html, checklist.html, tests.html,
// questionnaire.html, self-test.html, love-language-test.html,
// conflict-style-test.html, communication-patterns-test.html,
// emotional-awareness-test.html, sos-session.html, about.html, couple.html
//
// <script type="module" src="assets/heartbeat-loader.js"></script>

import { getClient, isConfigured, getSession } from "./auth.js";
import { startHeartbeat } from "./couple-features.js";

(async function initHeartbeat() {
  try {
    if (!isConfigured()) return;
    const client = getClient();
    const session = await getSession(client);
    if (!session) return; // не залогинен — нечего пинговать
    startHeartbeat(client, session.user.id);
  } catch (err) {
    console.error("heartbeat-loader failed (non-fatal):", err);
  }
})();
