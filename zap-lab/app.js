const express = require("express");
const helmet = require("helmet");

const app = express();

app.disable("x-powered-by");

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

app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  next();
});



app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>OWASP ZAP Lab</title>
      </head>
      <body>
        <h1>OWASP ZAP Lab</h1>
        <p>Aplicación de prueba para análisis DAST.</p>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok"
  });
});

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

app.listen(3000, () => {
  console.log("Aplicación ejecutándose en http://localhost:3000");
});