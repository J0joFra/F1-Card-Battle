"""Generatore di brani jazz leggeri (sintesi additiva con numpy), loop senza stacchi.

Strumenti: piano elettrico (Rhodes), contrabbasso, vibrafono, spazzole/ride, rim click, shaker.
Uso: python3 jazzgen.py <stile> <uscita.wav> <seme>
  stile: swing (partita, tranquillo), bossa (menu), waltz (menu, ballata in 3/4)
"""
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(1)

NOTE = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
QUAL = {
    'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], '7': [0, 4, 7, 10], 'm7b5': [0, 3, 6, 10],
    '6': [0, 4, 7, 9], 'm9': [0, 3, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14], '9': [0, 4, 7, 10, 14], '13': [0, 4, 10, 14, 21],
}


def chord(name):
    root = name[:2] if len(name) > 1 and name[1] == 'b' else name[:1]
    return NOTE[root], QUAL[name[len(root):]]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def env_adsr(n, a, d, s, r_len):
    a, d, r_len = max(1, int(a * SR)), max(1, int(d * SR)), max(1, int(r_len * SR))
    e = np.full(n, s, dtype=np.float64)
    e[:min(a, n)] = np.linspace(0, 1, a)[:min(a, n)]
    if a < n:
        k = min(d, n - a)
        e[a:a + k] = np.linspace(1, s, d)[:k]
    if n > r_len:
        e[-r_len:] *= np.linspace(1, 0, r_len)
    return e


def rhodes(f, dur, vel=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * f * t + 0.9 * np.exp(-t * 6) * np.sin(2 * np.pi * f * t))  # campana FM morbida
    tine = 0.25 * np.sin(2 * np.pi * f * 7.0 * t) * np.exp(-t * 18)
    sub = 0.3 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 2.5)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
    e = np.exp(-t * 1.4) * env_adsr(n, 0.004, 0.1, 1, 0.08)
    return vel * (body + tine + sub) * e * trem


def vibes(f, dur, vel=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
    s = np.sin(2 * np.pi * f * t * vib) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 7) + 0.1 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t * 20)
    e = np.exp(-t * 1.8) * env_adsr(n, 0.002, 0.05, 1, 0.12)
    return vel * s * e


def bass(f, dur, vel=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 5) + 0.15 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 9)
    thump = 0.4 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t * 30)
    e = np.exp(-t * 3.2) * env_adsr(n, 0.006, 0.08, 1, 0.06)
    return vel * (s + thump) * e


def noise(n):
    return rng.standard_normal(n)


def hp(x, k=0.97):  # passa-alto semplice (differenza)
    y = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i in range(len(x)):  # breve: si usa solo su campioni corti
        prev_y = k * (prev_y + x[i] - prev_x)
        prev_x = x[i]
        y[i] = prev_y
    return y


def lp(x, a=0.2):
    # passa-basso a un polo via filtro ricorsivo vettoriale (approssimato con convoluzione esponenziale)
    k = int(SR * 0.004)
    w = (1 - a) ** np.arange(k)
    w /= w.sum()
    return np.convolve(x, w, mode='same')


_ride = None
_brush = None
_rim = None
_shaker = None
_kick = None


def ride():
    global _ride
    if _ride is None:
        n = int(0.6 * SR)
        t = np.arange(n) / SR
        x = hp(noise(n), 0.92) * np.exp(-t * 7)
        ping = sum(np.sin(2 * np.pi * f * t) for f in (3150, 4870, 6230)) * 0.08 * np.exp(-t * 5)
        _ride = (x * 0.12 + ping * 0.7) * 0.5 * DRUMS
    return _ride


def brush():
    global _brush
    if _brush is None:
        n = int(0.35 * SR)
        t = np.arange(n) / SR
        e = np.minimum(t / 0.03, 1) * np.exp(-t * 10)
        _brush = lp(lp(noise(n), 0.5), 0.5) * e * 0.5 * DRUMS
    return _brush


def rim():
    global _rim
    if _rim is None:
        n = int(0.08 * SR)
        t = np.arange(n) / SR
        _rim = (np.sin(2 * np.pi * 1750 * t) + 0.25 * hp(noise(n), 0.8)) * np.exp(-t * 70) * 0.35 * DRUMS
    return _rim


