# Container Scanning con Trivy

## Objetivo

El objetivo de este laboratorio fue incorporar **Trivy** al flujo DevSecOps para detectar vulnerabilidades conocidas en:

* imágenes Docker;
* paquetes del sistema operativo;
* dependencias del proyecto.

Además, se configuró Trivy como **security gate**, de forma que pueda detener un pipeline cuando encuentre vulnerabilidades que incumplan la política definida.

---

## 1. Instalación de Trivy

En Windows se instaló Trivy mediante `winget`:

```powershell
winget install -e --id AquaSecurity.Trivy
```

Verificación:

```powershell
trivy --version
```

Versión utilizada durante el laboratorio:

```text
Version: 0.74.0
```

Trivy también descargó automáticamente su base de datos de vulnerabilidades.

---

## 2. Primer escaneo de una imagen Docker

Se utilizó inicialmente:

```powershell
trivy image nginx:latest
```

Trivy detectó que la imagen estaba basada en Debian y analizó los paquetes incluidos dentro del contenedor.

Posteriormente se filtraron solamente las vulnerabilidades de mayor severidad:

```powershell
trivy image --severity HIGH,CRITICAL nginx:latest
```

Resultado:

```text
Total: 56
HIGH: 51
CRITICAL: 5
```

Esto permitió comprobar un concepto importante:

> Una imagen oficial o etiquetada como `latest` no necesariamente está libre de vulnerabilidades.

Las vulnerabilidades detectadas no tenían por qué provenir del código de nuestra aplicación. Muchas pertenecían a paquetes incluidos dentro de la imagen base, como:

* OpenSSL
* libxml2
* Perl
* curl
* util-linux
* ncurses

---

## 3. Ignorar vulnerabilidades sin solución disponible

No todas las vulnerabilidades detectadas tienen una actualización disponible.

Por ese motivo se utilizó:

```powershell
trivy image --severity HIGH,CRITICAL --ignore-unfixed nginx:latest
```

Resultado:

```text
Total: 28
HIGH: 28
CRITICAL: 0
```

Esto redujo los hallazgos de 56 a 28.

`--ignore-unfixed` permite concentrarse en vulnerabilidades para las cuales actualmente existe una versión corregida.

Por ejemplo:

```text
Installed Version: 1:2.41-5
Fixed Version:     2.41.5-0+deb13u1
```

En este caso Trivy indica que la versión instalada es vulnerable y que existe una actualización capaz de corregirla.

---

## 4. Trivy como Security Gate

Hasta este punto Trivy solamente reportaba vulnerabilidades.

Para convertirlo en un control capaz de detener el pipeline se agregó:

```powershell
--exit-code 1
```

Prueba realizada:

```powershell
trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 nginx:latest
```

Después:

```powershell
$LASTEXITCODE
```

Resultado:

```text
1
```

Esto demuestra que Trivy encontró vulnerabilidades que violaban nuestra política y terminó el proceso con error.

El flujo queda de la siguiente manera:

```text
Imagen Docker
     ↓
Trivy
     ↓
¿Existen HIGH o CRITICAL?
     ↓
Sí
     ↓
Exit Code 1
     ↓
Pipeline falla
```

Sin `--exit-code 1`, Trivy funciona principalmente como reporte.

Con `--exit-code 1`, Trivy se transforma en un **security gate**.

---

## 5. Integración con GitHub Actions

Se creó:

```text
.github/workflows/trivy.yml
```

El workflow ejecuta Trivy sobre una imagen Docker y falla si encuentra vulnerabilidades `HIGH` o `CRITICAL`.

Configuración relevante:

```yaml
with:
  image-ref: nginx:latest
  scanners: vuln
  format: table
  severity: CRITICAL,HIGH
  ignore-unfixed: true
  exit-code: '1'
```

Durante la primera ejecución en GitHub Actions, Trivy encontró:

```text
Total: 28
HIGH: 28
CRITICAL: 0
```

y el job terminó con:

```text
Process completed with exit code 1
```

Esto confirmó que el control funcionaba correctamente también dentro del pipeline.

---

## 6. Seguridad del propio pipeline

Durante la integración, **Semgrep** detectó dos hallazgos en el workflow:

```yaml
uses: actions/checkout@v4
uses: aquasecurity/trivy-action@master
```

Semgrep los marcó porque `v4` y `master` son referencias mutables.

Una referencia mutable puede apuntar en el futuro a código diferente sin necesidad de modificar nuestro workflow.

Por ese motivo se obtuvieron los SHA de las Actions:

```powershell
git ls-remote https://github.com/actions/checkout.git refs/tags/v4.4.0
```

Resultado:

```text
11d5960a326750d5838078e36cf38b85af677262
```

Y se hizo lo mismo con Trivy Action.

Luego las GitHub Actions quedaron fijadas mediante SHA completos.

El concepto es:

```yaml
uses: actions/checkout@SHA_COMPLETO
```

en lugar de:

```yaml
uses: actions/checkout@v4
```

Esto reduce el riesgo de ataques de supply chain sobre el pipeline.

---

## 7. Reducir la superficie de ataque

Con `nginx:latest` obtuvimos:

