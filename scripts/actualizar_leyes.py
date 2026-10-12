#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
actualizar_leyes.py · robot que mantiene la web al día
======================================================
Cada vez que la Gaceta Oficial de Cuba publica una norma nueva, este script:

  1. Consulta el listado de normas de la Gaceta Oficial (gacetaoficial.gob.cu).
  2. Detecta las normas que NO están todavía en data/leyes.json.
  3. Traduce cada norma nueva a lenguaje claro con el mismo motor que usa la web
     (clasificador Naive Bayes + resumidor TextRank + diccionario jurídico +
     índice de legibilidad Fernández-Huerta).
  4. Escribe/actualiza data/leyes.json.

Está pensado para correr desde GitHub Actions (ver .github/workflows), pero
también funciona a mano:  python3 scripts/actualizar_leyes.py

Solo usa la librería estándar de Python 3.
"""

import json
import os
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F_LIMITES = os.path.join(RAIZ, "data", "limites.json")
F_ENTREN = os.path.join(RAIZ, "data", "entrenamiento.json")
F_SALIDA = os.path.join(RAIZ, "data", "leyes.json")

FUENTES = [
    "https://www.gacetaoficial.gob.cu/es/normas-juridicas",
    "https://www.gacetaoficial.gob.cu/es/gacetas-oficiales",
    "https://www.gacetaoficial.gob.cu/es/ediciones-del-mes",
]

STOPWORDS = set(
    "de la el los las un una unos unas y o u que en con por para se su sus del al es son ser "
    "esta este esto estos estas como mas menos muy sin sobre entre no ni lo le les me te nos os "
    "mi tu mis tus ya pero si tambien cual cuales quien quienes donde cuando cuanto cuanta todo "
    "toda todos todas otro otra otros otras mismo misma cada tal tan asi a ante bajo cabe contra "
    "desde hasta mediante durante segun salvo incluso aunque mientras porque pues luego entonces "
    "cualquier aquel aquella ello ellos ellas podra podran debera deberan seran sera han haya "
    "hayan sido estaba estaban fueran fueron sea sean tiene tienen puede pueden debe deben".split()
)


# ---------------------------------------------------------------- utilidades
def sin_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def normalizar(t):
    return sin_acentos(str(t or "").lower())


def tokenizar(t):
    return [w for w in re.findall(r"[a-z0-9]+", normalizar(t)) if len(w) > 2 and w not in STOPWORDS]


def frases(t):
    partes = re.split(r"(?<=[.!?;])\s+|\n+", re.sub(r"\s+", " ", str(t or "")))
    return [p.strip() for p in partes if len(p.split()) >= 4]


def silabas(w):
    w = re.sub(r"[^a-z]", "", normalizar(w))
    if not w:
        return 0
    grupos = re.findall(r"[aeiou]+", w)
    return max(len(grupos), 1)


def legibilidad(t):
    palabras = re.findall(r"[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+", str(t))
    if len(palabras) < 10:
        return {"indice": 0, "nivel": "sin datos"}
    fs = frases(t) or [str(t)]
    P = sum(silabas(p) for p in palabras) * 100 / len(palabras)
    F = len(fs) * 100 / len(palabras)
    idx = round(206.84 - 0.60 * P - 1.02 * F, 1)
    for limite, nombre in [(90, "muy fácil (cualquiera lo entiende)"), (80, "fácil"), (70, "algo fácil"),
                           (60, "normal"), (50, "algo difícil"), (30, "difícil (nivel de abogado)")]:
        if idx >= limite:
            return {"indice": idx, "nivel": nombre}
    return {"indice": idx, "nivel": "muy difícil (nivel universitario)"}


# ------------------------------------------------------- resumidor TextRank
def resumir(texto, n=5):
    fs = frases(texto)
    if len(fs) <= n:
        return fs
    tk = [tokenizar(f) for f in fs]
    df = {}
    for toks in tk:
        for t in set(toks):
            df[t] = df.get(t, 0) + 1
    N = len(fs)
    idf = lambda t: (1 + N / (1 + df.get(t, 0)))
    import math
    idf = lambda t: math.log(1 + N / (1 + df.get(t, 0)))

    def sim(a, b):
        A, B = set(a), set(b)
        s = sum(idf(t) for t in A if t in B)
        return s / ((len(A) * len(B)) ** 0.5 or 1)

    M = [[0 if i == j else sim(tk[i], tk[j]) for j in range(N)] for i in range(N)]
    scores = [1.0 / N] * N
    for _ in range(20):
        nxt = []
        for i in range(N):
            s = 0.0
            for j in range(N):
                if i == j or not M[j][i]:
                    continue
                out = sum(M[j])
                s += (M[j][i] / out if out else 0) * scores[j]
            nxt.append(0.15 / N + 0.85 * s)
        scores = nxt
    orden = sorted(range(N), key=lambda i: scores[i], reverse=True)[:n]
    return [fs[i] for i in sorted(orden)]


# ------------------------------------------------------------- clasificador
class NaiveBayes:
    def __init__(self, datos):
        self.cats = list(datos.get("categorias", []))
        self.doc, self.padre, self.total, self.vocab, self.n = {}, {}, {}, set(), 0
        for e in datos.get("ejemplos", []):
            self.aprender(e["texto"], e["cat"])

    def aprender(self, texto, cat):
        tk = tokenizar(texto)
        self.doc[cat] = self.doc.get(cat, 0) + 1
        self.padre.setdefault(cat, {})
        self.total[cat] = self.total.get(cat, 0)
        self.n += 1
        for t in tk:
            self.padre[cat][t] = self.padre[cat].get(t, 0) + 1
            self.total[cat] += 1
            self.vocab.add(t)

    def clasificar(self, texto):
        import math
        tk = tokenizar(texto)
        V = max(len(self.vocab), 1)
        mejor, mejor_log, punt = None, float("-inf"), {}
        for cat in self.cats:
            n_doc = self.doc.get(cat, 0)
            if not n_doc:
                continue
            lp = math.log(n_doc / max(self.n, 1))
            tot = self.total.get(cat, 0)
            bolsa = self.padre.get(cat, {})
            hits = 0
            for t in tk:
                if t not in self.vocab:
                    continue
                hits += 1
                lp += math.log((bolsa.get(t, 0) + 1) / (tot + V))
            if not hits:
                continue
            punt[cat] = lp
            if lp > mejor_log:
                mejor, mejor_log = cat, lp
        if not mejor:
            return {"categoria": None, "etiqueta": "-", "confianza": 0}
        exp = {k: math.exp(v - max(punt.values())) for k, v in punt.items()}
        s = sum(exp.values()) or 1
        return {"categoria": mejor, "etiqueta": mejor, "confianza": round(exp[mejor] / s, 2)}


# ------------------------------------------------------------- simplificador
def simplificar(texto, dict_legal):
    t = str(texto or "")
    terminos = []
    for k in sorted(dict_legal, key=len, reverse=True):
        re_k = re.compile(r"\b(" + re.escape(k) + r")\b", re.I)
        if re_k.search(t):
            terminos.append({"termino": k, "claro": dict_legal[k]})
            t = re_k.sub(dict_legal[k], t)
    return t, terminos


def traducir(texto, nb, dict_legal):
    limpio, terminos = simplificar(texto, dict_legal)
    antes, despues = legibilidad(texto), legibilidad(limpio)
    cat = nb.clasificar(texto)
    return {
        "etiqueta": cat["etiqueta"],
        "confianza": cat["confianza"],
        "resumen": resumir(limpio, 5),
        "terminos": terminos[:40],
        "legibilidad": {"antes": antes, "despues": despues},
        "textoSimplificado": limpio,
    }


# ---------------------------------------------------------------- red
def bajar(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": "AduanaCubaClaro/1.0 (+https://github.com/aurenox-global/aduana-cuba-claro)"
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def extraer_normas(html, origen):
    """Saca (id, titulo, identificador) del HTML de un listado de la Gaceta."""
    normas = []
    for m in re.finditer(r'href="(/es/[^"]+)"[^>]*>([^<]{6,160})</a>', html):
        href, titulo = m.group(1), m.group(2).strip()
        if not re.search(r"(decreto|resolucion|ley|acuerdo|gaceta)", normalizar(href)):
            continue
        normas.append({
            "id": href,
            "titulo": re.sub(r"\s+", " ", titulo),
            "url": "https://www.gacetaoficial.gob.cu" + href,
            "origen": origen,
        })
    # deduplicar por id
    vistos, salida = set(), []
    for n in normas:
        if n["id"] in vistos:
            continue
        vistos.add(n["id"])
        salida.append(n)
    return salida


def main():
    with open(F_ENTREN, encoding="utf-8") as f:
        entren = json.load(f)
    dict_legal = entren.get("diccionario_legal", {})
    nb = NaiveBayes(entren)

    if os.path.exists(F_SALIDA):
        with open(F_SALIDA, encoding="utf-8") as f:
            salida = json.load(f)
    else:
        salida = {"actualizado": None, "normas": []}

    conocidas = {n.get("ruta") for n in salida.get("normas", [])}
    nuevas = []
    errores = []

    for url in FUENTES:
        try:
            html = bajar(url)
        except Exception as e:  # red, bloqueo, cambio de formato…
            errores.append("%s -> %s" % (url, e))
            continue
        for n in extraer_normas(html, url):
            if n["id"] in conocidas:
                continue
            # Título + resumen heurístico propio (la página no trae el texto completo)
            cuerpo = n["titulo"] + ". Norma publicada en la Gaceta Oficial de la República de Cuba."
            trad = traducir(cuerpo, nb, dict_legal)
            nuevas.append({
                "ruta": n["id"],
                "titulo": n["titulo"],
                "url": n["url"],
                "detectada": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "traduccion": trad,
            })

    if nuevas:
        salida["normas"] = nuevas + salida.get("normas", [])
    salida["actualizado"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    salida["fuentes"] = FUENTES
    salida["errores"] = errores

    os.makedirs(os.path.dirname(F_SALIDA), exist_ok=True)
    with open(F_SALIDA, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)

    print("Normas nuevas detectadas: %d" % len(nuevas))
    for n in nuevas:
        print("  · %s  [%s]" % (n["titulo"], n["traduccion"]["etiqueta"]))
    if errores:
        print("Fuentes con problemas (%d):" % len(errores))
        for e in errores:
            print("  !", e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