def shaker():
    global _shaker
    if _shaker is None:
        n = int(0.09 * SR)
        t = np.arange(n) / SR
        _shaker = lp(hp(noise(n), 0.85), 0.5) * np.minimum(t / 0.015, 1) * np.exp(-t * 45) * 0.1 * DRUMS
    return _shaker


def kick():
    global _kick
    if _kick is None:
        n = int(0.3 * SR)
        t = np.arange(n) / SR
        f = 55 + 40 * np.exp(-t * 30)
        _kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12) * 0.5
    return _kick


DRUMS = 0.45


def add(buf, start, sig, pan=0.0, gain=1.0):
    i = int(start * SR)
    n = len(sig)
    L, R = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    # avvolge in testa ciò che esce dalla fine: il brano gira in loop senza stacchi
    total = buf.shape[1]
    idx = (np.arange(n) + i) % total
    np.add.at(buf[0], idx, sig * gain * L)
    np.add.at(buf[1], idx, sig * gain * R)


def reverb(buf, mix=0.22, decay=1.8):
    n = int(decay * SR)
    t = np.arange(n) / SR
    ir_l = noise(n) * np.exp(-t * 6.9 / decay)
    ir_r = noise(n) * np.exp(-t * 6.9 / decay)
    ir_l[: int(0.012 * SR)] = 0
    ir_r[: int(0.017 * SR)] = 0
    out = np.empty_like(buf)
    total = buf.shape[1]
    for ch, ir in ((0, ir_l), (1, ir_r)):
        ir = lp(ir, 0.35)
        ir /= np.sqrt((ir ** 2).sum())
        # convoluzione circolare: la coda del riverbero rientra all'inizio (loop pulito)
        size = total
        wet = np.fft.irfft(np.fft.rfft(buf[ch], size) * np.fft.rfft(ir, size), size)
        out[ch] = buf[ch] + mix * wet
    return out


def voicing(root, ints, low=52):
    notes = [root + i for i in ints[1:]] + [root]
    notes = sorted(((n - low) % 12) + low for n in notes)
    return notes


