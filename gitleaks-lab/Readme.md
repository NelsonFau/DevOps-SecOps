# Secret Scanning con Gitleaks

## Objetivo

Implementar **Secret Scanning** dentro del flujo DevSecOps utilizando **Gitleaks**.

Gitleaks permite detectar secretos que fueron incluidos accidentalmente en un repositorio, por ejemplo:

* API Keys
* Tokens de GitHub
* Credenciales de AWS
* Contraseñas
* Claves privadas
* Tokens internos de una aplicación

A diferencia de **Semgrep**, que analiza vulnerabilidades en el código fuente, Gitleaks está enfocado específicamente en detectar **credenciales y secretos expuestos**.

```text
Semgrep  → vulnerabilidades en código
Gitleaks → secretos y credenciales
```

El laboratorio original remarca además que un secreto puede seguir existiendo dentro del historial de Git aunque posteriormente sea eliminado del archivo actual.

---

# Estructura utilizada

Se mantuvieron todos los laboratorios dentro del mismo repositorio `DevSecOps`.

```text
DevSecOps/
│
├── .github/
│   └── workflows/
│       ├── semgrep.yml
│       └── gitleaks.yml
│
├── gitleaks-lab/
│   ├── config.js
│   ├── sacramento-test.js
│   └── ...
│
├── .gitleaks.toml
├── .pre-commit-config.yaml
└── ...
```

No se creó un repositorio Git anidado.

El único historial utilizado fue:

```text
DevSecOps/.git
```

---

# 1. Prueba de secreto en historial Git

Primero se creó un archivo limpio:

```javascript
const config = {
  environment: "development",
  region: "us-east-1"
};

module.exports = config;
```

Se realizó un commit inicial.

Posteriormente se agregó intencionalmente una credencial ficticia:

```javascript
const config = {
  environment: "development",
  region: "us-east-1",

  aws: {
   "aca irian las credenciales, las saco asi me deja realizar el commit :)"
  }
};

module.exports = config;
```

Se realizó un segundo commit.

Después se eliminó nuevamente el secreto y se creó otro commit.

El historial quedó conceptualmente:

```text
Commit C → secreto eliminado
Commit B → secreto introducido 🔑
Commit A → código limpio
```

Aunque el código actual estuviera limpio, el secreto permanecía dentro del historial de Git.

Esta es una de las principales situaciones que Gitleaks busca detectar.

---

# 2. Escaneo del repositorio

Para analizar el historial completo se utilizó:

```powershell
gitleaks detect --source . --log-opts="--all" --verbose
```

La opción:

```text
--all
```

indica que deben analizarse todos los commits disponibles.

Gitleaks logró identificar:

```text
Archivo
Línea
Commit
RuleID
Secreto detectado
```

Esto permitió comprobar que eliminar un secreto del archivo actual **no significa eliminarlo del historial Git**.

---

# 3. Ventana de commits

También se probó limitar el número de commits analizados.

Ejemplo:

```powershell
gitleaks detect --source . --log-opts="-n 1" --verbose
```

Si el secreto estaba fuera de esa ventana:

```text
HEAD       → limpio
HEAD~1     → secreto 🔑
```

analizar solamente:

```text
-n 1
```

podía devolver:

```text
No leaks found
```

Mientras que ampliar la ventana permitía encontrar el secreto.

El laboratorio utiliza este comportamiento para demostrar que un análisis parcial del historial puede generar un **punto ciego**.

---

# 4. Integración con GitHub Actions

Se creó:

```text
.github/workflows/gitleaks.yml
```

con el siguiente workflow:

```yaml
name: Secret Scanning - Gitleaks

on:
  push:
    branches:
      - master

  pull_request:
    branches:
      - master

jobs:
  secret-scanning:
    name: Secret Scanning (Gitleaks)
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

La configuración:

```yaml
fetch-depth: 0
```

hace que el runner tenga disponible el historial completo del repositorio para poder realizar análisis históricos. El laboratorio destaca este punto especialmente.

---

# 5. Resultado del pipeline

Cuando se introdujo un secreto de prueba, GitHub Actions detectó:

```text
🛑 Gitleaks detected secrets 🛑
```

y mostró información como:

```text
Rule ID
Commit
Archivo
Línea
Autor
Fecha
```

Ejemplo obtenido durante el laboratorio:

```text
Rule ID: generic-api-key
File: gitleaks-lab/config.js
```

El workflow quedó en estado:

```text
❌ Failed
```

Con esto se comprobó que Gitleaks puede funcionar como un **Security Gate** dentro del CI.

---

# 6. Security Gate en Pull Requests

El workflow también se configuró para ejecutarse cuando se crea un Pull Request contra:

```text
master
```

Flujo:

```text
Feature Branch
      │
      ▼
Pull Request
      │
      ▼
Gitleaks
      │
  ┌───┴───┐
  ▼       ▼
 ✅       ❌
 │         │
