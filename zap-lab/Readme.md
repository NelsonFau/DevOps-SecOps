Laboratorio DAST con OWASP ZAP

Objetivo

Este laboratorio tiene como objetivo integrar DAST (Dynamic Application Security Testing) dentro de un flujo DevSecOps utilizando OWASP ZAP.

A diferencia de un análisis SAST, que revisa el código fuente, DAST analiza una aplicación mientras está ejecutándose y observa cómo responde ante solicitudes HTTP reales.

Durante el laboratorio se trabajó sobre una aplicación simple desarrollada con Node.js + Express, se ejecutó OWASP ZAP desde Docker, se corrigieron los hallazgos detectados y finalmente se integró el análisis dentro de GitHub Actions como control de seguridad bloqueante.

¿Qué es DAST?

DAST significa Dynamic Application Security Testing.

El análisis se realiza contra una aplicación en ejecución:

Aplicación ejecutándose
        ↓
OWASP ZAP
        ↓
Solicitudes HTTP reales
        ↓
Análisis de respuestas
        ↓
Hallazgos de seguridad

Esto permite detectar problemas que muchas veces no son visibles únicamente analizando el código fuente, por ejemplo:

Headers HTTP de seguridad ausentes.

Configuraciones CSP débiles.

Protección insuficiente contra clickjacking.

Exposición de información del servidor.

Problemas relacionados con cookies, cacheo o políticas del navegador.

Determinados comportamientos inseguros observables desde el exterior.

SAST vs DAST

En este repositorio también se utiliza Semgrep como herramienta SAST.

La diferencia principal es:

SAST
Código fuente
    ↓
Semgrep
    ↓
Busca patrones inseguros antes de ejecutar la aplicación


DAST
Aplicación ejecutándose
    ↓
OWASP ZAP
    ↓
Analiza el comportamiento HTTP real

Ambos enfoques se complementan.

Estructura del laboratorio

zap-lab/
├── app.js
├── package.json
└── package-lock.json

.github/
└── workflows/
    └── zap.yml

Los reportes generados localmente por ZAP no se versionan.

Ejemplo de exclusiones utilizadas:

