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

  // Comprobamos que existe sin mostrar el secreto.
  console.log(
    "Password recuperado correctamente:",
    Boolean(secrets.DB_PASSWORD)
  );
}

getSecret().catch((error) => {
  console.error("Error recuperando el secreto:", error.message);
});