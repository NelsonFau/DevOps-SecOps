# Dependency Scanning con Dependabot

## Objetivo

Este laboratorio tiene como objetivo entender cómo detectar y corregir vulnerabilidades presentes en las dependencias de una aplicación utilizando **Dependabot** y **npm audit**.

A diferencia de herramientas como Semgrep, que analizan nuestro código fuente, Dependabot se enfoca en las librerías y paquetes externos que utiliza nuestra aplicación.

Durante el laboratorio se trabajó con una dependencia vulnerable de forma intencional para observar el flujo completo:

```text
Dependencia vulnerable
        ↓
GitHub Dependency Graph
        ↓
Dependabot Alert
        ↓
Dependabot Security Update
        ↓
Pull Request automático
        ↓
Pipeline de CI
        ↓
Corrección
```

---

# 1. ¿Qué problema resuelve Dependency Scanning?

Una aplicación puede tener código correctamente desarrollado y aun así ser vulnerable debido a las librerías que utiliza.

Por ejemplo:

```text
Nuestra aplicación
       │
       ├── express
       ├── axios
       └── lodash
              │
              └── vulnerabilidad conocida
```

Estas vulnerabilidades suelen estar registradas mediante CVEs o advisories de seguridad.

Además, una dependencia que hoy no presenta vulnerabilidades conocidas puede recibir una alerta en el futuro cuando se descubra un nuevo problema de seguridad.

Por eso es importante monitorear continuamente las dependencias.

---

# 2. Herramientas utilizadas

En este laboratorio utilizamos dos mecanismos complementarios.

## Dependabot

Dependabot funciona dentro de GitHub y permite:

* Analizar las dependencias del repositorio.
* Detectar vulnerabilidades conocidas.
* Generar alertas de seguridad.
* Crear Pull Requests automáticos para actualizar paquetes vulnerables.
* Mantener las dependencias actualizadas.

## npm audit

`npm audit` permite analizar las dependencias de un proyecto Node.js desde la terminal o desde un pipeline de CI.

Ejemplo:

```bash
npm audit
```

También puede configurarse para fallar solamente ante determinadas severidades:

```bash
npm audit --audit-level=high
```

Esto permite utilizarlo como una barrera de seguridad dentro del pipeline.

---

# 3. Creación del proyecto vulnerable

Dentro del repositorio se creó:

```text
dependabot-lab/
```

Se inicializó un proyecto Node.js:

```bash
npm init -y
```

Luego se instaló intencionalmente una versión vulnerable de Lodash:

```bash
npm install lodash@4.17.15
```

Esto generó principalmente:

```text
dependabot-lab/
├── package.json
├── package-lock.json
└── node_modules/
```

`node_modules` no se agregó al repositorio.

Se agregó al `.gitignore`:

```gitignore
dependabot-lab/node_modules/
```

---

# 4. Detección local con npm audit

Después de instalar Lodash se ejecutó:

```bash
npm audit
```

El resultado indicó:

```text
1 high severity vulnerability
```

Entre los problemas detectados aparecieron vulnerabilidades relacionadas con:

* Command Injection
* Prototype Pollution
* Regular Expression Denial of Service (ReDoS)
* Code Injection

Esto permitió comprobar localmente que la dependencia utilizada tenía vulnerabilidades conocidas.

---

# 5. Configuración de Dependabot

Se creó:

```text
.github/dependabot.yml
```

Configuración utilizada:

```yaml
version: 2

updates:
  - package-ecosystem: "npm"
    directory: "/dependabot-lab"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 7
    open-pull-requests-limit: 10
```

---

# 6. Explicación de la configuración

## package-ecosystem

```yaml
package-ecosystem: "npm"
```

Indica que Dependabot debe analizar dependencias administradas mediante NPM.

Dependabot también soporta otros ecosistemas, por ejemplo:

```text
npm
pip
maven
gradle
docker
terraform
github-actions
```

---

## directory

```yaml
directory: "/dependabot-lab"
```

Indica dónde se encuentran:

```text
package.json
package-lock.json
```

En este repositorio el proyecto Node no se encuentra en la raíz, por lo tanto no utilizamos:

```yaml
directory: "/"
```

---

## schedule

```yaml
schedule:
  interval: "weekly"
```

