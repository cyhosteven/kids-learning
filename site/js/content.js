// 讀 content/*.csv。內容和程式分開：增修單字只改 CSV。

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

export async function loadItems(theme) {
  const res = await fetch("./content/items.csv");
  if (!res.ok) throw new Error(`讀不到內容（${res.status}）`);
  return parseCsv((await res.text()).replace(/^﻿/, ""))
    .filter((it) => !theme || it.theme === theme)
    .map((it) => ({ ...it, level: Number(it.level) || 1 }));
}

/** image 欄位：emoji:🦁 或 img:檔名（放在 content/images/）。 */
export function renderPicture(item, el) {
  el.textContent = "";
  const [kind, value] = item.image.split(/:(.*)/s);
  if (kind === "img") {
    const img = document.createElement("img");
    img.src = `./content/images/${value}`;
    img.alt = "";
    img.draggable = false;
    el.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.className = "emoji";
    span.textContent = value || "❓";
    el.appendChild(span);
  }
}
