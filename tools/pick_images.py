"""挑選真實照片（公開授權）：搜尋 → 候選縮圖表 → 人工挑選 → 裁切壓縮 → 記錄作者與授權。

來源：Openverse（https://openverse.org，彙整 Flickr、Wikimedia Commons 等的 CC 授權圖片）。
只收 CC0、公有領域（PDM）、CC BY、CC BY-SA；每張都記下作者、授權、原始網址。

用法（在專案根目錄，用一般的 python 即可）：
  python tools/pick_images.py search [id ...]   搜尋候選（全部或指定 id），縮圖存在 .images/cand/
  python tools/pick_images.py sheets            產生縮圖表 .images/sheets/sheet_XX.png（每列一個字、編號 0～7）
  python tools/pick_images.py fluent            身體單元改用 Microsoft Fluent Emoji 3D 插圖（MIT），不用真人照片
  python tools/pick_images.py build             依 tools/image_picks.json 下載原圖、裁成正方形、存 site/content/images/<id>.webp，
                                                並更新 items.csv 的 image 欄與 site/content/credits.json
image_picks.json 格式：{"lion": 2, "bear": [5, {"x": 0.5, "y": 0.4, "zoom": 1.2}]}
  數字＝候選編號；第二個元素可選，指定裁切中心（0～1）與放大倍率。
"""
import csv
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "site", "content")
WORK = os.path.join(ROOT, ".images")
CAND = os.path.join(WORK, "cand")
PICKS = os.path.join(ROOT, "tools", "image_picks.json")
UA = {"User-Agent": "kids-learning-image-picker/0.1 (educational, non-commercial)"}
LICENSES = "cc0,pdm,by,by-sa"
N_CAND = 8
SKIP_UNITS = {"color", "number"}          # 顏色用色塊、數字用星星（照片容易混淆）
OUT_SIZE = 384

# 身體部位不用真人照片（隱私、搜尋結果常不適合小孩）：改用 Microsoft Fluent Emoji 3D 插圖（MIT）
FLUENT_BASE = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/"
FLUENT = {
    "eyes": "Eyes/3D/eyes_3d.png", "ear": "Ear/Default/3D/ear_3d_default.png",
    "nose": "Nose/Default/3D/nose_3d_default.png", "mouth": "Mouth/3D/mouth_3d.png",
    "hand": "Raised hand/Default/3D/raised_hand_3d_default.png", "foot": "Foot/Default/3D/foot_3d_default.png",
    "tooth": "Tooth/3D/tooth_3d.png", "leg": "Leg/Default/3D/leg_3d_default.png",
    "arm": "Flexed biceps/Default/3D/flexed_biceps_3d_default.png",
    # 玩具、衣服：照片多半是穿著衣服的人或商品廣告，甚至有受版權保護的卡通角色 → 也用 3D 插圖（同單元風格一致）
    "ball": "Soccer ball/3D/soccer_ball_3d.png", "teddy_bear": "Teddy bear/3D/teddy_bear_3d.png",
    "balloon": "Balloon/3D/balloon_3d.png", "kite": "Kite/3D/kite_3d.png", "robot": "Robot/3D/robot_3d.png",
    "drum": "Drum/3D/drum_3d.png", "puzzle": "Puzzle piece/3D/puzzle_piece_3d.png",
    "hat": "Billed cap/3D/billed_cap_3d.png", "t_shirt": "T-shirt/3D/t-shirt_3d.png", "dress": "Dress/3D/dress_3d.png",
    "shoes": "Running shoe/3D/running_shoe_3d.png", "socks": "Socks/3D/socks_3d.png", "coat": "Coat/3D/coat_3d.png",
    "glasses": "Glasses/3D/glasses_3d.png", "pants": "Jeans/3D/jeans_3d.png",
    # 家裡：照片多是建築、人物，浴缸甚至有不適合小孩的畫面 → 3D 插圖
    "bed": "Bed/3D/bed_3d.png", "chair": "Chair/3D/chair_3d.png", "door": "Door/3D/door_3d.png",
    "cup": "Hot beverage/3D/hot_beverage_3d.png", "book": "Open book/3D/open_book_3d.png",
    "clock": "Alarm clock/3D/alarm_clock_3d.png", "window": "Window/3D/window_3d.png", "key": "Key/3D/key_3d.png",
    "bath": "Bathtub/3D/bathtub_3d.png",
    # 太陽、星星：照片是逆光剪影或一片黑色夜空，4～5 歲認不出來
    "sun": "Sun/3D/sun_3d.png", "star": "Star/3D/star_3d.png",
    # 海洋：章魚照片找不到、蝦子都是料理、搜 squid 得到的是花枝
    "octopus": "Octopus/3D/octopus_3d.png", "shrimp": "Shrimp/3D/shrimp_3d.png", "squid": "Squid/3D/squid_3d.png",
    # 成品檢查時發現：鯊魚照片太暗、彩虹太淡、下雨只是水面漣漪，小孩認不出來
    "shark": "Shark/3D/shark_3d.png", "rainbow": "Rainbow/3D/rainbow_3d.png",
    "rain": "Cloud with rain/3D/cloud_with_rain_3d.png",
}
SKIP_UNITS = SKIP_UNITS | {"body", "toy", "clothes", "home"}