Dependabot revisará periódicamente si existen nuevas versiones disponibles.

En este caso:

```text
weekly = semanalmente
```

---

## cooldown

```yaml
cooldown:
  default-days: 7
```

Indica que Dependabot debe esperar 7 días antes de proponer determinadas actualizaciones recién publicadas.

Esto reduce el riesgo de adoptar inmediatamente versiones que puedan contener:

* bugs,
* regresiones,
* problemas inesperados,
* o incidentes de supply chain.

Esta configuración también fue importante porque **Semgrep detectó inicialmente que nuestro archivo `dependabot.yml` no tenía cooldown**.

---

# 7. Semgrep auditando la configuración de Dependabot

Al crear inicialmente `dependabot.yml`, nuestro pipeline SAST falló.

Semgrep encontró:

```text
dependabot-missing-cooldown
```

El pipeline devolvió:

```text
1 Code Finding
1 blocking
Process completed with exit code 1
```

Semgrep recomendó agregar:

```yaml
cooldown:
  default-days: 7
```

Esto produjo una situación interesante:

```text
Dependabot
   │
   │ protege nuestras dependencias
   ▼

dependabot.yml
   │
   │ también es configuración
   ▼

Semgrep
   │
   └── analiza la seguridad
       de esa configuración
```

Esto demuestra que las propias herramientas de seguridad también deben configurarse correctamente.

---

# 8. Activación de Dependabot en GitHub

Desde GitHub se habilitaron las funcionalidades relacionadas con las dependencias:

```text
Dependency graph
Dependabot alerts
Dependabot security updates
```

El flujo resultante fue:

```text
package-lock.json
       ↓
Dependency Graph
       ↓
Dependabot Alerts
       ↓
Security Advisories
```

---

# 9. Alertas encontradas

Una vez que la dependencia vulnerable llegó a `master`, Dependabot detectó múltiples vulnerabilidades relacionadas con Lodash.

GitHub mostró:

```text
6 Open alerts
```

Las alertas tenían severidades:

```text
HIGH
MODERATE
```

Además se podía observar:

```text
Package: lodash
Dependency: Direct
Manifest: dependabot-lab/package-lock.json
```

La dependencia aparecía como **Direct** porque Lodash fue agregada directamente al proyecto.

---

# 10. Dependencias directas y transitivas

Una dependencia directa es aquella que declaramos nosotros.

Ejemplo:

```text
mi-app
  │
  └── lodash
```

Una dependencia transitiva es una dependencia utilizada internamente por otra librería.

Ejemplo:

```text
mi-app
   │
   └── express
          │
          └── paquete-vulnerable
```

Aunque `paquete-vulnerable` no aparezca directamente en nuestro `package.json`, puede representar un riesgo para la aplicación.

Dependabot también puede detectar este tipo de problemas.

---

# 11. Pull Request automático de Dependabot

Después de detectar las vulnerabilidades, Dependabot creó automáticamente un Pull Request para actualizar Lodash.

El flujo fue:

```text
lodash vulnerable
       ↓
Dependabot Alert
       ↓
Dependabot Security Update
       ↓
Pull Request automático
```

En el PR se mostraba:

* La versión actual.
* La versión propuesta.
* Las vulnerabilidades solucionadas.
* Release notes.
* Cambios realizados.
* Checks de CI.

---

# 12. Validación con nuestros controles DevSecOps

El Pull Request creado por Dependabot ejecutó automáticamente los pipelines que ya teníamos configurados.

Los checks fueron:

```text
✅ SAST - Semgrep
✅ Secret Scanning - Gitleaks
✅ Container Scanning - Trivy
```

Por lo tanto, Dependabot no introduce simplemente una actualización en `master`.

El cambio sigue pasando por nuestro proceso de validación:

```text
Dependabot PR
      ↓
Semgrep
      ↓
Gitleaks
      ↓
Trivy
      ↓
Tests / Build
      ↓
Merge
```

En un proyecto real también deberían ejecutarse pruebas unitarias, integración y build de la aplicación.

---

# 13. Actualización del entorno local

Después de mergear el Pull Request se sincronizó `master`:

```bash
git switch master
git pull origin master
```

Luego:

```bash
cd dependabot-lab
npm ci
```

Es importante entender que:

