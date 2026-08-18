# DevSecOps Labs — SAST con Semgrep

Este repositorio documenta las herramientas de **DevSecOps** utilizadas durante los laboratorios, explicando qué problema resuelve cada herramienta, cómo se utiliza y cómo puede integrarse dentro de un pipeline CI/CD.

Este documento corresponde al laboratorio de **SAST utilizando Semgrep**.

---

## 1. ¿Qué es SAST?

**SAST — Static Application Security Testing** es una técnica que analiza el código fuente de una aplicación **sin necesidad de ejecutarla**.

Su objetivo es detectar problemas de seguridad durante el desarrollo, antes de que el código llegue a producción.

Ejemplos de vulnerabilidades que puede detectar:

* SQL Injection
* Cross-Site Scripting (XSS)
* Uso inseguro de datos
* Funciones potencialmente peligrosas
* Configuraciones inseguras
* Secretos hardcodeados, dependiendo de las reglas utilizadas

El flujo general es:

```text
Código fuente
     ↓
Herramienta SAST
     ↓
Reglas de seguridad
     ↓
Findings / Hallazgos
     ↓
PASS / FAIL
```

La ventaja principal es poder encontrar problemas **temprano en el ciclo de desarrollo**.

---

# 2. Semgrep

**Semgrep** es una herramienta de análisis estático de código.

Analiza archivos buscando patrones definidos mediante **reglas**.

Conceptualmente:

```text
Código
   +
Reglas
   ↓
Semgrep
   ↓
Findings
```

Semgrep no ejecuta nuestra aplicación.

Por ejemplo, no necesita levantar:

* Node.js
* Express
* PostgreSQL
* Docker
* servidores

Simplemente analiza el código fuente.

---

# 3. Instalación

Instalamos Semgrep mediante Python:

```powershell
pip install semgrep
```

Para verificar la instalación:

```powershell
semgrep --version
```

En nuestro caso instalamos:

```text
Semgrep 1.173.0
```

---

## Problema encontrado en Windows

Semgrep estaba instalado correctamente, pero PowerShell mostraba:

```text
semgrep : El término 'semgrep' no se reconoce...
```

El problema no era Semgrep.

El ejecutable estaba instalado en:

```text
C:\Users\Equipo\AppData\Local\Python\pythoncore-3.14-64\Scripts
```

pero esa carpeta no estaba incluida en el `PATH`.

Para agregarla temporalmente:

```powershell
$env:Path += ";C:\Users\Equipo\AppData\Local\Python\pythoncore-3.14-64\Scripts"
```

Después de eso:

```powershell
semgrep --version
```

funcionó correctamente.

---

# 4. Rulesets

Semgrep funciona utilizando conjuntos de reglas llamados **rulesets**.

Por ejemplo:

```powershell
semgrep --config p/sql-injection .
```

indica:

> Analizar el código utilizando las reglas relacionadas con SQL Injection.

Otros rulesets utilizados en el laboratorio:

```text
p/default
p/owasp-top-ten
p/secrets
p/sql-injection
p/xss
p/javascript
p/python
```

También pueden combinarse:

```powershell
semgrep --config p/default --config p/owasp-top-ten .
```

---

# 5. Escaneo automático

Semgrep también puede seleccionar automáticamente reglas según los lenguajes encontrados en el proyecto:

```powershell
semgrep --config auto .
```

En nuestro caso ejecutamos:

```powershell
semgrep --config auto src/routes/products.js
```

Semgrep identificó JavaScript y ejecutó las reglas correspondientes.

---

# 6. Findings

Un **Finding** es un posible problema detectado por una regla.

Por ejemplo:

```text
Findings: 1
```

significa que alguna regla encontró un patrón potencialmente inseguro.

Mientras que:

```text
Findings: 0
```

significa que ninguna de las reglas ejecutadas encontró coincidencias.

Es importante entender algo:

```text
0 Findings ≠ Código 100% seguro
```

Solamente significa:

```text
Las reglas ejecutadas no encontraron problemas.
```

Una herramienta SAST depende de la calidad y cobertura de sus reglas.

---

# 7. SQL Injection

En el laboratorio introdujimos intencionalmente este código:

```javascript
router.get('/search', async (req, res) => {
  const { name } = req.query;

  const { rows } = await db.query(
    "SELECT * FROM products WHERE name LIKE '%" + name + "%'"
  );

  res.json(rows);
});
```

