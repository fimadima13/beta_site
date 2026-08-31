// RelationSync.ai — обработка выбранного тарифа при переходе с лендинга на регистрацию.
// Подключается ДОПОЛНИТЕЛЬНО в login.html (см. инструкцию в PLAN-SELECT-README.md).
//
// Как это работает:
// 1. На лендинге кнопки тарифов ведут на login.html?mode=register&plan=premium (или plan=free / plan=couple).
// 2. Этот скрипт при загрузке login.html:
//    - переключает вкладку формы на "Регистрация", если есть ?mode=register
//    - показывает баннер "Выбран тариф: ..." над формой
//    - сохраняет выбранный план в localStorage, чтобы после подтверждения email
//      и первого входа кабинет (pricing.html) могло показать его как "уже выбранный"
//
// Тариф сохраняется в localStorage под ключом 'relationsync_selected_plan' —
// это временное решение до появления платёжного модуля и таблицы subscriptions.
// Когда добавится оплата — этот же ключ можно читать при онбординге для
// автоматического выделения нужного тарифа в pricing.html.

(function () {
  const PLAN_LABELS = {
    free: "Бесплатно",
    premium: "Премиум",
    couple: "Премиум для пары",
  };

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function init() {
    const plan = getQueryParam("plan");
    const mode = getQueryParam("mode");

    if (plan && PLAN_LABELS[plan]) {
      try {
        localStorage.setItem("relationsync_selected_plan", plan);
      } catch (e) {
        // localStorage может быть недоступен (приватный режим) — не критично
      }
      renderPlanBanner(plan);
    }

    if (mode === "register") {
      switchToRegisterTab();
    }
  }

  function renderPlanBanner(plan) {
    const card = document.querySelector(".auth-card");
    if (!card) return;

    const banner = document.createElement("div");
    banner.style.cssText = [
      "display:flex", "align-items:center", "gap:8px",
      "margin:0 0 18px", "padding:10px 14px",
      "border:1px solid rgba(255,255,255,.18)",
      "background:rgba(255,255,255,.05)",
      "border-radius:10px", "font-size:13px",
      "color:#fafafa", "line-height:1.4",
    ].join(";");
    banner.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" style="flex:none">' +
      '<path d="M4 12l5 5L20 6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "<span>Выбран тариф: <strong>" + PLAN_LABELS[plan] + "</strong></span>";

    card.insertBefore(banner, card.firstChild);
  }

  function switchToRegisterTab() {
    // Пытаемся найти таб регистрации по нескольким возможным селекторам —
    // подстраховка на случай разной внутренней разметки login.html.
    const candidates = [
      '[data-tab="register"]',
      '.auth-tab[data-auth="register"]',
      '.auth-tab:nth-child(2)',
    ];
    for (const selector of candidates) {
      const el = document.querySelector(selector);
      if (el) {
        el.click();
        break;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
