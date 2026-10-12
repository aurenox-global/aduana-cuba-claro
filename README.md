# Aduana Cuba Claro 📦

**Las nuevas medidas de la Gaceta Oficial de Cuba sobre viajes y paquetes, explicadas en lenguaje claro.**

Web educativa para la comunidad cubana: cualquiera a partir de **15 años** puede entender qué cambió, cuánto puede traer, cuánto paga y qué hacer. Incluye un **Traductor IA de Leyes** que funciona en el navegador y una **automatización** que traduce las normas nuevas cada día.

## ¿Qué hay dentro?

| Sección | Para qué sirve |
|---|---|
| Resumen | Los 5 cambios clave en 1 minuto |
| Límites | Tabla buscable de cuánto puedes traer por producto |
| Paquetes | Reglas de envíos, cajas separadas y cómo ahorrar impuesto |
| Medicinas y alimentos | Qué está exento y cómo presentarlo |
| Tecnología | Celulares, computadoras, electrodomésticos y permisos del MINCOM |
| Comunidad | Mulas/importadores, familias en el exterior, paquetería, jóvenes |
| Traductor IA | Pega una ley y la traduce a lenguaje claro |
| Calculadora | Arancel progresivo de viajeros + impuesto de envíos por peso |
| Glosario | El idioma de la aduana, palabra por palabra |
| FAQ | Las dudas más comunes |

## El "ML avanzado" (sin servidores ni claves)

Todo corre en el navegador con JavaScript puro (`js/traductor-leyes.js`):

1. **Clasificador Naive Bayes** entrenado con un corpus de leyes cubanas
   (`data/entrenamiento.json`). Detecta de qué trata una ley
   (aduanas, envíos, medicinas, tecnología…).
2. **Aprendizaje en línea:** si el usuario corrige la categoría, el modelo
   actualiza sus conteos al instante y lo guarda en `localStorage`.
3. **Resumidor extractivo TextRank + TF-IDF:** saca las frases más importantes.
4. **Simplificador léxico:** diccionario jurídico → lenguaje común (`no comercial`
   → «para ti o tu familia, no para venderlo»).
5. **Índice de legibilidad Fernández-Huerta:** mide la comprensión antes y
   después de traducir, en español.
6. **Extractor de datos duros:** USD, %, kg, m², plazos y unidades.

## Automatización de leyes nuevas

- `scripts/actualizar_leyes.py` consulta la Gaceta Oficial y detecta normas nuevas.
- `.github/workflows/actualizar-leyes.yml` lo ejecuta **cada día** en GitHub
  Actions; si hay novedades, las clasifica, las resume y hace commit en
  `data/leyes.json`. La web queda al día sola.

## Uso local

```bash
python3 -m http.server 8000        # dentro de la carpeta del proyecto
# abre http://localhost:8000
```

Para el robot de actualización:

```bash
python3 scripts/actualizar_leyes.py   # solo librería estándar
```

## Estructura

```
index.html                     Página única
css/styles.css                 Estilos (modo oscuro, móvil primero)
js/app.js                      Render de secciones, buscador y calculadoras
js/traductor-leyes.js          Motor ML (clasificador, resumidor, simplificador)
data/limites.json              Límites y aranceles vigentes
data/entrenamiento.json        Corpus + diccionario para el clasificador
data/leyes.json                Normas traducidas (lo actualiza el robot)
scripts/actualizar_leyes.py    Robot de actualización
.github/workflows/             Ejecución diaria automática
```

## Fuentes

- Gaceta Oficial No. 83 Ordinaria de 2026 (05/10/2026): Decreto-Ley 132/2026,
  Resolución 197/2026 (MFP) y Resolución 340/2026 (Aduana General).
- Gaceta Oficial No. 7 Extraordinaria de 2026 (17/01/2026): exenciones de
  alimentos, aseo y medicinas.
- Decreto-Ley 108 “De Aduanas”.

## Aviso

Proyecto educativo. **No sustituye el asesoramiento legal ni el texto oficial**
de la Gaceta. Verifica siempre la norma original antes de tomar decisiones.

## Licencia

MIT — ver `LICENSE`.
