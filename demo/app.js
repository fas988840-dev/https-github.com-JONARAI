(() => {
  const clock = document.getElementById("clock");
  const date = document.getElementById("date");
  const update = () => {
    const now = new Date();
    if (clock) clock.textContent = now.toLocaleTimeString("ar-SA", { hour12: false });
    if (date) date.textContent = now.toLocaleDateString("ar-SA");
  };
  update();
  window.setInterval(update, 1000);
})();