El problema está en:

```javascript
"SELECT * FROM products WHERE name LIKE '%" + name + "%'"
```

`name` viene directamente del usuario:

```text
Usuario
   ↓
req.query.name
   ↓
concatenación
   ↓
consulta SQL
   ↓
Base de datos
```

El usuario está pudiendo influir directamente en la construcción de una consulta SQL.

Esto puede producir una vulnerabilidad de **SQL Injection**.

---

# 8. Corrección de SQL Injection

La solución utilizada en el laboratorio fue una consulta parametrizada:

```javascript
router.get('/search', async (req, res) => {
  const { name } = req.query;

  const { rows } = await db.query(
    'SELECT * FROM products WHERE name ILIKE $1',
    [`%${name}%`]
  );

  res.json(rows);
});
```

Ahora tenemos:

```text
Consulta SQL
    ↓
WHERE name ILIKE $1

Valor
    ↓
%contenido_del_usuario%
```

La consulta y los valores se envían separadamente.

Esto evita que el input del usuario sea interpretado como parte de la estructura SQL.

---

# 9. Falsos positivos y falsos negativos

Durante el laboratorio apareció un concepto importante.

## Falso positivo

Semgrep marca un problema:

```text
Finding
```

pero después de analizarlo descubrimos que el código realmente era seguro.

```text
Semgrep dice: vulnerable
Realidad: seguro
```

Eso es un **falso positivo**.

---

## Falso negativo

Existe una vulnerabilidad real pero Semgrep no la detecta.

```text
Semgrep dice: 0 findings
Realidad: vulnerable
```

Eso es un **falso negativo**.

### Caso encontrado durante el laboratorio

Ejecutamos:

```powershell
semgrep --config p/sql-injection src/routes/products.js
```

sobre:

```javascript
db.query(
  "SELECT * FROM products WHERE name LIKE '%" + name + "%'"
);
```

pero Semgrep devolvió:

```text
Findings: 0
```

También probamos:

```powershell
semgrep --config auto src/routes/products.js
```

y:

```powershell
semgrep --config p/owasp-top-ten src/routes/products.js
```

obteniendo nuevamente:

```text
Findings: 0
```

Esto nos permitió comprobar algo importante:

> Una herramienta de seguridad no reemplaza el conocimiento del desarrollador ni garantiza que el código sea seguro solamente porque devuelve cero hallazgos.

---

# 10. Semgrep local vs Semgrep en CI/CD

Inicialmente ejecutamos Semgrep manualmente:

```powershell
semgrep --config p/sql-injection src/routes/products.js
```

Esto significa:

```text
Desarrollador
     ↓
ejecuta Semgrep manualmente
     ↓
Semgrep analiza código
     ↓
resultado
```

El problema es que dependemos de que alguien recuerde ejecutarlo.

En DevSecOps buscamos automatizar este proceso.

---

# 11. Semgrep dentro de GitHub Actions

Creamos:

```text
.github/workflows/semgrep.yml
```

con:

```yaml
name: SAST - Semgrep

on:
  push:
    branches: [main]

  pull_request:
    branches: [main]

jobs:
  semgrep:
    name: Semgrep Scan
    runs-on: ubuntu-latest

    container:
      image: semgrep/semgrep

    steps:
      - uses: actions/checkout@v4

      - name: Run Semgrep
        run: semgrep --config p/default --config p/owasp-top-ten --error .
```

Ahora el proceso cambia a:

```text
Desarrollador
     ↓
git push / Pull Request
     ↓
GitHub Actions
     ↓
Semgrep
     ↓
análisis de seguridad
     ↓
PASS / FAIL
```

Ya no dependemos de ejecutar Semgrep manualmente.

---

# 12. ¿Qué hace `--error`?

El pipeline utiliza:

```powershell
semgrep --config p/default --config p/owasp-top-ten --error .
```

El parámetro:

```text
--error
```

permite utilizar Semgrep como un **Quality Gate**.

Si no existen hallazgos bloqueantes:

```text
Semgrep
   ↓
Exit Code 0
   ↓
Pipeline ✅
```

Si existe un hallazgo bloqueante:

```text
Semgrep
   ↓
Exit Code 1
   ↓
Pipeline ❌
```

GitHub Actions interpreta cualquier comando que finalice con un código diferente de `0` como un error.

Por eso Semgrep puede bloquear un pipeline.

