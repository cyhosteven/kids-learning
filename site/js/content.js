// 讀 content/*.csv。內容和程式分開：增修單字只改 CSV（再跑 tools/make_audio.py 產生音檔）。

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

async function csv(name) {
  const res = await fetch(`./content/${name}`);
  if (!res.ok) throw new Error(`讀不到 ${name}（${res.status}）`);
  return parseCsv((await res.text()).replace(/^﻿/, ""));
}

export async function loadContent() {
  const [units, items] = await Promise.all([csv("units.csv"), csv("items.csv")]);
  const list = items.map((it, i) => ({ ...it, level: Number(it.level) || 1, order: i }));
  const byUnit = new Map(units.map((u) => [u.id, []]));
  for (const it of list) if (byUnit.has(it.unit)) byUnit.get(it.unit).push(it);
  return {
    units: units.map((u) => ({ ...u, order: Number(u.order) || 0, items: byUnit.get(u.id) }))
      .filter((u) => u.items.length)
      .sort((a, b) => a.order - b.order),
    items: list,
  };
}

/** image 欄位：emoji:🦁、color:#hex、count:3、img:檔名（content/images/）。 */
export function renderPicture(item, el) {
  el.textContent = "";
  const [kind, value = ""] = item.image.split(/:(.*)/s);
  el.classList.toggle("photo", kind === "img");
  if (kind === "img") {
    const img = document.createElement("img");
    img.src = `./content/images/${value}`;
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    el.appendChild(img);
  } else if (kind === "color") {
    const blob = document.createElement("span");
    blob.className = "swatch";
    blob.style.background = value;
    el.appendChild(blob);
  } else if (kind === "count") {
    const n = Math.max(1, Math.min(10, Number(value) || 1));
    const box = document.createElement("span");
    box.className = `count count-${n}`;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.textContent = "⭐";
      box.appendChild(s);
    }
    el.appendChild(box);
  } else {
    const span = document.createElement("span");
    span.className = "emoji";
    span.textContent = value || "❓";
    el.appendChild(span);
  }
}

/** 給家長頁、首頁的小圖示（文字）。 */
export function pictureText(item) {
  const [kind, value = ""] = item.image.split(/:(.*)/s);
  if (kind === "emoji") return value;
  if (kind === "count") return "⭐×" + value;
  if (kind === "color") return "●";
  return "🖼️";
}
