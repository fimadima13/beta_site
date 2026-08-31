/**
 * RelationSync.ai — патч лендинга (index.html) для интеграции с личным кабинетом.
 *
 * Подключается ОДНОЙ строкой перед закрывающим </body> в index.html:
 *   <script src="assets/supabase-config.js"></script>
 *   <script type="module" src="assets/landing-cabinet-patch.js"></script>
 *
 * Делает четыре вещи, ничего не трогая в остальной вёрстке лендинга:
 *
 * 1) Проверяет, залогинен ли пользователь (через Supabase), и если да —
 *    добавляет в хедер (десктоп pill-nav + мобильное меню) кнопку "Кабинет",
 *    ведущую на cabinet.html. Если не залогинен — кнопка ведёт на login.html.
 *
 * 2) Заменяет содержимое финального блока "раннего доступа" (форма сбора email,
 *    <section id="start">) на прямой призыв зарегистрироваться — без лишнего
 *    шага "мы напишем вам позже", раз регистрация уже работает.
 *
 * 3) Переписывает href всех кнопок с классом .price-cta (тарифы) так, чтобы
 *    они ведут на login.html?mode=register&plan=<free|premium|couple>
 *    вместо старого якоря #start.
 *
 * 4) Переписывает href основной pill-кнопки в хедере (.pill-nav, .pill-cta)
 *    на login.html?mode=register&plan=free, если пользователь не залогинен.
 */

import { getClient, isConfigured, getSession } from "./auth.js";

const PLAN_ORDER = ["free", "premium", "couple"]; // порядок карточек в .pricing-grid

async function detectSession() {
  if (!isConfigured()) return null;
  try {
    const client = getClient();
    const session = await getSession(client);
    return session;
  } catch (err) {
    console.error("landing-cabinet-patch: session check failed", err);
    return null;
  }
}

function buildCabinetLink(isLoggedIn, extraStyle) {
  const a = document.createElement("a");
  a.href = isLoggedIn ? "cabinet.html" : "login.html";
  a.textContent = isLoggedIn ? "Кабинет" : "Войти";
  if (extraStyle) a.style.cssText = extraStyle;
  return a;
}

function patchHeaderCabinetLink(isLoggedIn) {
  // Десктоп: вставляем ссылку прямо перед основной pill-кнопкой навигации
  const pillNav = document.querySelector(".pill-nav");
  if (pillNav && pillNav.parentElement) {
    const existing = document.getElementById("rs-cabinet-link-desktop");
    if (!existing) {
      const link = buildCabinetLink(
        isLoggedIn,
        "position:absolute; right:calc(175px + var(--u, 1px) * 75.4 + 14px); top:calc(27 * var(--u, 1px)); " +
          "height:calc(49 * var(--u, 1px)); display:flex; align-items:center; font-size:calc(19px); " +
          "color:#fff; font-weight:500; white-space:nowrap;"
      );
      link.id = "rs-cabinet-link-desktop";
      // Простая и надёжная альтернатива инлайн-позиционированию: ставим рядом в потоке.
      link.removeAttribute("style");
      link.style.cssText = "margin-right:14px; color:#fff; font-weight:500; font-size:15px; text-decoration:none; opacity:.9; transition:opacity .2s ease;";
      link.addEventListener("mouseenter", () => (link.style.opacity = "1"));
      link.addEventListener("mouseleave", () => (link.style.opacity = ".9"));
      pillNav.insertAdjacentElement("beforebegin", link);
    }
  }

  // Мобильное меню: добавляем пункт в конец списка .menu-list, если такого пункта ещё нет
  const menuList = document.querySelector(".menu-list");
  if (menuList && !document.getElementById("rs-cabinet-link-mobile")) {
    const li = document.createElement("li");
    const a = buildCabinetLink(isLoggedIn);
    a.id = "rs-cabinet-link-mobile";
    li.appendChild(a);
    menuList.appendChild(li);
  }

  // Основной pill-cta в hero (если не залогинен — направляем на регистрацию с free-планом)
  if (!isLoggedIn) {
    document.querySelectorAll('a.pill-cta[href="#start"], a.pill-nav[href="#start"]').forEach((el) => {
      el.setAttribute("href", "login.html?mode=register&plan=free");
    });
  } else {
    document.querySelectorAll('a.pill-cta[href="#start"], a.pill-nav[href="#start"]').forEach((el) => {
      el.setAttribute("href", "cabinet.html");
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
  const session = await detectSession();
  const isLoggedIn = !!session;

  patchHeaderCabinetLink(isLoggedIn);
  patchPricingButtons();
  patchEarlyAccessSection();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
