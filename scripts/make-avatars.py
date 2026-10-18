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
model = torch.hub.load(
    "bryandlee/animegan2-pytorch:main", "generator", pretrained="face_paint_512_v2", trust_repo=True
).eval()
bg_session = new_session("u2net_human_seg")
# rilevatore di volti YuNet (OpenCV Zoo): preciso anche con foto piccole, di profilo o in bianco e nero
YUNET_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
YUNET = os.path.expanduser("~/.cache/yunet.onnx")
if not os.path.exists(YUNET):
    os.makedirs(os.path.dirname(YUNET), exist_ok=True)
    data = requests.get(YUNET_URL, timeout=60).content
    if len(data) < 100_000:
        sys.exit("modello YuNet non scaricato")
    open(YUNET, "wb").write(data)
detector = cv2.FaceDetectorYN.create(YUNET, "", (320, 320), 0.75)


def best_face(img: Image.Image):
    """(x, y, w, h, punteggio) del volto più grande, o None."""
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    h, w = arr.shape[:2]
    detector.setInputSize((w, h))
    _, found = detector.detect(arr)
    if found is None or not len(found):
        return None
    f = max(found, key=lambda f: f[2] * f[3])
    return int(f[0]), int(f[1]), int(f[2]), int(f[3]), float(f[-1])
http = requests.Session()
http.headers["User-Agent"] = UA


def bigger_thumb(url: str) -> str:
    # miniatura più grande (500 px, una delle larghezze ammesse da Wikimedia) per un volto più nitido
    return re.sub(r"/(\d+)px-", "/500px-", url) if "/thumb/" in url else url


def crop_face(img: Image.Image) -> Image.Image | None:
    """Quadrato attorno al volto più grande (con spalle e capelli); None se non c'è un volto riconoscibile."""
    w, h = img.size
    face = best_face(img)
    if face is None or face[2] < 28:
        return None  # foto senza un volto chiaro (es. pilota in macchina): resta l'avatar disegnato
    x, y, fw, fh, _ = face
    side = int(max(fw, fh) * 2.3)
    cx, cy = x + fw // 2, y + int(fh * 0.62)
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
        if 400 <= res.status_code < 500:  # misura non disponibile: si usa la miniatura nota
            res = http.get(p["thumb"], timeout=30)
        res.raise_for_status()
        photo = Image.open(io.BytesIO(res.content)).convert("RGB")
        face = crop_face(photo)
        if face is None:
            raise ValueError("nessun volto riconoscibile")
        face = face.resize((512, 512), Image.LANCZOS)
        drawn = cartoon(face)
        mask = remove(face, session=bg_session, only_mask=True).convert("L")  # sfondo tolto dalla foto originale
        check = best_face(drawn)  # nel disegno finale il volto deve essere ancora riconoscibile
        if check is None or check[2] < 90:
            raise ValueError("volto non riconoscibile nel disegno")
        coverage = np.asarray(mask).mean() / 255
        if not 0.15 < coverage < 0.97:  # persona non trovata (quasi tutto trasparente) o sfondo non tolto
            raise ValueError(f"ritaglio non riuscito ({coverage:.0%} della figura)")
        drawn.putalpha(mask.resize(drawn.size))
        drawn.resize((SIZE, SIZE), Image.LANCZOS).save(out, "WEBP", quality=82, method=6)
        done.append(driver_id)
        print(f"[{i + 1}/{len(portraits)}] {driver_id}", flush=True)
    except Exception as e:  # una foto che non va non ferma le altre
        failed.append(f"{driver_id}: {e}")
    time.sleep(0.2)

if args.force or only:  # avatar non più validi (es. foto senza volto) tolti
    for f in failed:
        stale = os.path.join(OUT_DIR, f.split(":")[0] + ".webp")
        if os.path.exists(stale):
            os.remove(stale)
ids = sorted(f[:-5] for f in os.listdir(OUT_DIR) if f.endswith(".webp"))
json.dump(ids, open(INDEX, "w", encoding="utf-8"))
print(f"{len(ids)} avatar in {OUT_DIR}")
if failed:
    print("Non riusciti:\n  " + "\n  ".join(failed))
