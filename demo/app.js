(() => {
  const clock=document.getElementById("clock"), date=document.getElementById("date");
  const toggle=document.getElementById("connection-toggle");
  const status=document.getElementById("connection-status"), badge=document.getElementById("connection-badge");
  let running=false;
  const tick=()=>{const n=new Date();if(clock)clock.textContent=n.toLocaleTimeString("ar-SA",{hour12:false});if(date)date.textContent=n.toLocaleDateString("ar-SA");};
  tick();window.setInterval(tick,1000);
  if(!toggle)return;
  const render=()=>{toggle.textContent=running?"إيقاف العرض":"تشغيل العرض";toggle.classList.toggle("off",running);toggle.setAttribute("aria-pressed",String(running));badge.textContent=running?"العرض يعمل":"متوقف";badge.className="tag muted";status.textContent=running?"العرض التجريبي نشط — بيانات السوق غير متصلة":"العرض متوقف";document.documentElement.dataset.demo=running?"on":"off";};
  toggle.addEventListener("click",()=>{running=!running;render();});
  render();
})();