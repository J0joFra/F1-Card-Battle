"""Avatar a cartone dei piloti, dalle foto libere di Wikimedia Commons (src/data/portraits.json).

Per ogni foto: ritaglia il volto (OpenCV), lo trasforma in disegno (AnimeGANv2 "face_paint_512_v2"),
toglie lo sfondo (rembg) e salva public/avatars/<id-pilota>.webp (256 px, sfondo trasparente).
L'elenco dei piloti con avatar va in src/data/avatars.json.
Gli avatar sono opere derivate delle foto: restano con la licenza e l'autore della foto (vedi portraits.json).

Uso: python scripts/make-avatars.py [--only id1,id2] [--force]
"""
import argparse
import io
import json
import os
import re
import sys
import time

import cv2
import numpy as np
import requests
import torch
from PIL import Image
from rembg import new_session, remove

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTRAITS = os.path.join(ROOT, "src/data/portraits.json")
OUT_DIR = os.path.join(ROOT, "public/avatars")
INDEX = os.path.join(ROOT, "src/data/avatars.json")
UA = "F1CardBattle/1.0 (https://github.com/J0joFra/F1-Card-Battle)"  # richiesto da Wikimedia
SIZE = 256

parser = argparse.ArgumentParser()
parser.add_argument("--only", default="")
parser.add_argument("--force", action="store_true")
args = parser.parse_args()

portraits = json.load(open(PORTRAITS, encoding="utf-8"))
only = set(filter(None, args.only.split(",")))
os.makedirs(OUT_DIR, exist_ok=True)

torch.set_grad_enabled(False)
model = torch.hub.load("bryandlee/animegan2-pytorch:main", "generator", pretrained="face_paint_512_v2").eval()
bg_session = new_session("u2net_human_seg")
faces = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
http = requests.Session()
http.headers["User-Agent"] = UA


def bigger_thumb(url: str) -> str:
    # miniatura più grande (640 px) per un ritaglio del volto più nitido
    return re.sub(r"/(\d+)px-", "/640px-", url) if "/thumb/" in url else url


def crop_face(img: Image.Image) -> Image.Image:
    """Quadrato attorno al volto più grande (con spalle e capelli); senza volto, la parte alta al centro."""
    w, h = img.size
    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    found = faces.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(max(24, w // 20), max(24, w // 20)))
    if len(found):
        x, y, fw, fh = max(found, key=lambda f: f[2] * f[3])
        side = int(max(fw, fh) * 2.3)
        cx, cy = x + fw // 2, y + int(fh * 0.62)
    else:
        side = min(w, h)
        cx, cy = w // 2, side // 2
    side = min(side, w, h)
    left = min(max(0, cx - side // 2), w - side)
    top = min(max(0, cy - side // 2), h - side)
    return img.crop((left, top, left + side, top + side))


def cartoon(img: Image.Image) -> Image.Image:
    x = torch.from_numpy(np.asarray(img.resize((512, 512), Image.LANCZOS))).permute(2, 0, 1).float() / 127.5 - 1
    y = model(x.unsqueeze(0))[0].clamp(-1, 1)
    return Image.fromarray(((y.permute(1, 2, 0).numpy() + 1) * 127.5).astype(np.uint8))


done, failed = [], []
for i, (driver_id, p) in enumerate(sorted(portraits.items())):
    if only and driver_id not in only:
        continue
    out = os.path.join(OUT_DIR, f"{driver_id}.webp")
    if os.path.exists(out) and not args.force:
        done.append(driver_id)
        continue
    try:
        res = http.get(bigger_thumb(p["thumb"]), timeout=30)
        if res.status_code == 404:
            res = http.get(p["thumb"], timeout=30)
        res.raise_for_status()
        photo = Image.open(io.BytesIO(res.content)).convert("RGB")
        face = crop_face(photo).resize((512, 512), Image.LANCZOS)
        drawn = cartoon(face)
        mask = remove(face, session=bg_session, only_mask=True).convert("L")  # sfondo tolto dalla foto originale
        drawn.putalpha(mask.resize(drawn.size))
        drawn.resize((SIZE, SIZE), Image.LANCZOS).save(out, "WEBP", quality=82, method=6)
        done.append(driver_id)
        print(f"[{i + 1}/{len(portraits)}] {driver_id}", flush=True)
    except Exception as e:  # una foto che non va non ferma le altre
        failed.append(f"{driver_id}: {e}")
    time.sleep(0.2)

ids = sorted(f[:-5] for f in os.listdir(OUT_DIR) if f.endswith(".webp"))
json.dump(ids, open(INDEX, "w", encoding="utf-8"))
print(f"{len(ids)} avatar in {OUT_DIR}")
if failed:
    print("Non riusciti:\n  " + "\n  ".join(failed))
