(() => {
  const clock = document.getElementById("clock");
  const date = document.getElementById("date");
  const toggle = document.getElementById("robot-toggle");
  const status = document.getElementById("robot-status");
  const badge = document.getElementById("robot-badge");
  let running = false;

  const tick = () => {
    const now = new Date();
    if (clock) clock.textContent = now.toLocaleTimeString("ar-SA", { hour12: false });
    if (date) date.textContent = now.toLocaleDateString("ar-SA");
  };

  const render = () => {
    if (!toggle || !status || !badge) return;
    toggle.textContent = running ? "إيقاف مراقبة AI التجريبية" : "تشغيل مراقبة AI التجريبية";
    toggle.classList.toggle("off", running);
    toggle.setAttribute("aria-pressed", String(running));
    badge.textContent = running ? "مراقبة AI محلية تعمل" : "متوقف";
    status.textContent = running
      ? "مراقبة AI تجريبية تعمل محليًا — لا اتصال سوق ولا تداول"
      : "المراقب متوقف";
    document.documentElement.dataset.demo = running ? "on" : "off";
  };

  tick();
  window.setInterval(tick, 1000);
  if (toggle) toggle.addEventListener("click", () => {
    running = !running;
    render();
  });
  render();
})();