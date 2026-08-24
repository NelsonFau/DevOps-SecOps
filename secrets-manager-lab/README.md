# AWS Secrets Manager - Secrets Management

## Objetivo

Este laboratorio tiene como objetivo comprender cómo gestionar secretos de una aplicación utilizando **AWS Secrets Manager**, evitando almacenar información sensible directamente en el código fuente, archivos versionados o pipelines.

Durante el laboratorio se trabajó con:

- AWS Secrets Manager
- AWS CLI
- IAM
- IAM Roles
- AWS STS
- Node.js
- AWS SDK for JavaScript
- Gitleaks

---

## ¿Qué problema resuelve Secrets Manager?

Una aplicación suele necesitar información sensible como:

- Contraseñas de bases de datos.
- API Keys.
- Tokens.
- Credenciales de servicios externos.
- Connection strings.

Una mala práctica sería almacenarlas directamente en el código:

```javascript
const DB_PASSWORD = "mi-password-secreto";
```

También existe el riesgo de almacenar un archivo `.env` accidentalmente dentro del repositorio:

```env
DB_PASSWORD=mi-password-secreto
```

AWS Secrets Manager permite almacenar estos valores fuera del código y recuperarlos solamente cuando la aplicación los necesita.

El flujo queda:

```text
Aplicación
    ↓
AWS SDK
    ↓
IAM verifica permisos
    ↓
AWS Secrets Manager
    ↓
Secreto
```

La aplicación conoce el **nombre del secreto**, pero no necesita contener el valor sensible.

---

## 1. Creación del secreto

Se creó un secreto para el laboratorio:

```text
devsecops-lab/database
```

Con valores ficticios similares a:

```json
{
  "DB_USER": "devsecops_user",
  "DB_PASSWORD": "********"
}
```

El secreto fue creado mediante AWS CLI:

```powershell
aws secretsmanager create-secret `
  --name "devsecops-lab/database" `
  --description "Credenciales ficticias para laboratorio de AWS Secrets Manager" `
  --secret-string '{...}'
```

> Los valores reales de los secretos no deben almacenarse en el repositorio.

---

## 2. Recuperación mediante AWS CLI

Se comprobó que el secreto podía recuperarse utilizando:

```powershell
aws secretsmanager get-secret-value `
  --secret-id "devsecops-lab/database"
```

AWS verifica primero la identidad utilizada por la CLI y evalúa sus permisos IAM.

```text
AWS CLI
   ↓
Credenciales AWS
   ↓
IAM
   ↓
GetSecretValue
   ↓
Secrets Manager
```

---

## 3. Recuperación desde Node.js

Se creó una pequeña aplicación Node.js utilizando el SDK de AWS.

La dependencia utilizada fue:

```powershell
npm install @aws-sdk/client-secrets-manager
```

La aplicación consulta el secreto en runtime:

```javascript
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

async function getSecret() {
  const client = new SecretsManagerClient({
    region: "us-east-1",
  });

  const command = new GetSecretValueCommand({
    SecretId: "devsecops-lab/database",
  });

  const response = await client.send(command);

  const secrets = JSON.parse(response.SecretString);

  console.log("Usuario de DB:", secrets.DB_USER);

  console.log(
    "Password recuperado correctamente:",
    Boolean(secrets.DB_PASSWORD)
  );
}

getSecret().catch((error) => {
  console.error("Error recuperando el secreto:", error.message);
});
```

La contraseña nunca se imprime ni se encuentra hardcodeada en el código.

Resultado:

```text
Usuario de DB: devsecops_user
Password recuperado correctamente: true
```

---

## 4. Control de acceso con IAM

Secrets Manager no permite acceder a un secreto simplemente por conocer su nombre.

La identidad que ejecuta la aplicación necesita permisos IAM.

El permiso utilizado para recuperar el secreto es:

```text
secretsmanager:GetSecretValue
```

Durante el laboratorio se agregó temporalmente un **Deny explícito**:

```json
{
  "Effect": "Deny",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "ARN_DEL_SECRETO"
}
```

Al ejecutar nuevamente la aplicación se obtuvo:

```text
AccessDeniedException
```

Esto permitió comprobar:

```text
Secreto existe
      ↓
IAM permite acceso
      ↓
✅ Aplicación puede leerlo
```

Mientras que:

```text
Secreto existe
      ↓
IAM niega acceso
      ↓
❌ AccessDenied
```

Un `Deny` explícito tiene prioridad sobre un `Allow`.

---

## 5. Principio de mínimo privilegio

Posteriormente se creó un IAM Role específico para el laboratorio:

```text
DevSecOpsSecretsLabRole
```

Al Role se le concedió solamente:

```text
secretsmanager:GetSecretValue
```

y únicamente para:

```text
devsecops-lab/database
```

La política utilizada tenía conceptualmente:

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "ARN_EXACTO_DEL_SECRETO"
}
```

Esto implementa el principio de **Least Privilege**:

> Una aplicación debe tener solamente los permisos necesarios para realizar su función.

---

## 6. IAM Role y credenciales temporales

El usuario del laboratorio asumió el Role mediante AWS STS:

```powershell
aws sts assume-role `
  --role-arn "ARN_DEL_ROLE" `
  --role-session-name "secrets-lab-session"
