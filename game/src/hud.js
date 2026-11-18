import { MathUtils } from '../vendor/three.module.min.js';
import { CITY } from './config.js';

export function createHud() {
  const byId = id => document.getElementById(id);
  const root = byId('hud');
  const map = byId('minimap');
  const context = map.getContext('2d');
  const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const difficultyChoices = [...document.querySelectorAll('input[name="difficulty"]')];
  let toastCount = 0;
  function getDifficulty() {
    return difficultyChoices.find(choice => choice.checked)?.value || 'normal';
  }
  function setDifficulty(id) {
    const choice = difficultyChoices.find(choice => choice.value === id);
    if (choice) choice.checked = true;
  }
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
  function setClock(day, minutesOfDay) {
    const hours = String(Math.floor(minutesOfDay / 60)).padStart(2, '0');
    const minutes = String(Math.floor(minutesOfDay % 60)).padStart(2, '0');
    byId('clock-day').textContent = `Day ${day}`;
    byId('clock-time').textContent = `${hours}:${minutes}`;
  }
  function setCollectibles(count, total = 20) {
    byId('collectibles-count').textContent = `${count} / ${total}`;
  }
  function setRadio(station, track) {
    byId('radio-box').hidden = !station;
    byId('radio-station').textContent = station || '';
    byId('radio-track').textContent = track || '';
  }
  function setConsequence(kind, { fee = 0, cashLost = 0, weaponLost = false } = {}) {
    const arrest = kind === 'busted';
    const prefix = arrest ? 'busted' : 'hospital';
    byId(arrest ? 'busted-fine' : 'hospital-bill').textContent = `−$${money.format(fee)}`;
    byId(`${prefix}-cash-lost`).textContent = `−$${money.format(cashLost)}`;
    byId(`${prefix}-weapon-lost`).textContent = weaponLost ? 'Sidearm & ammo' : 'None';
  }
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
  function setHint(text, enterCar = false) {
    byId('hint').textContent = text;
    byId('enter-car-hint').hidden = !enterCar;
  }
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
  function drawMinimap(city, player, yaw, missions, police, navigation = {}) {
    const ctx = context;
    const width = map.width, height = map.height;
    const scale = 0.59;
    const target = navigation.target ?? missions.target;
    const distance = navigation.distance;
    const route = navigation.route || [];
    const distanceRow = byId('gps-distance');
    distanceRow.hidden = !target || !Number.isFinite(distance);
    if (!distanceRow.hidden) byId('gps-meters').textContent = `${money.format(Math.max(0, Math.ceil(distance)))} m`;
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
    for (let n = CITY.nodeMin; n <= CITY.half; n += CITY.pitch) {
      let a=project(n,CITY.nodeMin),b=project(n,CITY.half);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
      a=project(CITY.nodeMin,n);b=project(CITY.half,n);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
    }
    ctx.stroke();
    rectangle(252,566,17,166,'#d4b88e');
    if (target && route.length) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      for (const point of route) {
        const p = project(point.x, point.z);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = '#10333d';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = '#55ebcd';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    function blip(point,color,radius=3) {
      let p=project(point.x,point.z);
      p={x:MathUtils.clamp(p.x,8,width-8),y:MathUtils.clamp(p.y,8,height-8)};
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();
    }
    if (target) {
      blip(target, '#10333d', 7);
      blip(target, '#6af9db', 4.5);
    }
    if (!missions.current) {
      for (const job of missions.list) if (!job.locked && !job.completed && (!target || job.start.x !== target.x || job.start.z !== target.z)) blip(job.start, '#ffd281', 4);
      for (const race of missions.races || []) {
        const p = project(race.start.x, race.start.z);
        if (p.x > 8 && p.x < width - 8 && p.y > 8 && p.y < height - 8) blip(race.start, '#ee9afe', 3.5);
      }
    }
    if (missions.workshop) {
      const p = project(missions.workshop.x, missions.workshop.z);
      if (p.x > 8 && p.x < width - 8 && p.y > 8 && p.y < height - 8) blip(missions.workshop, '#84c5fe', 4);
    }
    for(const cop of [...police.copCars,...police.footCops]) if(cop.alive!==false)blip(cop,'#ff716f',3);
    ctx.save();ctx.translate(center.x,center.y);ctx.rotate(yaw-player.heading);
    ctx.fillStyle='#ffffff';ctx.strokeStyle='#0b1e2a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(-5,6);ctx.lineTo(0,3);ctx.lineTo(5,6);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.fillStyle='#eff6e9';ctx.font='10px monospace';ctx.fillText('N',width-18,16);
    ctx.strokeStyle='#ffffff77';ctx.beginPath();ctx.moveTo(width-14,21);ctx.lineTo(width-14-Math.sin(yaw)*11,21+Math.cos(yaw)*11);ctx.stroke();
  }
  return {
    getDifficulty, setDifficulty, setClock, setCollectibles, setRadio, setConsequence,
    setMoney, setCash: setMoney, setHealth, setWanted, setSpeed, setMission: setObjective, setObjective,
    toast, setDialogue, setHint, setVisible, show: () => setVisible(true), hide: () => setVisible(false),
    showMissionList, hideMissionList, toggleMissionList, drawMinimap,
    get missionListOpen() { return !byId('mission-list').hidden; },
    get toastCount() { return toastCount; }
  };
}