```bash
npm ci
```

**no busca versiones nuevas.**

Instala exactamente las versiones definidas en:

```text
package-lock.json
```

Por eso el flujo correcto es:

```text
Dependabot modifica package-lock.json
              ↓
Merge del PR
              ↓
git pull
              ↓
package-lock.json actualizado
              ↓
npm ci
              ↓
dependencias corregidas instaladas
```

Finalmente se ejecutó:

```bash
npm audit
```

Y el resultado fue:

```text
0 vulnerabilities
```

---

# 14. Dependency Scanning dentro del pipeline

Además de Dependabot, se decidió agregar `npm audit` al pipeline de CI.

Se creó:

```text
.github/workflows/dependency-audit.yml
```

Con el siguiente contenido:

```yaml
name: Dependency Scanning - npm audit

on:
  push:
    branches:
      - master

  pull_request:
    branches:
      - master

jobs:
  dependency-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0

      - name: Install dependencies
        working-directory: dependabot-lab
        run: npm ci

      - name: Audit dependencies
        working-directory: dependabot-lab
        run: npm audit --audit-level=high
```

---

# 15. ¿Por qué usamos un SHA en actions/checkout?

En lugar de utilizar:

```yaml
uses: actions/checkout@v4
```

se utilizó:

```yaml
uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
```

Esto se debe a que `v4` es una referencia mutable.

Por ejemplo:

```text
actions/checkout@v4
        ↓
puede cambiar

actions/checkout@SHA
        ↓
ejecuta exactamente ese commit
```

Esto ayuda a reducir riesgos relacionados con la cadena de suministro de GitHub Actions.

Esta política ya había sido aplicada en los pipelines anteriores del repositorio.

---

# 16. ¿Por qué no utilizamos setup-node?

El ejemplo original del laboratorio utilizaba:

```yaml
uses: actions/setup-node@v4
```

Pero en nuestro repositorio Semgrep analiza referencias mutables de GitHub Actions.

Como todavía no habíamos fijado un SHA específico para `setup-node`, para este laboratorio utilizamos directamente Node/NPM disponibles en el runner:

```yaml
runs-on: ubuntu-latest
```

Esto permitió mantener consistente nuestra política de utilizar Actions pineadas a SHA.

---

# 17. Funcionamiento de npm audit en CI

La línea más importante del pipeline es:

```yaml
run: npm audit --audit-level=high
```

Esto significa que el pipeline debe fallar si encuentra vulnerabilidades de severidad:

```text
HIGH
CRITICAL
```

El flujo queda:

```text
Pull Request
     ↓
npm ci
     ↓
npm audit --audit-level=high
     ↓
¿Existe HIGH o CRITICAL?
     │
   ┌─┴─┐
   │   │
  Sí   No
   │   │
   ▼   ▼
  ❌   ✅
```

---

# 18. Prueba controlada del pipeline

Para comprobar que el pipeline realmente funcionaba se creó una rama de prueba:

```text
test/dependency-audit-failure
```

Dentro de esa rama se volvió a instalar intencionalmente:

```bash
npm install lodash@4.17.15 --save-exact
```

Luego:

```bash
npm audit --audit-level=high
```

volvió a detectar una vulnerabilidad HIGH.

Se hizo commit del cambio y se abrió un Pull Request contra `master`.

---

# 19. Resultado esperado

Los pipelines ejecutados mostraron un comportamiento similar a:

```text
✅ Semgrep
✅ Gitleaks
✅ Trivy
❌ Dependency Audit
```

El job falló específicamente en:

```yaml
- name: Audit dependencies
  working-directory: dependabot-lab
  run: npm audit --audit-level=high
```

Debido a que Lodash tenía una vulnerabilidad HIGH.

El flujo comprobado fue:

```text
Developer agrega dependencia vulnerable
              ↓
        abre Pull Request
              ↓
          npm audit
              ↓
      encuentra HIGH
              ↓
        exit code != 0
              ↓
       pipeline falla
              ↓
        ❌ PR bloqueado
```

---

# 20. Limpieza de la prueba

El Pull Request vulnerable **no se mergeó**.

La rama de prueba se eliminó después de verificar el comportamiento esperado.

Localmente:

```bash
git switch master
git pull origin master
```

