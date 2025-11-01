const fetch = require("node-fetch");

fetch("http://localhost:5678/webhook/financas", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tipo: "gasto", valor: 1, descricao: "ping" }),
})
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);
