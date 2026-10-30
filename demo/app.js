(() => {
  const clock=document.getElementById("clock"), date=document.getElementById("date");
  const urlInput=document.getElementById("bridge-url"), toggle=document.getElementById("connection-toggle");
  const status=document.getElementById("connection-status"), badge=document.getElementById("connection-badge");
  let timer=null, busy=false;
  const tick=()=>{const n=new Date();if(clock)clock.textContent=n.toLocaleTimeString("ar-SA",{hour12:false});if(date)date.textContent=n.toLocaleDateString("ar-SA");};
  tick();window.setInterval(tick,1000);
  if(!urlInput||!toggle)return;
  urlInput.value=localStorage.getItem("jonarai_bridge_url")||"";
  const setState=(running,label,kind="muted")=>{toggle.textContent=running?"إطفاء الاتصال":"تشغيل الاتصال";toggle.classList.toggle("off",running);toggle.setAttribute("aria-pressed",String(running));badge.textContent=label;badge.className="tag "+kind;};
  async function check(){
    if(busy)return;busy=true;
    try{
      const base=urlInput.value.trim().replace(/\/$/,"");
      if(!/^https:\/\//i.test(base))throw new Error("أدخل عنوان HTTPS صحيحًا للخادم");
      const response=await fetch(base+"/health",{method:"GET",cache:"no-store",headers:{accept:"application/json"}});
      if(!response.ok)throw new Error("الخادم أعاد HTTP "+response.status);
      const data=await response.json();
      if(data.mode!=="PAPER_DATA_ONLY"||data.execution_enabled!==false)throw new Error("وضع الخادم غير مطابق لسياسة القراءة فقط");
      if(data.gateway_ready===true){status.textContent="جلسة IBKR متصلة — قراءة فقط";setState(true,"IBKR متصل","");}
      else{status.textContent="الخادم متاح، لكن جلسة IBKR غير متصلة";setState(true,"الجسر متاح / IBKR غير متصل","muted");}
    }catch(e){status.textContent="فشل الفحص: "+e.message;setState(true,"تعذر الاتصال","muted");}
    finally{busy=false;}
  }
  toggle.addEventListener("click",()=>{
    if(timer){clearInterval(timer);timer=null;status.textContent="المراقبة متوقفة";setState(false,"متوقف");return;}
    const base=urlInput.value.trim().replace(/\/$/,"");
    if(!/^https:\/\//i.test(base)){status.textContent="أدخل عنوان HTTPS للخادم أولًا";return;}
    localStorage.setItem("jonarai_bridge_url",base);setState(true,"جارٍ الفحص","muted");check();timer=setInterval(check,10000);
  });
  urlInput.addEventListener("change",()=>{if(!timer)localStorage.setItem("jonarai_bridge_url",urlInput.value.trim().replace(/\/$/,""));});
  setState(false,"متوقف");
})();