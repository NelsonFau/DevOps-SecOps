# IaC Security con Checkov

## Objetivo

Este laboratorio tiene como objetivo incorporar análisis de seguridad sobre código de infraestructura utilizando **Checkov**.

Checkov permite detectar **misconfigurations** en archivos de Infrastructure as Code antes de que la infraestructura sea desplegada.

A diferencia de herramientas como Semgrep, que analizan vulnerabilidades en código de aplicación, Checkov analiza configuraciones de infraestructura como:

* Terraform
* CloudFormation
* Kubernetes YAML
* Dockerfile

En este laboratorio se utilizó **Terraform**.

---

## ¿Qué problema resuelve Checkov?

Terraform permite definir infraestructura mediante código.

Por ejemplo:

```hcl
resource "aws_security_group" "app" {
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

La configuración anterior es válida para Terraform, pero representa un riesgo de seguridad porque permite conexiones desde cualquier dirección de Internet hacia todos los puertos TCP.

Terraform puede crear esta infraestructura sin considerar que la configuración sea insegura.

Checkov agrega una capa de análisis:

```text
Terraform
    ↓
Checkov
    ↓
¿La configuración cumple las políticas de seguridad?
    ↓
Sí  → continúa el pipeline
No  → falla el pipeline
```

De esta manera es posible detectar problemas antes de ejecutar:

```bash
terraform apply
```

---

# 1. Instalación

Checkov fue instalado utilizando `pip`:

```powershell
pip install checkov
```

Verificación:

```powershell
checkov --version
```

Versión utilizada durante el laboratorio:

```text
3.3.13
```

---

# 2. Infraestructura vulnerable inicial

Se creó el archivo:

```text
checkov-lab/main.tf
```

con una configuración intencionalmente insegura.

```hcl
provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "mi_bucket" {
  bucket = "checkov-lab-bucket-ejemplo"
}

resource "aws_security_group" "app" {
  name        = "checkov-lab-sg"
  description = "Security group inseguro para laboratorio"

  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

El principal problema estaba en:

```hcl
cidr_blocks = ["0.0.0.0/0"]
```

junto con:

```hcl
from_port = 0
to_port   = 65535
```

Esto permitía tráfico desde cualquier IP hacia prácticamente todos los puertos TCP.

---

# 3. Primer análisis con Checkov

Se ejecutó:

```powershell
checkov -f main.tf --compact
```

Resultado inicial:

```text
Passed checks: 6
Failed checks: 13
Skipped checks: 0
```

Checkov detectó múltiples problemas.

Entre los más importantes:

```text
CKV_AWS_24
Ensure no security groups allow ingress from 0.0.0.0:0 to port 22
```

El puerto `22`, utilizado normalmente para SSH, estaba expuesto públicamente.

También detectó:

```text
CKV_AWS_25
Ensure no security groups allow ingress from 0.0.0.0:0 to port 3389
```

El puerto `3389`, normalmente utilizado para RDP, también estaba expuesto.

Otro finding fue:

```text
CKV_AWS_260
Ensure no security groups allow ingress from 0.0.0.0:0 to port 80
```

Todos estos findings provenían principalmente de la misma mala configuración:

```text
Internet
   ↓
0.0.0.0/0
   ↓
puertos 0-65535
```

Esto demuestra que varios checks pueden detectar diferentes consecuencias de una misma misconfiguration.

---

# 4. Problemas detectados en S3

Checkov también analizó el bucket S3.

Entre los findings apareció:

```text
CKV2_AWS_6
Ensure that S3 bucket has a Public Access block
```

Aunque el bucket no tenía configurada una ACL pública explícita, tampoco existía una configuración que bloqueara el acceso público.

Se agregó:

```hcl
resource "aws_s3_bucket_public_access_block" "mi_bucket" {
  bucket = aws_s3_bucket.mi_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

Esto permite declarar explícitamente que el bucket no debe aceptar acceso público.

---

# 5. Corrección del Security Group

La regla vulnerable:

```hcl
ingress {
  from_port   = 0
  to_port     = 65535
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}
```

fue reemplazada por una configuración más restrictiva:

```hcl
ingress {
  description = "Permitir trafico de la aplicacion"
  from_port   = 8080
  to_port     = 8080
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]
}
```

Ahora únicamente se permite:

```text
Red privada 10.0.0.0/16
        ↓