Eliminar rama:

```bash
git branch -D test/dependency-audit-failure
```

Eliminar rama remota:

```bash
git push origin --delete test/dependency-audit-failure
```

---

# 21. Dependabot vs npm audit

Estas herramientas se complementan.

| Herramienta                 | Función                                                       |
| --------------------------- | ------------------------------------------------------------- |
| Dependabot Alerts           | Detecta vulnerabilidades conocidas en dependencias existentes |
| Dependabot Security Updates | Genera Pull Requests para corregirlas                         |
| Dependabot Version Updates  | Busca nuevas versiones según la configuración                 |
| npm audit local             | Permite revisar vulnerabilidades desde la terminal            |
| npm audit CI                | Bloquea cambios que introduzcan vulnerabilidades graves       |

Una forma sencilla de entenderlo es:

```text
Dependabot
     ↓
"Ya existe una vulnerabilidad,
te aviso y propongo corregirla."
```

Mientras que:

```text
npm audit en CI
       ↓
"Estás intentando introducir
una dependencia vulnerable.
No permito que avance el PR."
```

---

# 22. Integración con las herramientas anteriores

Después de este laboratorio el repositorio cuenta con distintas capas de seguridad.

```text
Código fuente
     │
     └── Semgrep
           SAST

Secretos
     │
     └── Gitleaks
           Secret Scanning

Contenedores
     │
     └── Trivy
           Container Scanning

Dependencias existentes
     │
     └── Dependabot
           Dependency Scanning

Dependencias introducidas en PR
     │
     └── npm audit
           Dependency Audit
```

Cada herramienta resuelve un problema diferente.

---

# 23. Defensa en profundidad

El objetivo de DevSecOps no es depender de una única herramienta.

El repositorio empieza a tener diferentes controles:

```text
Developer
   │
   ▼
Pull Request
   │
   ├── Semgrep
   │     └── vulnerabilidades en código
   │
   ├── Gitleaks
   │     └── secretos expuestos
   │
   ├── Trivy
   │     └── vulnerabilidades en imágenes
   │
   └── npm audit
         └── dependencias vulnerables
             │
             ▼
          Merge
             │
             ▼
           master
```

Además:

```text
master
   │
   ▼
Dependabot
   │
   └── monitoreo continuo
       de nuevas vulnerabilidades
```

Esta combinación genera varias capas independientes de protección.

---

# 24. Resultado final

Durante este laboratorio se logró:

* Crear un proyecto Node específico para Dependency Scanning.
* Introducir intencionalmente una dependencia vulnerable.
* Detectar la vulnerabilidad localmente con `npm audit`.
* Configurar Dependabot.
* Configurar un período de cooldown.
* Ver a Semgrep analizar la configuración de Dependabot.
* Activar Dependency Graph.
* Activar Dependabot Alerts.
* Activar Dependabot Security Updates.
* Detectar múltiples vulnerabilidades de Lodash.
* Generar automáticamente un Pull Request de actualización.
* Ejecutar los pipelines existentes sobre el PR de Dependabot.
* Mergear la corrección.
* Verificar `0 vulnerabilities` mediante `npm audit`.
* Crear un pipeline específico de Dependency Scanning.
* Introducir nuevamente una dependencia vulnerable en una rama de prueba.
* Confirmar que `npm audit --audit-level=high` bloquea el Pull Request.
* Evitar que una dependencia vulnerable llegue a `master`.

---

# Conclusión

Dependabot permite mantener bajo vigilancia las dependencias de una aplicación incluso después de haber sido incorporadas al proyecto.

Esto es importante porque una dependencia puede ser considerada segura hoy y recibir una vulnerabilidad conocida en el futuro.

Por otro lado, integrar:

```bash
npm audit --audit-level=high
```

en CI permite detectar vulnerabilidades durante el proceso de desarrollo y evitar que ciertos cambios lleguen a la rama principal.

La combinación utilizada en este laboratorio permite cubrir dos escenarios:

```text
Vulnerabilidad descubierta después
            ↓
        Dependabot
```

y:

```text
Vulnerabilidad introducida en un PR
            ↓
         npm audit
```

De esta forma, Dependency Scanning pasa a formar parte del flujo de **DevSecOps y defensa en profundidad** del repositorio.