Merge    Bloqueo
```

Combinado con reglas de protección de rama y checks obligatorios, el análisis puede impedir que un PR con secretos llegue a `master`.

---

# 7. Pre-commit con Gitleaks

Además del control centralizado en GitHub Actions, se implementó una barrera local utilizando **pre-commit**.

Instalación:

```powershell
pip install pre-commit
```

Configuración:

```text
.pre-commit-config.yaml
```

Contenido:

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

Activación:

```powershell
pre-commit install
```

A partir de ese momento:

```text
git commit
    │
    ▼
Pre-commit
    │
    ▼
Gitleaks
```

Si existe un secreto:

```text
Detect hardcoded secrets........Failed
```

y Git bloquea el commit.

El laboratorio propone este mecanismo como una defensa adicional para detectar secretos antes de que lleguen al repositorio.

---

# 8. Shift Left Security

La combinación de pre-commit y CI permite tener dos niveles de protección.

```text
DESARROLLADOR
     │
     ▼
Pre-commit Gitleaks
     │
     ▼
git commit
     │
     ▼
git push
     │
────────────────────
     ▼
GitHub Actions
     │
     ▼
Gitleaks
     │
     ▼
Pull Request
```

El **pre-commit** detecta el problema lo antes posible.

GitHub Actions funciona como control centralizado incluso si un desarrollador:

* no instaló pre-commit;
* desactivó el hook;
* trabaja desde otra computadora;
* realiza un Pull Request externo.

---

# 9. Reglas personalizadas

También se creó:

```text
.gitleaks.toml
```

para definir reglas propias.

Ejemplo:

```toml
title = "DevSecOps Gitleaks Config"

[extend]
useDefault = true

[[rules]]
id = "sacramento-api-token"
description = "Detecta tokens internos de Sacramento Software"
regex = '''SACRAMENTO-[A-Za-z0-9]{32}'''
tags = ["token", "internal", "sacramento"]
```

La expresión:

```text
SACRAMENTO-[A-Za-z0-9]{32}
```

permite detectar tokens internos con un formato definido por la organización.

Ejemplo:

```text
```

Durante la prueba, el pre-commit detectó:

```text
RuleID: sacramento-api-token
```

y bloqueó correctamente el commit.

Además, Gitleaks también detectó el valor mediante:

```text
RuleID: generic-api-key
```

por lo que se comprobó que estaban funcionando:

```text
Reglas estándar
+
Reglas personalizadas
```

El laboratorio contempla `.gitleaks.toml` precisamente para extender las reglas de detección.

---

# 10. Allowlist

También se configuraron excepciones controladas.

Ejemplo:

```toml
[allowlist]
description = "Ejemplos permitidos en documentacion"
paths = [
  '''docs/.*'''
]
```

Esto permite utilizar tokens ficticios en:

```text
docs/
```

sin generar findings.

Ejemplo:

```text
docs/gitleaks-example.md
        │
        ▼
SACRAMENTO-XXXXXXXX
        │
        ▼
Allowlist
        │
        ▼
       ✅
```

Mientras que el mismo patrón dentro del código:

```text
gitleaks-lab/config.js
        │
        ▼
SACRAMENTO-XXXXXXXX
        │
        ▼
Gitleaks
        │
        ▼
       ❌
```

El `allowlist` debe utilizarse de forma específica para evitar desactivar accidentalmente controles importantes.

El laboratorio recomienda este mecanismo principalmente para tests, ejemplos y documentación.

---

# 11. ¿Qué hacer ante un secreto real?

Si Gitleaks detecta una credencial real, **no alcanza con borrarla del archivo**.

El procedimiento recomendado es:

1. Revocar o rotar inmediatamente la credencial.
2. Eliminarla del código.
3. Reemplazarla por variables de entorno o un sistema de gestión de secretos.
4. Auditar posibles accesos no autorizados.
5. Si corresponde, limpiar o reescribir el historial Git.

El laboratorio destaca que, especialmente en repositorios públicos, debe asumirse que una credencial expuesta pudo haber sido copiada.

---

# Conclusión

Gitleaks introduce la capa de **Secret Scanning** dentro de DevSecOps.

```text
                Desarrollo
                    │
                    ▼
            Pre-commit Gitleaks
                    │
                    ▼
                  Git
                    │
                    ▼
             GitHub Actions
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
       Semgrep             Gitleaks
        SAST                Secrets
          │                   │
          └─────────┬─────────┘
                    ▼
               Security Gate
```

La principal enseñanza del laboratorio es:

> **Un secreto eliminado del código puede continuar existiendo dentro del historial Git.**

Por eso la seguridad debe aplicarse en distintas etapas:

```text
Pre-commit → prevenir

Gitleaks CI → detectar

PR Gate → impedir integración

Rotación → responder ante una filtración
```