Puerto 8080
```

La salida también fue limitada:

```hcl
egress {
  description = "Permitir HTTPS saliente"
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}
```

---

# 6. Segundo análisis

Luego de corregir las configuraciones principales se ejecutó nuevamente:

```powershell
checkov -f main.tf --compact
```

Resultado:

```text
Passed checks: 16
Failed checks: 7
Skipped checks: 0
```

Los checks relacionados con la exposición pública del Security Group dejaron de fallar.

Entre ellos:

```text
CKV_AWS_23
CKV_AWS_24
CKV_AWS_25
CKV_AWS_260
CKV_AWS_382
CKV2_AWS_6
```

Esto permitió comprobar que Checkov reacciona directamente a los cambios realizados en Terraform.

---

# 7. Versionado del bucket

Uno de los findings restantes fue:

```text
CKV_AWS_21
Ensure all data stored in the S3 bucket have versioning enabled
```

Se agregó versionado:

```hcl
resource "aws_s3_bucket_versioning" "mi_bucket" {
  bucket = aws_s3_bucket.mi_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
}
```

El versionado permite conservar distintas versiones de los objetos almacenados y facilita la recuperación frente a modificaciones o eliminaciones accidentales.

---

# 8. Falsos positivos y riesgos aceptados

Checkov contiene cientos de reglas.

Que una regla falle no significa necesariamente que siempre exista una vulnerabilidad crítica.

Algunas reglas pueden representar:

* buenas prácticas;
* controles de resiliencia;
* decisiones arquitectónicas;
* configuraciones que no aplican al contexto del proyecto.

Por ejemplo:

```text
CKV_AWS_144
Ensure that S3 bucket has cross-region replication enabled
```

La replicación entre regiones aumenta la disponibilidad, pero también agrega:

* costos;
* complejidad;
* almacenamiento adicional;
* infraestructura en otra región.

Para este laboratorio no era necesaria.

Checkov permite documentar estas decisiones mediante:

```text
#checkov:skip=CHECK_ID:RAZON
```

Por ejemplo:

```hcl
#checkov:skip=CKV_AWS_144:Cross-region replication no es necesaria para este laboratorio
```

También se justificaron otros controles fuera del alcance del laboratorio:

```hcl
#checkov:skip=CKV2_AWS_62:Event notifications fuera del alcance de este laboratorio
#checkov:skip=CKV2_AWS_61:Lifecycle fuera del alcance de este laboratorio
#checkov:skip=CKV_AWS_18:Access logging fuera del alcance de este laboratorio
#checkov:skip=CKV_AWS_144:Cross-region replication no es necesaria para este laboratorio
#checkov:skip=CKV_AWS_145:KMS gestionado por el cliente fuera del alcance de este laboratorio
```

Para el Security Group:

```hcl
#checkov:skip=CKV2_AWS_5:Security Group aislado intencionalmente para laboratorio de Checkov
```

La lógica aplicada fue:

```text
Finding
   ↓
¿El riesgo aplica al sistema?
   ↓
Sí ---------------- No
↓                    ↓
Corregir          Justificar
                     ↓
               checkov:skip
```

Un `skip` no debería utilizarse simplemente para hacer que el pipeline pase.

Debe existir una razón técnica documentada.

---

# 9. Resultado final local

Luego de las correcciones y excepciones justificadas:

```text
Passed checks: 17
Failed checks: 0
Skipped checks: 6
```

Esto significa:

* 17 políticas fueron cumplidas.
* Ninguna política aplicable quedó fallando.
* 6 políticas fueron excluidas explícitamente con justificación.

---

# 10. Integración con GitHub Actions

Se creó:

```text
.github/workflows/checkov.yml
```

El pipeline ejecuta Checkov automáticamente cuando se modifica el código del laboratorio.

```yaml
name: IaC Security - Checkov