---

# 13. ¿Por qué poner SAST en un pipeline?

Sin SAST automático:

```text
Código
  ↓
Push
  ↓
Build
  ↓
Deploy
```

Un problema de seguridad puede avanzar por todo el pipeline.

Con SAST:

```text
Código
  ↓
Push / PR
  ↓
SAST — Semgrep
  ↓
¿Seguro?
 ↙     ↘
Sí      No
↓        ↓
Build   STOP ❌
```

El objetivo es aplicar el principio:

> **Shift Security Left**

Es decir, detectar problemas de seguridad lo más temprano posible.

---

# 14. Prueba realizada

Ejecutamos localmente el mismo comando utilizado por GitHub Actions:

```powershell
semgrep --config p/default --config p/owasp-top-ten --error .
```

Resultado:

```text
Scan completed successfully.

Findings: 0
Rules run: 203
Targets scanned: 1

Ran 203 rules on 1 file: 0 findings.
```

Esto confirma que el análisis puede ejecutarse correctamente antes de incorporarlo al pipeline.

---

# 15. Conceptos aprendidos

| Concepto             | Descripción                                                 |
| -------------------- | ----------------------------------------------------------- |
| **SAST**             | Análisis de seguridad del código sin ejecutar la aplicación |
| **Semgrep**          | Herramienta utilizada para realizar SAST                    |
| **Rule**             | Patrón que Semgrep intenta encontrar                        |
| **Ruleset**          | Conjunto de reglas                                          |
| **Finding**          | Posible problema encontrado                                 |
| **Severity**         | Nivel de severidad del finding                              |
| **SQL Injection**    | Manipulación de consultas SQL mediante input no controlado  |
| **Falso positivo**   | Semgrep detecta algo que realmente no es vulnerable         |
| **Falso negativo**   | Existe una vulnerabilidad pero Semgrep no la detecta        |
| **`--config auto`**  | Selecciona reglas automáticamente                           |
| **`--config p/...`** | Utiliza un ruleset específico                               |
| **`--error`**        | Hace fallar el proceso ante hallazgos bloqueantes           |
| **Quality Gate**     | Control que permite o bloquea la continuación del pipeline  |
| **Shift Left**       | Incorporar seguridad temprano en el desarrollo              |

---

# 16. ¿Para qué nos sirve Semgrep?

Semgrep permite integrar seguridad directamente dentro del proceso DevOps.

En lugar de revisar seguridad únicamente al final:

```text
Desarrollo → Deploy → Seguridad
```

podemos hacer:

```text
Desarrollo
    ↓
SAST
    ↓
Build
    ↓
Tests
    ↓
Deploy
```

Esto permite:

* detectar vulnerabilidades antes;
* evitar que código inseguro llegue a producción;
* automatizar controles de seguridad;
* revisar Pull Requests automáticamente;
* establecer Quality Gates;
* disminuir revisiones manuales repetitivas;
* incorporar seguridad dentro del pipeline CI/CD.

---

# 17. Idea principal del laboratorio

La enseñanza más importante no es solamente aprender un comando de Semgrep.

El objetivo es entender esta evolución:

```text
1. Tengo código
        ↓
2. Analizo seguridad manualmente
        ↓
3. Detecto y corrijo vulnerabilidades
        ↓
4. Automatizo el análisis
        ↓
5. El pipeline bloquea código inseguro
```

Eso es parte fundamental de **DevSecOps**:

> La seguridad deja de ser una etapa separada y pasa a formar parte del proceso de desarrollo y entrega de software.

---

## Próximas herramientas

Este repositorio continuará documentando las herramientas utilizadas en los laboratorios de DevSecOps:

```text
01 - SAST
     └── Semgrep

02 - Secret Scanning
     └── Gitleaks

03 - Container Scanning
     └── Trivy

04 - Dependency Scanning
     └── Dependabot

05 - IaC Security
     └── Checkov

06 - DAST
     └── OWASP ZAP

07 - Secrets Management
     └── AWS Secrets Manager
```

La idea será entender para cada herramienta:

```text
¿Qué problema resuelve?
¿Cómo funciona?
¿Cómo se prueba localmente?
¿Cómo se integra al pipeline?
¿Qué ocurre cuando encuentra un problema?
```

De esta forma el repositorio funcionará tanto como **laboratorio práctico** como **documentación de referencia de DevSecOps**.
