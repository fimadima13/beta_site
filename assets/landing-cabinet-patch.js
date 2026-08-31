/**
 * RelationSync.ai — патч лендинга (index.html) для интеграции с личным кабинетом.
 *
 * ВЕРСИЯ 3 — исправляет проблему с "уехавшей вниз" ссылкой "Уже есть аккаунт →"
 * в финальном CTA-блоке. Причина была в том, что новая разметка полагалась на
 * margin/flow соседних оригинальных элементов секции — теперь весь блок
 * оборачивается в один самостоятельный контейнер с явными отступами, ничего
 * не наследует от старой формы и не зависит от прежней высоты .cta-form.
 *
 * Подключение в index.html не меняется:
 *   <script src="assets/supabase-config.js"></script>
 *   <script type="module" src="assets/landing-cabinet-patch.js"></script>
 */

import { getClient, isConfigured, getSession } from "./auth.js";

const PLAN_ORDER = ["free", "premium", "couple"];

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

function removeLegacyInjectedLinks() {
  ["rs-cabinet-link-desktop", "rs-cabinet-link-mobile"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

function patchHeaderPillButton(isLoggedIn) {
  const targetHref = isLoggedIn ? "cabinet.html" : "login.html";
  const targetLabel = isLoggedIn ? "Кабинет" : "Войти";

  document.querySelectorAll('a.pill-nav').forEach((el) => {
    el.setAttribute("href", targetHref);
    const span = el.querySelector("span");
    if (span) span.textContent = targetLabel;
    else el.textContent = targetLabel;
  });

  document.querySelectorAll('a.pill-cta[href="#start"]').forEach((el) => {
    el.setAttribute("href", isLoggedIn ? "cabinet.html" : "login.html?mode=register&plan=free");
  });

  document.querySelectorAll('.menu-foot a.pill').forEach((el) => {
    el.setAttribute("href", targetHref);
    el.textContent = targetLabel;
  });

  if (isLoggedIn) {
    document.querySelectorAll('.menu-foot a.ghost[href="login.html"]').forEach((el) => {
      el.setAttribute("href", "cabinet.html");
      el.textContent = "Кабинет";
    });
  }
}

function patchPricingButtons() {
  document.querySelectorAll(".price-cta").forEach((el, idx) => {
    const plan = PLAN_ORDER[idx] || "free";
    el.setAttribute("href", `login.html?mode=register&plan=${plan}`);
  });
}

function patchEarlyAccessSection() {
  const startSection = document.getElementById("start");
  if (!startSection) return;

  const finalCta = startSection.querySelector(".final-cta");
  if (!finalCta) return;

  // Полностью самодостаточная разметка в ОДНОМ контейнере с явным line-height и gap —
  // не зависит от margin-top соседних элементов, которые были в оригинальной секции.
  finalCta.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; gap:0;">
      <span class="eyebrow">Личный кабинет</span>
      <h2 class="section-title" style="font-size:clamp(26px,3.2vw,34px); margin:16px 0 14px;">Заполните анкету и получите первый чек-лист сегодня</h2>
      <p class="section-sub" style="margin:0 0 26px;">Регистрация занимает меньше минуты. Дальше — анкета о вас и партнёре, и сразу персональный план в кабинете.</p>
      <a href="login.html?mode=register&plan=free" style="display:inline-flex; align-items:center; justify-content:center; height:50px; padding:0 28px; border-radius:999px; background:var(--pill); color:var(--pill-ink); font-size:15px; font-weight:600; text-decoration:none;">Создать аккаунт бесплатно</a>
      <a href="login.html" style="display:inline-flex; align-items:center; justify-content:center; height:auto; margin:16px 0 0; font-size:14.5px; font-weight:500; color:#fff; text-decoration:none; opacity:.85;">Уже есть аккаунт →</a>
      <p style="margin:20px 0 0; font-size:12.5px; color:var(--muted); text-align:center;">Без списаний на бесплатном тарифе. Отменить или сменить план можно в любой момент.</p>
    </div>
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
