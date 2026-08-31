/**
 * RelationSync.ai — патч лендинга (index.html) для интеграции с личным кабинетом.
 *
 * ВЕРСИЯ 2 — исправляет проблему с "двумя кнопками" (старая pill-кнопка + отдельно
 * добавленная ссылка "Войти"/"Кабинет" рядом). Теперь патч НЕ создаёт новых элементов
 * в хедере — он просто переписывает текст и href уже существующей pill-кнопки.
 *
 * Подключается ОДНОЙ строкой перед закрывающим </body> в index.html:
 *   <script src="assets/supabase-config.js"></script>
 *   <script type="module" src="assets/landing-cabinet-patch.js"></script>
 *
 * Если у вас уже подключена ПРЕДЫДУЩАЯ версия этого файла — просто замените
 * содержимое assets/landing-cabinet-patch.js на это, менять подключение в index.html
 * не нужно.
 *
 * Делает три вещи:
 *
 * 1) Проверяет, залогинен ли пользователь (через Supabase). Переписывает ТЕКСТ и HREF
 *    основной pill-кнопки в хедере (десктоп .pill-nav) и её аналога в мобильном меню
 *    (.menu-foot .pill) на "Войти" → login.html, либо "Кабинет" → cabinet.html.
 *    Никаких новых элементов не создаётся — только правка существующих.
 *
 * 2) Заменяет содержимое финального блока "раннего доступа" (форма сбора email,
 *    <section id="start">) на прямой призыв зарегистрироваться.
 *
 * 3) Переписывает href всех кнопок .price-cta (тарифы) на
 *    login.html?mode=register&plan=<free|premium|couple>.
 */

import { getClient, isConfigured, getSession } from "./auth.js";

const PLAN_ORDER = ["free", "premium", "couple"]; // порядок карточек в .pricing-grid

async function detectSession() {
  if (!isConfigured()) return null;
  try {
    const client = getClient();
    return await getSession(client);
  } catch (err) {
    console.error("landing-cabinet-patch: session check failed", err);
    return null;
  }
}

/**
 * Убирает любые элементы, оставшиеся от предыдущей (кривой) версии патча —
 * на случай, если старый скрипт уже успел вставить их в DOM ранее.
 */
function removeLegacyInjectedLinks() {
  const legacyIds = ["rs-cabinet-link-desktop", "rs-cabinet-link-mobile"];
  legacyIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

function patchHeaderPillButton(isLoggedIn) {
  const targetHref = isLoggedIn ? "cabinet.html" : "login.html";
  const targetLabel = isLoggedIn ? "Кабинет" : "Войти";

  // Десктоп: основная pill-кнопка в хедере, ведущая раньше на "#start"
  document.querySelectorAll('a.pill-nav[href="#start"], a.pill-nav').forEach((el) => {
    el.setAttribute("href", targetHref);
    const span = el.querySelector("span");
    if (span) span.textContent = targetLabel;
    else el.textContent = targetLabel;
  });

  // Hero pill-cta (крупная кнопка в самом хиро-блоке) — если она вела на "#start",
  // тоже переключаем на вход/кабинет, чтобы не было противоречия в CTA.
  document.querySelectorAll('a.pill-cta[href="#start"]').forEach((el) => {
    el.setAttribute("href", isLoggedIn ? "cabinet.html" : "login.html?mode=register&plan=free");
  });

  // Мобильное меню: кнопка в .menu-foot .pill
  document.querySelectorAll('.menu-foot a.pill').forEach((el) => {
    el.setAttribute("href", targetHref);
    el.textContent = targetLabel;
  });

  // Ghost-ссылка в мобильном меню, которая уже вела на login.html — при логине
  // логичнее вести на выход из кабинета не нужно, просто оставляем как переход в кабинет.
  if (isLoggedIn) {
    document.querySelectorAll('.menu-foot a.ghost[href="login.html"]').forEach((el) => {
      el.setAttribute("href", "cabinet.html");
      el.textContent = "Кабинет";
    });
  }
}

function patchPricingButtons() {
  const priceCtas = document.querySelectorAll(".price-cta");
  priceCtas.forEach((el, idx) => {
    const plan = PLAN_ORDER[idx] || "free";
    el.setAttribute("href", `login.html?mode=register&plan=${plan}`);
  });
}

function patchEarlyAccessSection() {
  const startSection = document.getElementById("start");
  if (!startSection) return;

  const finalCta = startSection.querySelector(".final-cta");
  if (!finalCta) return;

  finalCta.innerHTML = `
    <span class="eyebrow">Личный кабинет</span>
    <h2 class="section-title" style="font-size:clamp(26px,3.2vw,34px)">Заполните анкету и получите первый чек-лист сегодня</h2>
    <p class="section-sub">Регистрация занимает меньше минуты. Дальше — анкета о вас и партнёре, и сразу персональный план в кабинете.</p>
    <div style="display:flex; gap:12px; justify-content:center; margin-top:28px; flex-wrap:wrap;">
      <a href="login.html?mode=register&plan=free" class="pill" style="display:inline-flex; align-items:center; justify-content:center; height:50px; padding:0 28px; border-radius:999px; background:var(--pill); color:var(--pill-ink); font-size:15px; font-weight:600; text-decoration:none;">Создать аккаунт бесплатно</a>
      <a href="login.html" class="ghost" style="display:inline-flex; align-items:center; justify-content:center; height:50px; padding:0 20px; font-size:15px; font-weight:500; color:#fff; text-decoration:none;">Уже есть аккаунт →</a>
    </div>
    <p class="cta-note" style="margin-top:18px;">Без списаний на бесплатном тарифе. Отменить или сменить план можно в любой момент.</p>
  `;
}

async function run() {
  removeLegacyInjectedLinks();

  const session = await detectSession();
  const isLoggedIn = !!session;

  patchHeaderPillButton(isLoggedIn);
  patchPricingButtons();
  patchEarlyAccessSection();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
