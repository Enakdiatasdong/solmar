import { MathUtils } from '../vendor/three.module.min.js';
import { CITY } from './config.js';

export function createHud() {
  const byId = id => document.getElementById(id);
  const root = byId('hud');
  const map = byId('minimap');
  const context = map.getContext('2d');
  const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  let toastCount = 0;
  function setMoney(value) { byId('cash-value').textContent = `$${money.format(value)}`; }
  function setHealth(value) {
    const health = MathUtils.clamp(value, 0, 100);
    byId('health-fill').style.width = `${health}%`;
    byId('health-text').textContent = String(Math.ceil(health));
    root.classList.toggle('critical', health < 30);
  }
  function setWanted(value, hidden = false) {
    byId('wanted-stars').textContent = '★'.repeat(value) + '☆'.repeat(5 - value);
    byId('wanted-stars').classList.toggle('searching', hidden && value > 0);
    byId('wanted-label').textContent = value ? (hidden ? 'SEARCHING • STAY HIDDEN' : 'SOLMAR PATROL • PURSUIT') : 'KEEP A LOW PROFILE';
  }
  function setSpeed(speed, visible = true) {
    byId('speed-box').hidden = !visible;
    byId('speed-value').textContent = String(Math.round(Math.abs(speed) * 3.6)).padStart(3, '0');
  }
  function setObjective(text = '') { byId('objective-text').textContent = text; }
  function toast(text, kind = '') {
    const item = document.createElement('div');
    item.className = `toast ${kind}`;
    item.textContent = text;
    byId('toasts').append(item);
    toastCount++;
    while (byId('toasts').children.length > 5) byId('toasts').firstElementChild.remove();
    setTimeout(() => item.remove(), 6000);
  }
  function setDialogue(speaker, text) {
    byId('dialogue').hidden = !text;
    byId('subtitle').textContent = speaker;
    byId('dialogue-text').textContent = text;
  }
  function setHint(text) { byId('hint').textContent = text; }
  function setVisible(visible) {
    root.hidden = !visible;
    root.setAttribute('aria-hidden', String(!visible));
  }
  function showMissionList(missions) {
    const list = byId('mission-list');
    list.replaceChildren();
    const title = document.createElement('div');
    title.className = 'jobs-heading';
    title.textContent = 'THE CONTACT BOOK';
    list.append(title);
    for (const mission of missions) {
      const row = document.createElement('button');
      row.className = 'mission-row';
      row.dataset.mission = mission.id;
      row.disabled = mission.locked;
      const title = document.createElement('strong');
      title.textContent = `${mission.completed ? '✓ ' : ''}${mission.title}`;
      const detail = document.createElement('span');
      detail.textContent = mission.locked ? 'LOCKED • COMPLETE THE PREVIOUS JOB' : `$${money.format(mission.reward)}${mission.best != null ? ` • BEST ${mission.best.toFixed(1)}s` : ' • AVAILABLE'}`;
      const story = document.createElement('small');
      story.textContent = mission.description;
      row.append(title, detail, story);
      list.append(row);
    }
    const close = document.createElement('button');
    close.className = 'close-jobs';
    close.dataset.closeJobs = 'true';
    close.textContent = 'CLOSE [M]';
    list.append(close);
    list.hidden = false;
    return true;
  }
  function hideMissionList() { byId('mission-list').hidden = true; }
  function toggleMissionList(missions) {
    if (byId('mission-list').hidden) return showMissionList(missions);
    hideMissionList();
    return false;
  }
  function drawMinimap(city, player, yaw, missions, police) {
    const ctx = context;
    const width = map.width, height = map.height;
    const scale = 0.59;
    const center = { x: width * 0.5, y: height * 0.56 };
    const co = Math.cos(yaw), si = Math.sin(yaw);
    const project = (x, z) => {
      const dx = x - player.x, dz = z - player.z;
      return { x: center.x + (-co * dx + si * dz) * scale, y: center.y - (si * dx + co * dz) * scale };
    };
    function rectangle(x, z, w, d, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      [[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]].forEach(([a,b],i) => { const p=project(a,b); if (!i) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
      ctx.closePath();ctx.fill();
    }
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle = '#192e39'; ctx.fillRect(0,0,width,height);
    rectangle(0,0,744,744,'#344a50');
    rectangle(0,450,744,156,'#a89a74');
    rectangle(0,820,2500,570,'#286676');
    for (const park of city.parks || []) rectangle(park.x,park.z,park.width || 40,park.depth || 40,'#61846a');
    ctx.strokeStyle='#6a7f82';ctx.lineWidth=CITY.roadWidth*scale;
    ctx.beginPath();
    for (let n=-360;n<=360;n+=72) {
      let a=project(n,-360),b=project(n,360);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
      a=project(-360,n);b=project(360,n);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
    }
    ctx.stroke();
    rectangle(252,566,17,166,'#d4b88e');
    if (missions.target) {
      const a=project(player.x,player.z),b=project(missions.target.x,missions.target.z);
      ctx.setLineDash([4,5]);ctx.strokeStyle='#ffe1a0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
    }
    function blip(point,color,radius=3) {
      let p=project(point.x,point.z);
      p={x:MathUtils.clamp(p.x,8,width-8),y:MathUtils.clamp(p.y,8,height-8)};
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();
    }
    if (missions.target) blip(missions.target,'#41efd0',5);
    else for(const job of missions.list) if(!job.locked&&!job.completed)blip(job.start,'#ffd281',4);
    for(const cop of [...police.copCars,...police.footCops]) if(cop.alive!==false)blip(cop,'#ff716f',3);
    ctx.save();ctx.translate(center.x,center.y);ctx.rotate(yaw-player.heading);
    ctx.fillStyle='#ffffff';ctx.strokeStyle='#0b1e2a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-5,6);ctx.lineTo(0,3);ctx.lineTo(5,6);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.fillStyle='#eff6e9';ctx.font='10px monospace';ctx.fillText('N',width-18,16);
    ctx.strokeStyle='#ffffff77';ctx.beginPath();ctx.moveTo(width-14,21);ctx.lineTo(width-14-Math.sin(yaw)*11,21+Math.cos(yaw)*11);ctx.stroke();
  }
  return { setMoney, setCash:setMoney, setHealth, setWanted, setSpeed, setMission:setObjective, setObjective, toast, setDialogue, setHint, setVisible, show:()=>setVisible(true), hide:()=>setVisible(false), showMissionList, hideMissionList, toggleMissionList, drawMinimap, get missionListOpen(){return !byId('mission-list').hidden;}, get toastCount(){return toastCount;} };
}
