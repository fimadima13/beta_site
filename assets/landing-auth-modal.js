import { getClient, isConfigured, rememberSession } from "./auth.js";

const PLAN_LABELS = {
  free: "Бесплатно",
  premium: "Премиум",
  couple: "Для пары",
};

const modal = document.getElementById("authModal");
const titleEl = document.getElementById("amTitle");
const subEl = document.getElementById("amSub");
const planEl = document.getElementById("amPlan");
const tabLogin = document.getElementById("amTabLogin");
const tabRegister = document.getElementById("amTabRegister");
const form = document.getElementById("amForm");
const emailEl = document.getElementById("amEmail");
const passwordEl = document.getElementById("amPassword");
const submitBtn = document.getElementById("amSubmit");
const submitLabel = document.getElementById("amSubmitLabel");
const msgEl = document.getElementById("amMsg");

let mode = "login";
let nextPage = "home.html";

function safeNext(raw) {
  const next = raw || "";
  if (!next || /^https?:/i.test(next) || next.startsWith("//") || next.includes("..") || next.includes("\\")) {
    return "home.html";
  }
  return next.replace(/^\//, "") || "home.html";
}

function setMode(nextMode) {
  mode = nextMode === "register" ? "register" : "login";
  const isLogin = mode === "login";
  tabLogin.classList.toggle("is-on", isLogin);
  tabRegister.classList.toggle("is-on", !isLogin);
  titleEl.textContent = isLogin ? "Вход в аккаунт" : "Создать аккаунт";
  subEl.textContent = isLogin
    ? "Войдите, чтобы открыть кабинет и свои записи."
    : "Пара минут — и вы попадёте в свой кабинет.";
  submitLabel.textContent = isLogin ? "Войти" : "Создать аккаунт";
  passwordEl.setAttribute("autocomplete", isLogin ? "current-password" : "new-password");
  hideMsg();
}

function showPlan(plan) {
  if (plan && PLAN_LABELS[plan]) {
    try { localStorage.setItem("relationsync_selected_plan", plan); } catch (e) {}
    planEl.innerHTML = "Выбран тариф: <strong>" + PLAN_LABELS[plan] + "</strong>";
    planEl.classList.add("is-on");
  } else {
    planEl.classList.remove("is-on");
    planEl.textContent = "";
  }
}

function showMsg(text, type) {
  msgEl.textContent = text;
  msgEl.className = "am-msg show " + (type === "ok" ? "ok" : "err");
}

function hideMsg() {
  msgEl.className = "am-msg";
  msgEl.textContent = "";
}

function openAuth(opts) {
  if (!modal) return;
  nextPage = safeNext(opts.next);
  setMode(opts.mode);
  showPlan(opts.plan);
  hideMsg();
  document.documentElement.classList.remove("is-open");
  document.documentElement.classList.add("auth-open");
  modal.classList.add("is-on");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => emailEl.focus(), 40);
}

function closeAuth() {
  if (!modal) return;
  modal.classList.remove("is-on");
  modal.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("auth-open");
}

function parseLoginLink(href) {
  const url = new URL(href, location.href);
  return {
    mode: url.searchParams.get("mode") === "register" ? "register" : "login",
    plan: url.searchParams.get("plan") || "",
    next: url.searchParams.get("next") || "home.html",
  };
}

function translateError(msg) {
  if (!msg) return "Что-то пошло не так. Попробуйте ещё раз.";
  if (/invalid login credentials/i.test(msg)) return "Неверный email или пароль.";
  if (/already registered|already exists/i.test(msg)) return "Этот email уже зарегистрирован — попробуйте войти.";
  if (/password.*(least|short)/i.test(msg)) return "Пароль слишком короткий — минимум 6 символов.";
  if (/rate limit/i.test(msg)) return "Слишком много попыток. Подождите немного и попробуйте снова.";
  return msg;
}

if (modal) {
  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));

  modal.querySelectorAll("[data-auth-close]").forEach((el) => {
    el.addEventListener("click", closeAuth);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-on")) closeAuth();
  });

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!href.includes("login.html")) return;
    e.preventDefault();
    openAuth(parseLoginLink(link.href));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMsg();

    if (!isConfigured()) {
      showMsg("Кабинет сейчас недоступен. Откройте login.html или попробуйте позже.", "err");
      return;
    }

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const client = getClient();

    submitBtn.disabled = true;
    const original = submitLabel.textContent;
    submitLabel.innerHTML = '<span class="am-spin"></span>';

    try {
      if (mode === "login") {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        rememberSession(data.session);
        window.location.href = nextPage;
      } else {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          rememberSession(data.session);
          window.location.href = nextPage;
        } else {
          setMode("login");
          showMsg("Аккаунт создан. Проверьте почту и подтвердите email, затем войдите.", "ok");
        }
      }
    } catch (err) {
      showMsg(translateError(err.message), "err");
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = original;
    }
  });
}