# 搜尋字（預設用英文字）；選比較容易拿到「單一主體、清楚」照片的說法
QUERY = {
    "bear": "brown bear", "panda": "giant panda", "hippo": "hippopotamus", "camel": "camel desert",
    "parrot": "macaw parrot", "rhino": "rhinoceros", "fox": "red fox", "deer": "deer",
    "dog": "puppy", "chicken": "hen chicken", "mouse": "mouse rodent", "sheep": "sheep lamb",
    "apple": "red apple fruit", "banana": "bananas fruit", "orange": "orange fruit", "grapes": "grapes fruit",
    "peach": "peach fruit", "pear": "pear fruit", "lemon": "lemon fruit", "cherry": "cherries fruit",
    "mango": "mango fruit", "watermelon": "watermelon slice",
    "eyes": "eye close up", "ear": "human ear", "nose": "human nose", "mouth": "smiling lips",
    "hand": "open hand palm", "foot": "bare foot", "tooth": "tooth", "leg": "legs walking", "arm": "arm",
    "bread": "loaf of bread", "milk": "glass of milk", "rice": "bowl of rice", "cake": "cake slice",
    "cookie": "chocolate chip cookie", "ice_cream": "ice cream cone", "juice": "orange juice glass",
    "carrot": "carrots", "corn": "corn cob",
    "car": "red car", "bus": "bus", "train": "passenger train", "plane": "airplane flying", "boat": "sailboat",
    "bike": "bicycle", "taxi": "yellow taxi", "rocket": "rocket launch",
    "fish": "tropical fish", "whale": "humpback whale", "seal": "harbor seal",
    "ball": "soccer ball", "balloon": "balloons", "kite": "kite flying", "robot": "toy robot", "puzzle": "jigsaw puzzle",
    "hat": "sun hat", "t_shirt": "t-shirt", "shoes": "sneakers", "glasses": "eyeglasses", "pants": "jeans",
    "sun": "sun sky", "moon": "full moon", "star": "starry night sky", "cloud": "white cloud blue sky",
    "cup": "coffee mug", "bath": "bathtub", "window": "window", "key": "key",
}


# 第一次搜尋結果不合適，換成更精準的關鍵字重搜（v0.3 挑選時發現）
QUERY.update({
    "monkey": "macaque monkey", "kangaroo": "red kangaroo", "koala": "koala eucalyptus",
    "peacock": "peacock feathers bird", "cow": "holstein cow", "pig": "domestic pig farm",
    "frog": "green tree frog", "banana": "banana bunch", "strawberry": "strawberries red",
    "bread": "bread loaf bakery", "egg": "brown eggs", "ice_cream": "ice cream cone",
    "cheese": "cheese wedge", "bus": "city bus street", "bike": "bicycle parked",
    "shark": "shark swimming underwater", "octopus": "octopus underwater", "shrimp": "shrimp prawn",
    "squid": "squid underwater", "tree": "single tree green field",
    "banana": "yellow banana fruit", "ice_cream": "ice cream scoops", "cheese": "swiss cheese",
    "bus": "public transit bus",
})


