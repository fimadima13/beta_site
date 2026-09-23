// RelationSync.ai — режим встройки в кабинет.
// Если страница открыта внутри iframe кабинета, прячем собственную
// шапку и оставляем человека в той же комнате при внутренних переходах.
(function () {
  const inFrame = window !== window.top;
  const flagged = new URLSearchParams(location.search).get("embed") === "1";
  if (!inFrame && !flagged) return;

  document.documentElement.classList.add("embed");

  const LEAVE_SHELL = /(?:^|\/)(login|index|pricing|account|about|sos-session|home)\.html$/i;

  if (inFrame && LEAVE_SHELL.test(location.pathname)) {
    window.top.location.href = location.href;
    return;
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    let url;
    try { url = new URL(link.getAttribute("href"), location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;

    if (LEAVE_SHELL.test(url.pathname) || /(?:^|\/)(cabinet|home)\.html$/i.test(url.pathname)) {
      event.preventDefault();
      window.top.location.href = url.href;
      return;
    }

    if (!inFrame) return;
    url.searchParams.set("embed", "1");
    if (new URLSearchParams(location.search).get("preview") === "spaces") {
      url.searchParams.set("preview", "spaces");
    }
    const next = url.pathname.replace(/.*\//, "") + url.search + url.hash;
    if (link.getAttribute("href") !== next) link.setAttribute("href", next);
  }, true);
})();
