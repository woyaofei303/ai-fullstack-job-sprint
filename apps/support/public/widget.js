(() => {
  var script = document.currentScript;
  var widgetId = script?.dataset.widgetId;
  if (!widgetId) return;
  var base = new URL(script.src).origin;
  var locale = (
    script.dataset.locale ||
    document.documentElement.lang ||
    "zh-CN"
  ).startsWith("en")
    ? "en"
    : "zh-CN";
  var allowed = (script.dataset.allowedOrigins || "")
    .split(",")
    .filter(Boolean);
  if (allowed.length && !allowed.includes(location.origin)) return;
  var root = document.createElement("div");
  var frame = document.createElement("iframe");
  var launcher = document.createElement("button");
  var unread = document.createElement("span");
  root.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:system-ui,sans-serif";
  frame.title = "Customer support";
  frame.src = `${base}/${locale}/support/${encodeURIComponent(widgetId)}`;
  frame.style.cssText =
    "display:none;width:min(390px,calc(100vw - 24px));height:min(690px,calc(100vh - 88px));border:0;border-radius:18px;box-shadow:0 20px 70px rgba(8,35,21,.28);background:#fff;margin-bottom:12px";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open customer support");
  launcher.textContent = "✦";
  launcher.style.cssText =
    "display:block;margin-left:auto;width:56px;height:56px;border:0;border-radius:18px;background:#187a50;color:#fff;font-size:24px;box-shadow:0 10px 25px rgba(24,122,80,.34);cursor:pointer";
  unread.style.cssText =
    "display:none;position:absolute;right:-4px;bottom:48px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#e34d42;color:white;font-size:11px;line-height:20px;text-align:center";
  root.append(frame, launcher, unread);
  document.body.append(root);
  var identify = null;
  var unreadHandler = null;
  var unreadCount = 0;
  function open() {
    frame.style.display = "block";
    unreadCount = 0;
    unread.style.display = "none";
    launcher.textContent = "×";
  }
  function close() {
    frame.style.display = "none";
    launcher.textContent = "✦";
  }
  function run(command) {
    var name = command?.[0];
    var value = command?.[1];
    if (name === "open") open();
    if (name === "close") close();
    if (name === "reset") {
      unreadCount = 0;
      unread.style.display = "none";
      frame.contentWindow.postMessage({ type: "support:reset" }, base);
    }
    if (name === "identify") {
      identify = value;
      frame.contentWindow.postMessage(
        { type: "support:identify", value: value },
        base,
      );
    }
    if (name === "onUnread") unreadHandler = value;
  }
  launcher.onclick = () => {
    frame.style.display === "none" ? open() : close();
  };
  addEventListener("message", (event) => {
    if (event.origin !== base || event.source !== frame.contentWindow) return;
    if (event.data.type === "support:ready" && identify)
      run(["identify", identify]);
    if (
      event.data.type === "support:unread" &&
      frame.style.display === "none"
    ) {
      unreadCount += Number(event.data.count || 1);
      unread.textContent = String(unreadCount);
      unread.style.display = "block";
      if (unreadHandler) unreadHandler({ count: unreadCount });
    }
  });
  var queue = Array.isArray(window.SupportWidget)
    ? window.SupportWidget.slice()
    : [];
  window.SupportWidget = { push: run };
  queue.forEach(run);
})();