def read_items():
    with open(os.path.join(CONTENT, "items.csv"), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def get(url, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def small_url(url):
    """縮圖網址：Flickr 換成 320px；Wikimedia 用 thumb；其他照原圖。"""
    m = re.match(r"(https://live\.staticflickr\.com/.+?_[0-9a-f]+)(?:_[a-z])?\.jpg$", url)
    if m:
        return m.group(1) + "_n.jpg"
    m = re.match(r"https://upload\.wikimedia\.org/wikipedia/commons/(\w)/(\w\w)/(.+)$", url)
    if m:
        a, ab, name = m.groups()
        return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{a}/{ab}/{name}/400px-{name}"
    return url


def search(ids):
    os.makedirs(CAND, exist_ok=True)
    meta_path = os.path.join(WORK, "candidates.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    items = [it for it in read_items() if it["unit"] not in SKIP_UNITS and (not ids or it["id"] in ids)]
    for it in items:
        q = QUERY.get(it["id"], it["英文"])
        url = ("https://api.openverse.org/v1/images/?" + urllib.parse.urlencode({
            "q": q, "license": LICENSES, "category": "photograph", "page_size": 20, "mature": "false",
        }))
        for attempt in range(5):
            try:
                data = json.loads(get(url))
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    print("  （請求太快，等 30 秒）")
                    time.sleep(30)
                    continue
                raise
        results = [r for r in data.get("results", []) if (r.get("width") or 0) >= 400 and (r.get("height") or 0) >= 400]
        cands = []
        for r in results:
            if len(cands) >= N_CAND:
                break
            try:
                raw = get(small_url(r["url"]))
                img = Image.open(io.BytesIO(raw)).convert("RGB")
            except Exception:
                continue
            k = len(cands)
            img.thumbnail((400, 400))
            img.save(os.path.join(CAND, f"{it['id']}_{k}.jpg"), quality=85)
            cands.append({k2: r.get(k2) for k2 in (
                "id", "title", "url", "creator", "creator_url", "license", "license_version",
                "license_url", "foreign_landing_url", "source", "width", "height")})
        meta[it["id"]] = {"query": q, "cands": cands}
        json.dump(meta, open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{it['id']}: {len(cands)} 張（{q}）")
        time.sleep(3.2)                     # 匿名額度：每分鐘 20 次


def sheets(only=None):
    meta = json.load(open(os.path.join(WORK, "candidates.json"), encoding="utf-8"))
    out = os.path.join(WORK, "sheets_redo" if only else "sheets")
    os.makedirs(out, exist_ok=True)
    ids = [it["id"] for it in read_items() if it["id"] in meta and (not only or it["id"] in only)]
    tile, label_w, per = 150, 150, 6
    try:
        font = ImageFont.truetype("msjh.ttc", 22)
        small = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = small = ImageFont.load_default()
    names = {it["id"]: f"{it['id']}\n{it['華語']}" for it in read_items()}
    for s in range(0, len(ids), per):
        chunk = ids[s:s + per]
        sheet = Image.new("RGB", (label_w + N_CAND * (tile + 6), len(chunk) * (tile + 8)), "white")
        d = ImageDraw.Draw(sheet)
        for r, iid in enumerate(chunk):
            y = r * (tile + 8)
            d.multiline_text((6, y + 40), names[iid], fill="black", font=font)
            for k in range(len(meta[iid]["cands"])):
                p = os.path.join(CAND, f"{iid}_{k}.jpg")
                if not os.path.exists(p):
                    continue
                im = ImageOps.fit(Image.open(p), (tile, tile))
                x = label_w + k * (tile + 6)
                sheet.paste(im, (x, y))
                d.rectangle([x, y, x + 24, y + 24], fill="black")
                d.text((x + 6, y + 2), str(k), fill="white", font=small)
        path = os.path.join(out, f"sheet_{s // per:02d}.png")
        sheet.save(path)
        print(path, ", ".join(chunk))


def crop_square(img, center=(0.5, 0.5), zoom=1.0):
    w, h = img.size
    side = min(w, h) / max(zoom, 1.0)
    cx, cy = center[0] * w, center[1] * h
    x0 = min(max(cx - side / 2, 0), w - side)
    y0 = min(max(cy - side / 2, 0), h - side)
    return img.crop((round(x0), round(y0), round(x0 + side), round(y0 + side)))


def load_credits():
    p = os.path.join(CONTENT, "credits.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def save_credits_and_csv(credits, ids):
    with open(os.path.join(CONTENT, "credits.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(credits, f, ensure_ascii=False, indent=1)
    rows = read_items()
    for r in rows:
        if r["id"] in ids:
            r["image"] = f"img:{r['id']}.webp"
    with open(os.path.join(CONTENT, "items.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def fluent():
    out_dir = os.path.join(CONTENT, "images")
    os.makedirs(out_dir, exist_ok=True)
    credits = load_credits()
    for iid, path in FLUENT.items():
        img = Image.open(io.BytesIO(get(FLUENT_BASE + urllib.parse.quote(path)))).convert("RGBA")
        canvas = Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (255, 253, 246, 255))     # 與圖卡底色相同
        art = img.resize((int(OUT_SIZE * 0.8), int(OUT_SIZE * 0.8)), Image.LANCZOS)
        canvas.alpha_composite(art, ((OUT_SIZE - art.width) // 2, (OUT_SIZE - art.height) // 2))
        canvas.convert("RGB").save(os.path.join(out_dir, f"{iid}.webp"), "WEBP", quality=85, method=6)
        credits[iid] = {
            "title": path.split("/")[0], "creator": "Microsoft (Fluent Emoji)",
            "creator_url": "https://github.com/microsoft/fluentui-emoji", "license": "mit", "license_version": "",
            "license_url": "https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE",
            "source_url": "https://github.com/microsoft/fluentui-emoji", "source": "github",
            "modified": "placed on a light background and resized",
        }
        print(iid)
    save_credits_and_csv(credits, set(FLUENT))


def build():
    meta = json.load(open(os.path.join(WORK, "candidates.json"), encoding="utf-8"))
    picks = json.load(open(PICKS, encoding="utf-8"))
    out_dir = os.path.join(CONTENT, "images")
    os.makedirs(out_dir, exist_ok=True)
    credits = load_credits()
    for iid, pick in picks.items():
        k, opt = (pick[0], pick[1] if len(pick) > 1 else {}) if isinstance(pick, list) else (pick, {})
        c = meta[iid]["cands"][k]
        path = os.path.join(out_dir, f"{iid}.webp")
        if not os.path.exists(path) or opt.get("force"):
            raw = get(c["url"])
            img = Image.open(io.BytesIO(raw))
            img = ImageOps.exif_transpose(img).convert("RGB")
            img = crop_square(img, (opt.get("x", 0.5), opt.get("y", 0.5)), opt.get("zoom", 1.0))
            img = img.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
            img.save(path, "WEBP", quality=80, method=6)
            print(f"{iid}: {os.path.getsize(path) // 1024} KB")
        credits[iid] = {
            "title": c.get("title") or "", "creator": c.get("creator") or "unknown",
            "creator_url": c.get("creator_url") or "", "license": c.get("license"),
            "license_version": c.get("license_version") or "", "license_url": c.get("license_url") or "",
            "source_url": c.get("foreign_landing_url") or c.get("url"), "source": c.get("source") or "",
            "modified": "cropped to a square and resized",
        }
    save_credits_and_csv(credits, set(picks))
    total = sum(os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir))
    print(f"共 {len(picks)} 張，{total / 1e6:.1f} MB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "search":
        search(set(sys.argv[2:]))
    elif cmd == "sheets":
        sheets(set(sys.argv[2:]))
    elif cmd == "fluent":
        fluent()
    elif cmd == "build":
        build()
    else:
        print(__doc__)
