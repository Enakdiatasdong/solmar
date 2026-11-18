// DOM HUD and canvas minimap. The optional lookups keep the game playable when a screen is absent.
import { CITY, PALETTE } from './config.js';

function element(id) {
  return typeof document === 'undefined' ? null : document.getElementById(id);
}

function context2d(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

export function createHud() {
  const hud = {
    root: element('hud'),
    healthFill: element('health-fill'),
    healthText: element('health-text'),
    cash: element('cash-value'),
    stars: element('wanted-stars'),
    speed: element('speed-value'),
    speedBox: element('speed-box'),
    objective: element('objective-text'),
    objectiveBox: element('objective-box'),
    toasts: element('toasts'),
    minimap: element('minimap'),
    zone: element('zone-label'),
    missionList: element('mission-list'),
    dialogue: element('dialogue'),
    dialogueText: element('dialogue-text'),
    subtitle: element('subtitle'),
    hint: element('hint'),
  };
  const cache = {
    health: null,
    healthPercent: null,
    cash: null,
    stars: null,
    speed: null,
    inCar: null,
    objective: null,
    dialogue: null,
  };
  const mapContext = context2d(hud.minimap);

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setHealth(value, max) {
    const health = Number.isFinite(value) ? Math.max(0, value) : 0;
    const maximum = Number.isFinite(max) && max > 0 ? max : 1;
    const rounded = Math.round(health);
    const percent = Math.max(0, Math.min(100, (health / maximum) * 100));
    if (rounded !== cache.health) {
      cache.health = rounded;
      setText(hud.healthText, String(rounded));
    }
    if (percent !== cache.healthPercent) {
      cache.healthPercent = percent;
      if (hud.healthFill) {
        hud.healthFill.style.width = percent + '%';
        hud.healthFill.style.background = percent < 28
          ? PALETTE.css.coral
          : percent < 55 ? PALETTE.css.gold : PALETTE.css.teal;
      }
    }
  }

  function setMoney(value) {
    const amount = Number.isFinite(value) ? Math.round(value) : 0;
    if (amount === cache.cash) return;
    cache.cash = amount;
    setText(hud.cash, '$' + amount.toLocaleString('en-US'));
  }

  function setWanted(stars) {
    const count = Number.isFinite(stars) ? Math.max(0, Math.min(5, Math.round(stars))) : 0;
    if (count === cache.stars) return;
    cache.stars = count;
    if (!hud.stars) return;
    hud.stars.replaceChildren();
    for (let index = 1; index <= 5; index += 1) {
      const star = document.createElement('span');
      star.className = 'star' + (index <= count ? ' lit' : '');
      star.textContent = '★';
      hud.stars.appendChild(star);
    }
    hud.stars.classList.toggle('active', count > 0);
    hud.stars.setAttribute('aria-label', count + ' wanted stars');
  }

  function setSpeed(speed, inCar) {
    const value = Number.isFinite(speed) ? Math.max(0, Math.round(Math.abs(speed) * 3.6)) : 0;
    const driving = Boolean(inCar);
    if (value === cache.speed && driving === cache.inCar) return;
    cache.speed = value;
    cache.inCar = driving;
    if (hud.speedBox) hud.speedBox.style.display = driving ? 'flex' : 'none';
    setText(hud.speed, driving ? value + ' KM/H' : '');
  }

  function setMission(mission, objective) {
    let text = objective;
    if (text == null) {
      if (typeof mission === 'string') text = mission;
      else if (mission && typeof mission === 'object') {
        text = mission.briefing || mission.objective || mission.title || '';
      } else {
        text = '';
      }
    }
    text = typeof text === 'string' ? text : String(text);
    if (text === cache.objective) return;
    cache.objective = text;
    if (hud.objectiveBox) hud.objectiveBox.style.display = text ? 'block' : 'none';
    setText(hud.objective, text);
  }

  function toast(message, kind = 'info', seconds = 3.4) {
    if (!hud.toasts || typeof document === 'undefined') return null;
    const node = document.createElement('div');
    const safeKind = ['info', 'mission', 'danger'].includes(kind) ? kind : 'info';
    node.className = 'toast ' + safeKind;
    node.textContent = String(message ?? '');
    hud.toasts.appendChild(node);
    while (hud.toasts.childElementCount > 5) hud.toasts.firstElementChild?.remove();

    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : 3400;
    const schedule = typeof window !== 'undefined' && window.setTimeout
      ? window.setTimeout.bind(window)
      : typeof setTimeout === 'function' ? setTimeout : null;
    if (schedule) {
      schedule(() => {
        node.classList.add('fade');
        schedule(() => node.remove(), 500);
      }, duration);
    }
    return node;
  }

  function setDialogue(speaker, line) {
    const name = typeof speaker === 'string' ? speaker : '';
    const text = typeof line === 'string' ? line : '';
    const key = name + '|' + text;
    if (key === cache.dialogue) return;
    cache.dialogue = key;
    if (!hud.dialogue) return;
    if (!text) {
      hud.dialogue.style.display = 'none';
      if (hud.dialogueText) hud.dialogueText.replaceChildren();
      return;
    }
    hud.dialogue.style.display = 'block';
    if (hud.dialogueText) {
      hud.dialogueText.replaceChildren();
      const strong = document.createElement('strong');
      strong.textContent = name;
      hud.dialogueText.append(strong, document.createTextNode(' ' + text));
    }
  }

  function setHint(text) {
    setText(hud.hint, text ? String(text) : '');
  }

  function setZone(text) {
    setText(hud.zone, text ? String(text) : '');
  }

  function showMissionList(missions, activeIndex) {
    if (!hud.missionList) return;
    hud.missionList.replaceChildren();
    const list = Array.isArray(missions) ? missions : [];
    for (let index = 0; index < list.length; index += 1) {
      const mission = list[index] || {};
      const row = document.createElement('div');
      row.className = 'mission-row' +
        (mission.completed ? ' done' : '') +
        (index === activeIndex ? ' active' : '');
      const number = document.createElement('span');
      number.className = 'mission-index';
      number.textContent = mission.completed ? '✓' : String(index + 1);
      const label = document.createElement('span');
      label.className = 'mission-name';
      label.textContent = String(mission.title ?? '');
      const reward = document.createElement('span');
      reward.className = 'mission-reward';
      reward.textContent = '$' + String(Number.isFinite(mission.reward) ? mission.reward : 0);
      row.append(number, label, reward);
      hud.missionList.appendChild(row);
    }
    hud.missionList.classList.add('open');
  }

  function hideMissionList() {
    hud.missionList?.classList.remove('open');
  }

  function toggleMissionList(missions, activeIndex) {
    if (!hud.missionList) return;
    if (hud.missionList.classList.contains('open')) hideMissionList();
    else showMissionList(missions, activeIndex);
  }

  function drawMinimap(player, wanted, missions, blips, cameraYaw, extras) {
    if (!mapContext || !hud.minimap || !player?.state) return;
    const width = hud.minimap.width;
    const height = hud.minimap.height;
    if (!(width > 0 && height > 0)) return;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 0.105;
    const actor = player.state.inCar ? player.state.inCar.state : player.state;
    const heading = Number.isFinite(cameraYaw) ? cameraYaw : actor.heading || 0;

    mapContext.save();
    mapContext.clearRect(0, 0, width, height);
    mapContext.beginPath();
    mapContext.arc(centerX, centerY, Math.min(width, height) / 2 - 2, 0, Math.PI * 2);
    mapContext.clip();
    mapContext.fillStyle = 'rgba(22, 30, 39, 0.92)';
    mapContext.fillRect(0, 0, width, height);
    mapContext.translate(centerX, centerY);
    // Camera-forward is up; at yaw zero, world -X is screen-right.
    mapContext.rotate(heading);
    mapContext.scale(-scale, -scale);
    mapContext.translate(-actor.x, -actor.z);

    if (extras?.rural) {
      const { minX, maxX, minZ, maxZ } = extras.rural;
      mapContext.fillStyle = '#30472e';
      mapContext.fillRect(minX, minZ, maxX - minX, maxZ - minZ);
    }
    if (Array.isArray(extras?.dirtRoads)) {
      mapContext.fillStyle = '#aa794f';
      for (const { minX, maxX, minZ, maxZ } of extras.dirtRoads) {
        mapContext.fillRect(minX, minZ, maxX - minX, maxZ - minZ);
      }
    }

    mapContext.fillStyle = 'rgba(132, 140, 145, 0.5)';
    const pitch = CITY.pitch;
    const road = CITY.road;
    for (let line = 0; line <= CITY.grid; line += 1) {
      const offset = CITY.nodeMin + line * pitch;
      mapContext.fillRect(offset - road / 2, CITY.nodeMin - road / 2, road, CITY.grid * pitch + road);
      mapContext.fillRect(CITY.nodeMin - road / 2, offset - road / 2, CITY.grid * pitch + road, road);
    }
    mapContext.fillStyle = 'rgba(83, 103, 80, 0.5)';
    for (const block of CITY.parkBlocks) {
      mapContext.fillRect(CITY.nodeMin + (block[0] + 0.5) * pitch - 20, CITY.nodeMin + (block[1] + 0.5) * pitch - 20, 40, 40);
    }
    mapContext.fillStyle = 'rgba(44, 120, 138, 0.55)';
    mapContext.fillRect(-CITY.oceanWidth / 2, CITY.oceanStart, CITY.oceanWidth, 1600);
    mapContext.fillStyle = 'rgba(196, 172, 120, 0.4)';
    mapContext.fillRect(-CITY.oceanWidth / 2, CITY.beachStart, CITY.oceanWidth, CITY.beachEnd - CITY.beachStart);

    if (Array.isArray(missions)) {
      for (const mission of missions) {
        if (!mission?.marker || mission.completed) continue;
        mapContext.fillStyle = mission.active ? PALETTE.css.gold : PALETTE.css.teal;
        mapContext.beginPath();
        mapContext.arc(mission.marker.x, mission.marker.z, 26, 0, Math.PI * 2);
        mapContext.fill();
      }
    }
    if (Array.isArray(blips)) {
      for (const blip of blips) {
        if (!Number.isFinite(blip?.x) || !Number.isFinite(blip?.z)) continue;
        if (Array.isArray(extras?.landmarks) && extras.landmarks.some((landmark) =>
          landmark?.x === blip.x && landmark?.z === blip.z && landmark?.color === blip.color)) continue;
        mapContext.fillStyle = blip.color || PALETTE.css.teal;
        mapContext.beginPath();
        mapContext.arc(blip.x, blip.z, Number.isFinite(blip.size) ? blip.size : 22, 0, Math.PI * 2);
        mapContext.fill();
      }
    }
    if (Array.isArray(extras?.landmarks)) {
      for (const landmark of extras.landmarks) {
        if (!Number.isFinite(landmark?.x) || !Number.isFinite(landmark?.z)) continue;
        mapContext.fillStyle = landmark.color || (landmark.visited ? PALETTE.css.teal : PALETTE.css.gold);
        mapContext.beginPath();
        mapContext.arc(landmark.x, landmark.z, Number.isFinite(landmark.size) ? landmark.size : 15, 0, Math.PI * 2);
        mapContext.fill();
      }
    }
    mapContext.restore();

    mapContext.save();
    mapContext.translate(centerX, centerY);
    mapContext.rotate(heading - (actor.heading || 0));
    mapContext.fillStyle = PALETTE.css.gold;
    mapContext.beginPath();
    mapContext.moveTo(0, -7);
    mapContext.lineTo(5.5, 6);
    mapContext.lineTo(0, 3);
    mapContext.lineTo(-5.5, 6);
    mapContext.closePath();
    mapContext.fill();
    mapContext.restore();

    mapContext.strokeStyle = 'rgba(255, 236, 200, 0.35)';
    mapContext.lineWidth = 2;
    mapContext.beginPath();
    mapContext.arc(centerX, centerY, Math.min(width, height) / 2 - 2, 0, Math.PI * 2);
    mapContext.stroke();
  }

  function setVisible(visible) {
    if (hud.root) {
      hud.root.style.display = visible ? '' : 'none';
      hud.root.setAttribute('aria-hidden', String(!visible));
    }
  }

  return {
    hud,
    setHealth,
    setMoney,
    setCash: setMoney,
    setWanted,
    setSpeed,
    setMission,
    setObjective: setMission,
    toast,
    setDialogue,
    setHint,
    setZone,
    showMissionList,
    hideMissionList,
    toggleMissionList,
    drawMinimap,
    setVisible,
    show() { setVisible(true); },
    hide() { setVisible(false); },
  };
}