```text
Debian 13
145 paquetes
28 vulnerabilidades HIGH corregibles
```

Se decidió comparar con una imagen más pequeña:

```powershell
trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed nginx:alpine
```

Resultado:

```text
nginx:alpine
Alpine 3.24.1
71 paquetes
0 vulnerabilidades HIGH/CRITICAL
```

Por lo tanto, el workflow se modificó de:

```yaml
image-ref: nginx:latest
```

a:

```yaml
image-ref: nginx:alpine
```

El resultado del pipeline pasó de:

```text
Semgrep   ✅
Gitleaks  ✅
Trivy     ❌
```

a:

```text
Semgrep   ✅
Gitleaks  ✅
Trivy     ✅
```

Esto permitió demostrar el ciclo completo:

```text
Detectar
   ↓
Bloquear
   ↓
Corregir
   ↓
Volver a analizar
   ↓
Aprobar
```

La utilización de imágenes más pequeñas puede reducir la superficie de ataque porque contienen menos paquetes y componentes potencialmente vulnerables.

Esto no significa que:

```text
Alpine = completamente segura
```

sino que, bajo la política configurada durante este laboratorio, Trivy no encontró vulnerabilidades `HIGH` o `CRITICAL` corregibles.

---

# Filesystem Scanning

Trivy también puede analizar las dependencias de un proyecto sin necesidad de construir una imagen Docker.

Se ejecutó:

```powershell
trivy fs --scanners vuln .
```

Inicialmente se obtuvo:

```text
Supported files for scanner(s) not found
```

Esto ocurrió porque Trivy no encontró archivos de dependencias compatibles en el proyecto.

---

## 8. Laboratorio de dependencias vulnerables

Para probar `trivy fs` se creó un pequeño proyecto Node:

```powershell
mkdir trivy-fs-lab
cd trivy-fs-lab

npm init -y
npm install lodash@4.17.20
```

Esto generó:

```text
trivy-fs-lab/
├── package.json
├── package-lock.json
└── node_modules/
```

Posteriormente:

```powershell
trivy fs --scanners vuln .
```

Trivy detectó:

```text
Target: trivy-fs-lab/package-lock.json
Type: npm
Vulnerabilities: 5
```

Resultado:

```text
Total: 5
MEDIUM: 3
HIGH: 2
CRITICAL: 0
```

Entre las vulnerabilidades encontradas se encontraban problemas relacionados con:

* command injection;
* arbitrary code execution;
* ReDoS;
* prototype pollution.

La versión instalada era:

```text
lodash 4.17.20
```

---

## 9. Corrección de la dependencia

Se actualizó lodash:

```powershell
npm install lodash@4.18.0
```

Después se volvió a ejecutar:

```powershell
trivy fs --scanners vuln .
```

Resultado:

```text
Vulnerabilities: 0
```

Por lo tanto:

```text
lodash 4.17.20
      ↓
5 vulnerabilidades
      ↓
Actualizar dependencia
      ↓
lodash 4.18.0
      ↓
0 vulnerabilidades
```

---

# Diferencia entre `trivy image` y `trivy fs`

## `trivy image`

Analiza una imagen Docker construida.

```text
Docker Image
    ↓
Sistema operativo
    ↓
Paquetes
    ↓
Dependencias
    ↓
CVEs
```

Ejemplo:

```powershell
trivy image nginx:alpine
```

---

## `trivy fs`

Analiza archivos de dependencias directamente desde el proyecto.

```text
Proyecto
    ↓
package-lock.json
requirements.txt
pom.xml
otros manifests
    ↓
Trivy
    ↓
CVEs
```

Ejemplo:

```powershell
trivy fs --scanners vuln .
```

Esto permite detectar dependencias vulnerables incluso antes de construir una imagen Docker.

---

# Integración actual del repositorio

Después de este laboratorio, el repositorio posee distintas capas de análisis de seguridad:

```text
Código
 │
 ├── Semgrep
 │      └── SAST
 │
 ├── Gitleaks
 │      └── Secret Scanning
 │
 └── Docker
        │
        └── Trivy
             └── Container Scanning
```

Además:

```text
Dependencias
     │
     └── Trivy FS
          └── Vulnerability Scanning
```

---

# Conclusiones

Trivy permite incorporar análisis de vulnerabilidades conocidas dentro del proceso DevSecOps.

Durante el laboratorio comprobamos que puede:

* analizar imágenes Docker;
* detectar CVEs presentes en paquetes del sistema;
* filtrar por severidad;
* ignorar vulnerabilidades sin solución disponible;
* devolver `exit code 1` para bloquear un pipeline;
* integrarse con GitHub Actions;
* analizar dependencias mediante `trivy fs`;
* ayudar a comparar imágenes base;
* validar correcciones después de actualizar dependencias o imágenes.

El concepto principal aprendido fue:

```text
Seguridad no es solamente analizar código.

Código
Dependencias
Imagen Docker
Pipeline
Infraestructura
        ↓
todos forman parte de la superficie de ataque.
```

Con Trivy agregamos una nueva capa de protección al pipeline, evitando que imágenes o dependencias con vulnerabilidades conocidas avancen automáticamente dentro del proceso de entrega.