on:
  push:
    branches:
      - master
    paths:
      - "checkov-lab/**"
      - ".github/workflows/checkov.yml"

  pull_request:
    branches:
      - master
    paths:
      - "checkov-lab/**"
      - ".github/workflows/checkov.yml"

jobs:
  iac-security:
    name: IaC Security (Checkov)
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0

      - name: Install Checkov
        run: pip install checkov==3.3.13

      - name: Run Checkov
        run: checkov -d checkov-lab --framework terraform --compact
```

Checkov fue fijado a la misma versión utilizada localmente:

```text
3.3.13
```

Además, `actions/checkout` utiliza un SHA específico en lugar de una referencia mutable como:

```yaml
actions/checkout@v4
```

Esto reduce el riesgo de supply chain dentro del propio pipeline.

---

# 11. Prueba del pipeline vulnerable

Para comprobar que GitHub Actions realmente bloqueaba infraestructura insegura, se introdujo nuevamente una vulnerabilidad intencional:

```hcl
ingress {
  description = "Configuracion insegura para probar pipeline"
  from_port   = 0
  to_port     = 65535
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}
```

El cambio fue enviado al Pull Request.

GitHub Actions ejecutó:

```text
IaC Security (Checkov)
```

y el job falló.

Flujo comprobado:

```text
Pull Request
     ↓
GitHub Actions
     ↓
Checkov
     ↓
Terraform inseguro
     ↓
FAILED checks
     ↓
Pipeline ❌
```

Esto demostró que una misconfiguration puede detectarse antes de realizar un merge hacia `master`.

---

# 12. Corrección del pipeline

Posteriormente se restauró la regla segura:

```hcl
ingress {
  description = "Permitir trafico de la aplicacion"
  from_port   = 8080
  to_port     = 8080
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]
}
```

Se ejecutó nuevamente Checkov.

El análisis dejó de presentar checks fallidos y el pipeline pudo pasar correctamente.

Flujo final:

```text
Terraform inseguro
        ↓
Checkov detecta
        ↓
Pipeline falla ❌
        ↓
Se corrige Terraform
        ↓
Nuevo análisis
        ↓
Pipeline pasa ✅
```

---

# 13. ¿Qué aprendimos?

La principal diferencia entre Terraform y Checkov es:

```text
Terraform
¿Puedo crear esta infraestructura?

Checkov
¿Debería crear esta infraestructura con esta configuración?
```

Terraform valida y aprovisiona infraestructura.

Checkov agrega controles de seguridad sobre esa definición.

Esto permite aplicar el principio de **Shift Left Security**:

```text
Desarrollo
   ↓
IaC
   ↓
Checkov
   ↓
Pull Request
   ↓
Merge
   ↓
Deploy
```

En lugar de:

```text
Deploy
   ↓
Infraestructura vulnerable
   ↓
Incidente
   ↓
Descubrimos el problema
```

---

# 14. Relación con las demás herramientas DevSecOps

Las herramientas utilizadas en los laboratorios cubren diferentes capas:

| Herramienta | Objetivo                                            |
| ----------- | --------------------------------------------------- |
| Semgrep     | SAST sobre código fuente                            |
| Gitleaks    | Detección de secretos                               |
| npm audit   | Vulnerabilidades en dependencias                    |
| Dependabot  | Actualización automatizada de dependencias          |
| Trivy       | Vulnerabilidades en filesystem, paquetes e imágenes |
| Checkov     | Misconfigurations en Infrastructure as Code         |
| OWASP ZAP   | DAST sobre aplicaciones ejecutándose                |

Por lo tanto, Checkov agrega específicamente la capa:

```text
Infrastructure as Code Security
```

---

# Conclusión

Checkov permite detectar configuraciones inseguras de infraestructura antes del despliegue.

En este laboratorio se comprobó el flujo completo:

```text
Terraform vulnerable
        ↓
Checkov detecta vulnerabilidad
        ↓
GitHub Actions falla
        ↓
Se corrige IaC
        ↓
Checkov valida
        ↓
GitHub Actions pasa
```

Esto evita que configuraciones peligrosas lleguen a producción y permite incorporar controles automáticos de seguridad directamente dentro del proceso de CI/CD.
