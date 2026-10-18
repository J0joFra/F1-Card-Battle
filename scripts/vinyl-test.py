"""Prova: figure in vinile (testa grande, stile da collezione) dei piloti, dalle foto libere di Wikimedia Commons.

Stable Diffusion Turbo in img2img: parte dal ritaglio della foto (volto, capelli, spalle) e lo trasforma
in figura, tenendo pettinatura, barba e colori; la tuta prende i colori della scuderia.
Prova due modelli (sd-turbo e sdxl-turbo) e più "forze" della trasformazione, poi salva i risultati
in samples/vinyl/ con un foglio di confronto (sheet.png). Solo CPU: va bene per pochi piloti.

Uso: python scripts/vinyl-test.py
"""
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
from diffusers import AutoPipelineForImage2Image
from PIL import Image, ImageDraw
from rembg import new_session, remove

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTRAITS = json.load(open(os.path.join(ROOT, "src/data/portraits.json"), encoding="utf-8"))
OUT = os.path.join(ROOT, "samples/vinyl")
UA = "F1CardBattle/1.0 (https://github.com/J0joFra/F1-Card-Battle)"

# piloti dal 2010 in poi, con la tuta della scuderia più recente
DRIVERS = {
    "lewis-hamilton": "red Ferrari",
    "fernando-alonso": "dark green Aston Martin",
    "lando-norris": "papaya orange McLaren",
    "oscar-piastri": "papaya orange McLaren",
    "george-russell": "black and teal Mercedes",
    "carlos-sainz-jr": "dark blue Williams",
    "sebastian-vettel": "dark green Aston Martin",
    "kimi-raikkonen": "red and white Alfa Romeo",
    "daniel-ricciardo": "white and blue Racing Bulls",
    "nico-rosberg": "silver and teal Mercedes",
}
PROMPT = (
    "a cute vinyl toy figure of a racing driver, funko pop style, oversized head, small body, "
    "{suit} racing suit, same hairstyle and facial hair as the photo, glossy plastic, "
    "3d render, soft studio lighting, plain light grey background"
)
NEGATIVE = "text, logo, letters, watermark, box, packaging, realistic skin, photo, blurry"
MODELS = [  # (nome, repo, dtype, passi, forze)
    ("sd-turbo", "stabilityai/sd-turbo", torch.float32, 4, [0.5, 0.65, 0.8]),
    ("sdxl-turbo", "stabilityai/sdxl-turbo", torch.bfloat16, 4, [0.5, 0.65, 0.8]),
]

http = requests.Session()
http.headers["User-Agent"] = UA
YUNET_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
YUNET = os.path.expanduser("~/.cache/yunet.onnx")
if not os.path.exists(YUNET):
    os.makedirs(os.path.dirname(YUNET), exist_ok=True)
    open(YUNET, "wb").write(requests.get(YUNET_URL, timeout=60).content)
detector = cv2.FaceDetectorYN.create(YUNET, "", (320, 320), 0.75)


def crop(img: Image.Image) -> Image.Image | None:
    """Quadrato con testa e spalle attorno al volto più grande."""
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    h, w = arr.shape[:2]
    detector.setInputSize((w, h))
    _, found = detector.detect(arr)
    if found is None or not len(found):
        return None
    x, y, fw, fh = (int(v) for v in max(found, key=lambda f: f[2] * f[3])[:4])
    side = min(int(max(fw, fh) * 2.8), w, h)
    cx, cy = x + fw // 2, y + int(fh * 0.75)
    left = min(max(0, cx - side // 2), w - side)
    top = min(max(0, cy - side // 2), h - side)
    return img.crop((left, top, left + side, top + side)).resize((512, 512), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
photos = {}
for d in DRIVERS:
    p = PORTRAITS.get(d)
    if not p:
        print("manca la foto:", d)
        continue
    url = re.sub(r"/(\d+)px-", "/500px-", p["thumb"]) if "/thumb/" in p["thumb"] else p["thumb"]
    res = http.get(url, timeout=30)
    if 400 <= res.status_code < 500:
        res = http.get(p["thumb"], timeout=30)
    res.raise_for_status()
    face = crop(Image.open(io.BytesIO(res.content)).convert("RGB"))
    if face is None:
        print("nessun volto:", d)
        continue
    photos[d] = face
    face.save(os.path.join(OUT, f"{d}__photo.webp"), "WEBP", quality=80)
    time.sleep(0.3)
if not photos:
    sys.exit("nessuna foto")

bg = new_session("u2net")
torch.set_grad_enabled(False)
results = {}  # (modello, forza) -> {pilota: immagine}
for name, repo, dtype, steps, strengths in MODELS:
    t0 = time.time()
    try:
        pipe = AutoPipelineForImage2Image.from_pretrained(repo, torch_dtype=dtype)
        pipe.set_progress_bar_config(disable=True)
    except Exception as e:  # un modello che non si carica non ferma la prova
        print(f"{name}: non caricato ({e})")
        continue
    for s in strengths:
        for d, face in photos.items():
            t = time.time()
            img = pipe(
                prompt=PROMPT.format(suit=DRIVERS[d]), negative_prompt=NEGATIVE, image=face,
                num_inference_steps=steps, strength=s, guidance_scale=0.0,
                generator=torch.Generator().manual_seed(7),
            ).images[0].convert("RGB")
            mask = remove(img, session=bg, only_mask=True).convert("L")
            img.putalpha(mask)
            img = img.resize((256, 256), Image.LANCZOS)
            img.save(os.path.join(OUT, f"{d}__{name}-{int(s * 100)}.webp"), "WEBP", quality=85)
            results.setdefault((name, s), {})[d] = img
            print(f"{name} {s} {d}: {time.time() - t:.0f}s", flush=True)
    print(f"{name}: {time.time() - t0:.0f}s in tutto")
    del pipe

# foglio di confronto: una riga per pilota, foto + ogni variante su sfondo chiaro
cols = [("foto", None)] + [(f"{n} {int(s * 100)}", (n, s)) for (n, s) in results]
cell, pad = 160, 22
sheet = Image.new("RGB", (cell * len(cols), pad + cell * len(photos)), "#e9eaee")
draw = ImageDraw.Draw(sheet)
for c, (label, key) in enumerate(cols):
    draw.text((c * cell + 6, 5), label, fill="#222")
for r, d in enumerate(photos):
    for c, (label, key) in enumerate(cols):
        im = photos[d].convert("RGBA") if key is None else results[key].get(d)
        if im is None:
            continue
        im = im.resize((cell, cell), Image.LANCZOS)
        sheet.paste(im, (c * cell, pad + r * cell), im)
sheet.save(os.path.join(OUT, "sheet.png"))
print("fatto:", OUT)
