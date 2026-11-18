const money = value => `$${Math.max(0, Math.floor(value || 0)).toLocaleString('en-US')}`;
const byId = id => document.getElementById(id);

export function createHud() {
  const root = byId('hud');
  const missionList = byId('mission-list');
  const map = byId('minimap');
  const context = map.getContext('2d');
  const toasts = [];
  let jobsOpen = false;
  function setHealth(value) {
    const health = Math.max(0, Math.min(100, Math.ceil(value || 0)));
    byId('health-fill').style.width = `${health}%`;
    byId('health-fill').style.background = health < 30 ? '#ff7168' : '#b7f09b';
    byId('health-text').textContent = String(health);
  }
  function setMoney(value) { byId('cash-value').textContent = money(value); }
  function setWanted(value) {
    const level = Math.max(0, Math.min(5, Math.ceil(value || 0)));
    const stars = byId('wanted-stars');
    stars.textContent = Array.from({ length: 5 }, (_, i) => i < level ? '★' : '☆').join(' ');
    stars.setAttribute('aria-label', `${level} of 5 wanted stars`);
    stars.classList.toggle('hot', level > 0);
  }
  function setSpeed(value) {
    const show = value !== null && value !== undefined;
    byId('speed-box').hidden = !show;
    if (show) byId('speed-value').textContent = String(Math.round(Math.abs(value) * 3.6)).padStart(3, '0');
  }
  function setObjective(text) {
    byId('objective-text').textContent = text || 'Explore Solmar. Find a gold beacon to take a job.';
  }
  function setDialogue(speaker, text) {
    if (text === undefined) { text = speaker; speaker = 'SOLMAR'; }
    byId('dialogue').hidden = !text;
    byId('subtitle').textContent = speaker || 'SOLMAR';
    byId('dialogue-text').textContent = text || '';
  }
  function setHint(text) {
    byId('hint').textContent = text || '';
    byId('hint').hidden = !text;
  }
  function toast(text, kind = 'info') {
    if (!text) return;
    const item = document.createElement('div');
    item.className = `toast toast-${kind}`;
    item.textContent = text;
    byId('toasts').append(item);
    toasts.push({ element: item, remaining: 4.5 });
    while (toasts.length > 5) toasts.shift().element.remove();
  }
  function update(dt) {
    for (let i = toasts.length - 1; i >= 0; i--) {
      toasts[i].remaining -= dt;
      if (toasts[i].remaining <= 0) {
        toasts[i].element.remove();
        toasts.splice(i, 1);
      }
    }
  }
  function setVisible(visible) {
    root.hidden = !visible;
    root.setAttribute('aria-hidden', String(!visible));
  }
  function hideMissionList() {
    missionList.hidden = true;
    missionList.setAttribute('aria-hidden', 'true');
    jobsOpen = false;
  }
  function showMissionList(list, onSelect) {
    const rows = byId('mission-rows');
    rows.replaceChildren();
    list.forEach((mission, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `mission-row${mission.completed ? ' done' : ''}`;
      row.dataset.mission = mission.id;
      row.disabled = Boolean(mission.locked);
      const number = document.createElement('span');
      number.className = 'mission-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const detail = document.createElement('span');
      detail.className = 'mission-detail';
      const name = document.createElement('strong');
      name.textContent = mission.title;
      const status = document.createElement('small');
      status.textContent = mission.locked ? 'Complete the previous job to unlock' : mission.completed ? `Complete${mission.best ? ` · best ${mission.best.toFixed(1)}s` : ''}` : 'Ready to play';
      detail.append(name, status);
      const reward = document.createElement('span');
      reward.className = 'mission-reward';
      reward.textContent = mission.locked ? 'LOCKED' : mission.completed ? '✓' : money(mission.reward);
      row.append(number, detail, reward);
      row.addEventListener('click', () => { if (typeof onSelect === 'function') onSelect(mission.id); });
      rows.append(row);
    });
    missionList.hidden = false;
    missionList.setAttribute('aria-hidden', 'false');
    jobsOpen = true;
  }
  byId('btn-close-jobs').addEventListener('click', hideMissionList);
  function drawMinimap(city, subject, cameraYaw, missions, police) {
    if (!context) return;
    const player = subject.state || subject;
    const pos = player.inCar || player;
    const yaw = cameraYaw || 0;
    const size = map.width;
    const centre = size / 2;
    const scale = size / 490;
    const radius = centre - 8;
    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(centre, centre, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#183b3d';
    context.fillRect(0, 0, size, size);
    context.translate(centre, centre);
    context.transform(-Math.cos(yaw) * scale, -Math.sin(yaw) * scale, Math.sin(yaw) * scale, -Math.cos(yaw) * scale, 0, 0);
    context.translate(-pos.x, -pos.z);
    context.fillStyle = '#2b777a';
    context.fillRect(-1000, 540, 2000, 1200);
    context.fillStyle = '#b9ad79';
    context.fillRect(-385, 372, 770, 168);
    context.fillStyle = '#345850';
    for (const park of city.parks || []) {
      const x = park.x ?? -360 + ((park.col ?? park[0]) + .5) * 72;
      const z = park.z ?? -360 + ((park.row ?? park[1]) + .5) * 72;
      const width = park.width || 48;
      const depth = park.depth || 48;
      context.fillRect(x - width / 2, z - depth / 2, width, depth);
    }
    context.lineWidth = 11;
    context.strokeStyle = '#72847a';
    context.beginPath();
    for (const edge of city.graph.edges) {
      context.moveTo(edge.a.x, edge.a.z);
      context.lineTo(edge.b.x, edge.b.z);
    }
    context.stroke();
    context.strokeStyle = '#7d9587';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(-360, 410);
    context.lineTo(360, 410);
    context.moveTo(-288, 360);
    context.lineTo(-288, 464);
    context.stroke();
    context.restore();
    const point = (x, z, color, markerRadius = 4) => {
      const dx = x - pos.x;
      const dz = z - pos.z;
      let mx = (-Math.cos(yaw) * dx + Math.sin(yaw) * dz) * scale;
      let my = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) * scale;
      const distance = Math.hypot(mx, my);
      if (distance > radius - 9) { mx *= (radius - 9) / distance; my *= (radius - 9) / distance; }
      context.beginPath();
      context.arc(centre + mx, centre + my, markerRadius, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = '#173334';
      context.lineWidth = 1.5;
      context.stroke();
    };
    if (!missions.active) {
      for (const job of missions.list || []) {
        if (job.locked) continue;
        const location = job.location || job.start || job;
        if (Number.isFinite(location.x) && Number.isFinite(location.z)) point(location.x, location.z, job.completed ? '#68dbca' : '#ffd76e', 4);
      }
    }
    for (const beacon of missions.beacons || []) point(beacon.x, beacon.z, beacon.color || '#ffd76e', 5);
    const policeState = police?.state || police || {};
    for (const cop of [...policeState.copCars || [], ...policeState.footCops || []]) {
      if (cop.alive !== false) point(cop.x, cop.z, '#ff746a', 3.5);
    }
    context.save();
    context.translate(centre, centre);
    context.rotate(yaw - (pos.heading || 0));
    context.beginPath();
    context.moveTo(0, -9);
    context.lineTo(6, 7);
    context.lineTo(0, 4);
    context.lineTo(-6, 7);
    context.closePath();
    context.fillStyle = '#fff9df';
    context.fill();
    context.strokeStyle = '#153d3e';
    context.lineWidth = 2;
    context.stroke();
    context.restore();
    context.beginPath();
    context.arc(centre, centre, radius, 0, Math.PI * 2);
    context.strokeStyle = '#eddfb2';
    context.lineWidth = 2;
    context.stroke();
  }
  return {
    setHealth, setMoney, setCash: setMoney, setWanted, setSpeed, setObjective,
    setMission: setObjective, setDialogue, setHint, toast, update, setVisible,
    show: () => setVisible(true), hide: () => setVisible(false),
    showMissionList, hideMissionList,
    toggleMissionList(list, onSelect) { if (jobsOpen) hideMissionList(); else showMissionList(list, onSelect); },
    drawMinimap,
    get jobsOpen() { return jobsOpen; },
  };
}