```

AWS STS generó credenciales temporales:

```text
AccessKeyId
SecretAccessKey
SessionToken
```

Estas credenciales permitieron trabajar temporalmente como:

```text
assumed-role/DevSecOpsSecretsLabRole/secrets-lab-session
```

En lugar de utilizar permanentemente los permisos del usuario IAM.

---

## 7. Prueba de mínimo privilegio

Con el Role activo se realizaron distintas pruebas.

### Leer el secreto

```powershell
aws secretsmanager get-secret-value `
  --secret-id "devsecops-lab/database"
```

Resultado:

```text
✅ Permitido
```

Porque el Role tenía:

```text
secretsmanager:GetSecretValue
```

---

### Listar secretos

```powershell
aws secretsmanager list-secrets
```

Resultado:

```text
❌ AccessDenied
```

El Role no tenía:

```text
secretsmanager:ListSecrets
```

---

### Consultar metadata

```powershell
aws secretsmanager describe-secret `
  --secret-id "devsecops-lab/database"
```

Resultado:

```text
❌ AccessDenied
```

El Role tampoco tenía:

```text
secretsmanager:DescribeSecret
```

Por lo tanto:

```text
DevSecOpsSecretsLabRole
        │
        ├── GetSecretValue
        │       └── ✅
        │
        ├── ListSecrets
        │       └── ❌
        │
        └── DescribeSecret
                └── ❌
```

Esto demuestra que no es necesario entregar `SecretsManagerFullAccess` a una aplicación.

---

## 8. Relación con Gitleaks

Gitleaks y Secrets Manager solucionan problemas diferentes pero complementarios.

### Gitleaks

Busca secretos almacenados accidentalmente en:

- Código.
- Commits.
- Repositorios Git.
- Archivos de configuración.

```text
Gitleaks
   ↓
¿Hay una credencial dentro del repositorio?
```

### AWS Secrets Manager

Proporciona un lugar diseñado específicamente para almacenar y controlar esos secretos.

```text
Secrets Manager
   ↓
¿Dónde debería estar la credencial?
```

Por lo tanto:

```text
Gitleaks
   ↓
Detecta secretos mal almacenados

Secrets Manager
   ↓
Gestiona correctamente los secretos
```

---

## 9. `.env` vs Secrets Manager

Un archivo `.env` permite separar configuración y código:

```env
DB_PASSWORD=...
```

Esto es mejor que hardcodear credenciales, pero todavía plantea problemas:

- ¿Dónde se almacena el `.env`?
- ¿Quién puede acceder?
- ¿Cómo llega al servidor?
- ¿Cómo se modifica una contraseña?
- ¿Puede subirse accidentalmente a Git?
- ¿Cómo se audita quién accedió?

Secrets Manager centraliza esta gestión y permite controlar el acceso mediante IAM.

---

## 10. Arquitectura recomendada en producción

En producción no sería recomendable que una aplicación utilizara las credenciales permanentes de un usuario IAM.

Un escenario típico sería:

```text
ECS / EC2 / Lambda
        ↓
IAM Role
        ↓
Secrets Manager
        ↓
DB_PASSWORD
```

Para GitHub Actions puede utilizarse:

```text
GitHub Actions
      ↓
OIDC
      ↓
AWS IAM Role
      ↓
Secrets Manager
```

De esta forma se evita mantener una `AWS_SECRET_ACCESS_KEY` permanente dentro del pipeline.

---

## 11. Rotación de secretos

AWS Secrets Manager también permite rotar secretos.

```text
Password v1
    ↓
Secrets Manager
    ↓
Rotación
    ↓
Password v2
```

Una aplicación que vuelva a consultar el secreto puede obtener la nueva versión sin almacenar la contraseña dentro de su código.

La rotación es especialmente útil para credenciales de bases de datos como Amazon RDS.

---

## 12. Buenas prácticas

- Nunca hardcodear secretos.
- Nunca subir archivos `.env` con secretos al repositorio.
- No imprimir secretos en logs.
- Aplicar mínimo privilegio con IAM.
- Restringir policies al ARN específico del secreto.
- Preferir IAM Roles sobre credenciales permanentes.
- Utilizar credenciales temporales.
- Utilizar OIDC en pipelines cuando sea posible.
- Rotar secretos sensibles.
- Utilizar Gitleaks para detectar exposiciones accidentales.
- Eliminar recursos de laboratorio cuando ya no sean necesarios.

---

## 13. Limpieza del laboratorio

Al terminar las pruebas:

- Se eliminó la policy temporal utilizada para generar el `Deny`.
- Se eliminó la policy del IAM Role.
- Se eliminó `DevSecOpsSecretsLabRole`.
- Se restauraron las credenciales normales del usuario.
- El secreto de laboratorio fue programado para eliminación.

Esto evita dejar permisos o recursos innecesarios en AWS.

---

## Conclusión

AWS Secrets Manager permite separar los secretos del código fuente y controlar su acceso mediante IAM.

El laboratorio permitió comprobar que almacenar un secreto en Secrets Manager no es suficiente: también es necesario controlar **qué identidad puede acceder al secreto y qué operaciones puede realizar**.

La combinación de:

```text
Secrets Manager
+
IAM
+
IAM Roles
+
Credenciales temporales
+
Least Privilege
```

permite gestionar de forma más segura las credenciales utilizadas por las aplicaciones.

Dentro de nuestra estrategia DevSecOps:

```text
Código         → SAST / Semgrep
Commits        → Gitleaks
Dependencias   → Dependabot / npm audit
Imágenes       → Trivy
IaC            → Checkov
Runtime        → OWASP ZAP
Secretos       → AWS Secrets Manager
```

Cada herramienta protege una capa diferente del ciclo de desarrollo.