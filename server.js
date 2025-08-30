import express from "express";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.get("/admin", (req, res) => {
  res.sendFile("admin.html", { root: "public" });
});

app.get("/catalog", (req, res) => {
  const catalog = JSON.parse(fs.readFileSync("./data/catalog.json", "utf-8"));
  let html = "<h1>Catálogo actual</h1>";
  catalog.categories.forEach(cat => {
    html += `<h2>${cat.title}</h2><ul>`;
    cat.items.forEach(item => {
      html += `<li><strong>${item.title}</strong>: ${item.description}</li>`;
    });
    html += "</ul>";
  });
  res.send(html);
});

app.listen(process.env.PORT, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT}`);
});