# OWASP ZAP Lab
zap-lab/node_modules/
zap-lab/zap-report*.html
zap-lab/zap.yaml
zap-lab/*.log
zap-lab/*.pid

1. Aplicación de prueba

Se creó una pequeña aplicación Express con los siguientes endpoints:

GET /
GET /health

El endpoint /health permite comprobar que la aplicación está disponible antes de comenzar el análisis DAST.

Ejemplo:

curl.exe http://localhost:3000/health

Respuesta:

{"status":"ok"}

2. Ejecución de OWASP ZAP con Docker

La aplicación se ejecuta directamente en Windows:

node app.js

OWASP ZAP se ejecuta dentro de Docker.

Como localhost dentro del contenedor representa al propio contenedor, para acceder a la aplicación que corre en el host se utiliza:

host.docker.internal

El primer escaneo se ejecutó con:

docker run --rm `
  -v "${PWD}:/zap/wrk/:rw" `
  ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py `
  -t http://host.docker.internal:3000 `
  -r zap-report.html

El parámetro:

-r zap-report.html

genera un reporte HTML con los resultados.

3. Resultado del primer escaneo

El primer análisis encontró:

Severidad

Cantidad

High

0

Medium

3

Low

6

Informational

1

Entre los principales hallazgos aparecieron:

MEDIUM
- Content Security Policy (CSP) Header Not Set
- Missing Anti-clickjacking Header
- CSP: Failure to Define Directive with No Fallback

LOW
- Cross-Origin-Embedder-Policy Header Missing or Invalid
- Cross-Origin-Opener-Policy Header Missing or Invalid
- Cross-Origin-Resource-Policy Header Missing or Invalid
- Permissions Policy Header Not Set
- Server Leaks Information via X-Powered-By
- X-Content-Type-Options Header Missing

Un ejemplo concreto fue:

X-Powered-By: Express

Esto permite que un cliente externo conozca innecesariamente qué framework utiliza la aplicación.

4. Hardening con Helmet

Para corregir los principales hallazgos se instaló Helmet:

npm install helmet

Helmet permite agregar y administrar distintos headers HTTP de seguridad en aplicaciones Express.

También se deshabilitó explícitamente el header que revela Express:

app.disable("x-powered-by");

Content Security Policy

Se definió una CSP restrictiva:

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },

    crossOriginEmbedderPolicy: {
      policy: "require-corp"
    }
  })
);

La directiva:

frameAncestors: ["'none'"]

evita que la aplicación sea cargada dentro de un iframe de otro sitio, mitigando ataques de clickjacking.

La directiva:

formAction: ["'self'"]

restringe el destino permitido para formularios.

Además:

useDefaults: false

permite controlar completamente la CSP del laboratorio y evitar directivas demasiado permisivas como:

unsafe-inline
https:
data:

cuando no son necesarias.

Permissions Policy

También se agregó una política para funcionalidades del navegador que la aplicación no necesita:

app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  next();
});

5. Segundo escaneo

Luego de incorporar Helmet y los primeros controles, se volvió a ejecutar OWASP ZAP.

Resultado:

Severidad

Cantidad

High

0

Medium

3

Low

1

Informational

1

Aunque todavía existían tres findings Medium, los hallazgos habían cambiado.

Ya no aparecían problemas como:

Content Security Policy Header Not Set
Missing Anti-clickjacking Header
X-Powered-By: Express
X-Content-Type-Options Header Missing
Permissions-Policy Header Not Set
Cross-Origin-Opener-Policy Header Missing
Cross-Origin-Resource-Policy Header Missing

Los findings restantes estaban relacionados principalmente con una CSP que todavía podía endurecerse.

6. Manejo de respuestas 404

Durante el análisis ZAP intentó acceder automáticamente a rutas como:

/robots.txt
/sitemap.xml

La aplicación no tenía esos recursos y Express generaba su respuesta 404 predeterminada.

Para mantener las mismas políticas de seguridad también en errores 404 se agregó un handler propio:

app.use((req, res) => {
  res.status(404).send(`
    <html>
      <head>
        <title>404</title>
      </head>
      <body>
        <h1>404 - Recurso no encontrado</h1>
      </body>
    </html>
  `);
});

De esta forma, incluso las respuestas 404 atraviesan previamente los middlewares de seguridad.

7. Escaneo final

Luego del hardening completo se ejecutó nuevamente ZAP:

docker run --rm `
  -v "${PWD}:/zap/wrk/:rw" `
  ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py `
  -t http://host.docker.internal:3000 `
  -r zap-report-final.html

Resultado final:

Severidad

Cantidad

High

0

Medium

0

Low

0

Informational

1

La evolución completa fue:

Escaneo

High

Medium

Low

Informational

Inicial

0

3

6

1

Después de Helmet

0

3

1

1

Final

0

0

0

1

Esto permitió comprobar que los cambios realizados efectivamente modificaban el comportamiento HTTP observado por ZAP.

8. Hallazgo informativo restante

El único hallazgo final fue:

Storable and Cacheable Content

ZAP lo clasificó como:

Informational

En este laboratorio los endpoints no contienen información sensible ni datos personales, por lo que no fue necesario convertir este finding en una corrección obligatoria.

En una aplicación real, especialmente sobre endpoints autenticados o respuestas con información sensible, sería necesario evaluar headers como:

Cache-Control: no-cache, no-store, must-revalidate, private
Pragma: no-cache
Expires: 0

La decisión no debe ser simplemente "eliminar todos los findings", sino analizar cada hallazgo según el contexto de la aplicación.

9. Integración con GitHub Actions

OWASP ZAP se integró dentro del pipeline para ejecutar DAST automáticamente durante el proceso de CI.

El flujo es:

Pull Request
     ↓
Checkout
     ↓
npm ci
     ↓
Levantar aplicación Express
     ↓
Comprobar /health
     ↓
Ejecutar OWASP ZAP
     ↓
Evaluar findings
     ↓
Aceptar o bloquear el Pull Request

El pipeline levanta temporalmente la aplicación dentro del runner de GitHub Actions y posteriormente ejecuta un baseline scan de ZAP contra ella.

10. ZAP como Security Gate

Inicialmente el pipeline se utilizó en modo informativo.

Posteriormente se configuró:

fail_action: true

Esto permite que OWASP ZAP actúe como un security gate.

Es decir:

ZAP detecta un problema bloqueante
        ↓
Job falla
        ↓
Pull Request queda bloqueado

11. Prueba controlada de fallo del pipeline

Para verificar que el control realmente funcionaba se realizó una prueba intencional.

Se eliminaron temporalmente las protecciones de seguridad de la aplicación.

El flujo fue:

Aplicación segura
      ↓
Pipeline ✅

Se elimina temporalmente el hardening
      ↓
ZAP vuelve a encontrar problemas
      ↓
Pipeline ❌

Se restauran las protecciones
      ↓
ZAP vuelve a analizar
      ↓
Pipeline ✅

Esta prueba es importante porque no alcanza con comprobar que una herramienta genera un check verde.

También debe demostrarse que:

Detecta una regresión
        ↓
Bloquea el pipeline
        ↓
Permite continuar después de corregirla

De esta forma el laboratorio demuestra un control de seguridad real dentro de CI/CD.

12. Interacción con Semgrep

Durante el Pull Request, Semgrep también analizó zap-lab/app.js.

Semgrep detectó:

A CSRF middleware was not detected in your express application.

La aplicación del laboratorio únicamente expone endpoints GET, no utiliza autenticación basada en cookies y no contiene operaciones que modifiquen estado.

Por ese motivo, se documentó una exclusión puntual sobre la creación de la aplicación Express:

// CSRF no aplica en este laboratorio: solo hay endpoints GET,
// sin autenticación por cookies ni operaciones que modifiquen estado.
const app = express(); // nosemgrep: javascript.express.security.audit.express-check-csurf-middleware-usage.express-check-csurf-middleware-usage

Esto muestra otro concepto importante de DevSecOps:

Los hallazgos de una herramienta deben analizarse en contexto. No todos los findings requieren introducir una corrección técnica; algunas veces corresponde una excepción puntual y justificada.

La regla no fue deshabilitada globalmente.

13. Resultado del Pull Request

Finalmente, luego de restaurar la aplicación segura:

Semgrep          ✅
Secret Scanning  ✅
Dependency checks ✅
IaC checks        ✅
OWASP ZAP         ✅

El Pull Request quedó completamente verde y pudo ser integrado a master.

Qué aprendimos

Este laboratorio permitió validar varios conceptos importantes:

DAST analiza una aplicación en ejecución y no solamente su código fuente.

OWASP ZAP puede ejecutarse de forma reproducible dentro de Docker.

host.docker.internal permite que un contenedor acceda a servicios ejecutándose en el host.

ZAP puede detectar configuraciones HTTP inseguras incluso cuando la aplicación funciona correctamente.

Helmet permite implementar hardening HTTP en Express.

CSP debe configurarse cuidadosamente; tener una CSP no garantiza que sea segura.

Los errores 404 también forman parte de la superficie de ataque.

No todos los findings deben corregirse automáticamente: deben analizarse según su riesgo y contexto.

DAST puede integrarse en GitHub Actions.

Un análisis de seguridad puede convertirse en un security gate capaz de bloquear un Pull Request.

Un buen laboratorio de DevSecOps debe demostrar tanto el fallo como la corrección.

Flujo final del laboratorio

Código
  ↓
npm ci
  ↓
Aplicación Express
  ↓
OWASP ZAP
  ↓
DAST
  ↓
Hallazgos
  ↓
Hardening
  ↓
Nuevo análisis
  ↓
0 High / 0 Medium / 0 Low
  ↓
GitHub Actions
  ↓
Security Gate
  ↓
PR bloqueado ante regresión
  ↓
Corrección
  ↓
Pipeline verde
  ↓
Merge a master

Conclusión

OWASP ZAP permite incorporar pruebas de seguridad dinámicas dentro del ciclo de desarrollo.

En este laboratorio no solo se ejecutó un escaneo, sino que se comprobó el ciclo completo:

detectar → analizar → corregir → volver a probar → bloquear regresiones

Esto permite desplazar controles de seguridad hacia el pipeline de CI/CD y detectar determinados problemas antes de que lleguen a entornos productivos.