def render(style, seed):
    global rng
    rng = np.random.default_rng(seed)
    if style == 'swing':
        bpm, beats, swing = 104, 4, 0.62
        prog = ['Fmaj7', 'D7', 'Gm7', 'C7', 'Am7', 'D7', 'Gm7', 'C7', 'Fmaj7', 'Bb7', 'Am7', 'D9', 'Gm7', 'C7', 'Fmaj7', 'C7'] * 2
        key = 65
    elif style == 'bossa':
        bpm, beats, swing = 128, 4, 0.5
        prog = ['Dm9', 'G13', 'Cmaj9', 'Cmaj9', 'Fmaj7', 'Bb7', 'Em7', 'A7', 'Dm9', 'G13', 'Cmaj9', 'A7', 'Dm9', 'G7', 'Cmaj9', 'Cmaj9'] * 2
        key = 60
    else:  # waltz
        bpm, beats, swing = 96, 3, 0.58
        prog = ['Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Gm7', 'C7', 'Fm7', 'Bb7', 'Ebmaj7', 'Ab7', 'Gm7', 'C7', 'Fm7', 'Bb7', 'Eb6', 'Bb7'] * 2
        key = 63
    beat = 60 / bpm
    bar = beat * beats
    total = int(len(prog) * bar * SR)
    buf = np.zeros((2, total))

    def eighth_off(k):  # posizione della seconda croma col swing
        return beat * swing

    scale_off = [0, 2, 4, 7, 9, 12, 14, 16]
    motif = None
    for b, name in enumerate(prog):
        t0 = b * bar
        root, ints = chord(name)
        root += 48
        v = voicing(root, ints, low=53)
        # --- piano elettrico: accordi
        if style == 'swing':
            hits = [(0, 1.2), (1 + swing, 0.6)] if b % 2 == 0 else [(swing, 0.9), (2 + swing, 0.9)]
        elif style == 'bossa':
            hits = [(0, 0.45), (1.5, 0.45), (3, 0.45)] if b % 2 == 0 else [(0.5, 0.45), (2, 0.45), (3.5, 0.4)]
        else:
            hits = [(1, 0.8), (2, 0.8)]
        for pos, d in hits:
            for j, note in enumerate(v):
                add(buf, t0 + pos * beat + j * 0.008, rhodes(hz(note), d * beat + 0.4, 0.09), pan=-0.25 + 0.15 * j)
        # --- contrabbasso
        nxt_root = chord(prog[(b + 1) % len(prog)])[0] + 36
        r = root - 12
        if style == 'swing':
            line = [r, r + ints[1], r + ints[2], nxt_root + (1 if (nxt_root - r) % 12 > 6 else -1)]
            for k, note in enumerate(line):
                add(buf, t0 + k * beat, bass(hz(note), beat * 0.95, 0.55), pan=0.05)
        elif style == 'bossa':
            for pos, note in ((0, r), (1.5, r + 7), (2, r + 7), (3.5, r)):
                add(buf, t0 + pos * beat, bass(hz(note), beat * 0.8, 0.5), pan=0.05)
        else:
            add(buf, t0, bass(hz(r), beat * 1.9, 0.55), pan=0.05)
            add(buf, t0 + 2 * beat, bass(hz(r + 7), beat * 0.9, 0.4), pan=0.05)
        # --- batteria
        for k in range(beats):
            tb = t0 + k * beat
            if style == 'swing':
                add(buf, tb, ride(), pan=0.4, gain=0.55 if k % 2 == 0 else 0.4)
                if k % 2 == 1:
                    add(buf, tb + beat * swing, ride(), pan=0.4, gain=0.3)
                    add(buf, tb, brush(), pan=-0.1, gain=0.7)
                if k == 0:
                    add(buf, tb, kick(), gain=0.35)
            elif style == 'bossa':
                add(buf, tb, shaker(), pan=0.5, gain=0.9)
                add(buf, tb + beat / 2, shaker(), pan=0.5, gain=0.6)
                if (b * beats + k) % 8 in (0, 3, 6):
                    add(buf, tb, rim(), pan=-0.3, gain=0.6)
                if k in (0, 2):
                    add(buf, tb, kick(), gain=0.3)
            else:
                add(buf, tb, brush(), pan=-0.1, gain=0.8 if k == 0 else 0.45)
                add(buf, tb, ride(), pan=0.4, gain=0.35 if k else 0.45)
        # --- melodia (vibrafono): un motivo che si ripete e varia, a frasi di due battute con respiro
        if b % 4 in (0, 1, 2) and b >= 2:
            if motif is None or b % 8 == 2:
                n_notes = 5 if style != 'waltz' else 4
                motif = [(sorted(rng.uniform(0, beats * 2 - 0.5, n_notes)), rng.choice(len(scale_off), n_notes))]
            poss, degs = motif[0]
            for p, dgi in zip(poss, degs):
                if int(p // beats) != (b % 2):
                    continue
                p = p % beats
                p = round(p * 2) / 2
                if style != 'bossa' and p % 1 == 0.5:
                    p = p - 0.5 + swing
                # nota della scala vicina a un tono dell'accordo
                tones = [root + 12 + i for i in ints] + [root + 24 + i for i in ints[:2]]
                target = key + scale_off[dgi]
                note = min(tones, key=lambda x: abs(x - target))
                add(buf, t0 + p * beat, vibes(hz(note), beat * 1.6, 0.16), pan=0.25)
    buf = reverb(buf, mix=0.28 if style != 'bossa' else 0.2)
    # suono caldo: le alte frequenze calano dolcemente e oltre 11 kHz si tagliano (come un vinile)
    f = np.fft.rfftfreq(buf.shape[1], 1 / SR)
    tilt = 1 / np.sqrt(1 + (f / 4500) ** 4)
    tilt[f > 11000] = 0
    for ch in range(2):
        buf[ch] = np.fft.irfft(np.fft.rfft(buf[ch]) * tilt, buf.shape[1])
    buf = np.tanh(buf * 1.6) / 1.6
    buf /= np.abs(buf).max() / 0.85
    return buf


def save(buf, path):
    data = (buf.T * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == '__main__':
    style, out, seed = sys.argv[1], sys.argv[2], int(sys.argv[3])
    save(render(style, seed), out)
