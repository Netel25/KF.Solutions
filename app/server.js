import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v20.0";
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

app.get("/catalog", (req, res) => {
  const catalog = loadJSON("./data/catalog.json");
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

function waEndpoint() {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${WA_PHONE_NUMBER_ID}/messages`;
}

async function sendMessage(payload) {
  const res = await axios.post(waEndpoint(), payload, {
    headers: {
      Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
  return res.data;
}
// Leer catálogo
app.get("/api/catalog", (req, res) => {
  const catalog = loadJSON("./data/catalog.json");
  res.json(catalog);
});

// Guardar catálogo
app.post("/api/catalog", (req, res) => {
  try {
    fs.writeFileSync("./data/catalog.json", JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    console.error("Error guardando catálogo:", e);
    res.status(500).json({ ok: false });
  }
});

// Utilidades para construir mensajes interactivos
function buildButtonMessage({ to, text, buttons }) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: buttons.map(b => ({
          type: "reply",
          reply: { id: b.id, title: b.title }
        }))
      }
    }
  };
}

function buildListMessage({ to, header, body, footer, buttonText, sections }) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: header ? { type: "text", text: header } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        button: buttonText,
        sections: sections.map(s => ({
          title: s.title,
          rows: s.items.map(item => ({
            id: item.id,
            title: item.title,
            description: item.description || ""
          }))
        }))
      }
    }
  };
}

// Cargar datos locales
function loadJSON(path) {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}
const customers = loadJSON("./data/customers.json");
const catalog = loadJSON("./data/catalog.json");

// Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Webhook receiver (POST)
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages || !messages.length) {
      return res.sendStatus(200);
    }

    const msg = messages[0];
    const from = msg.from; // número del cliente (E.164)
    const type = msg.type;

    // Texto libre dentro de 24h
    if (type === "text") {
      const text = msg.text.body.trim().toLowerCase();

      if (text.includes("pedido") || text.includes("menu")) {
        // 1) Enviar lista dinámica (catálogo)
        const payload = buildListMessage({
          to: from,
          header: "Menú",
          body: "Elige una categoría para tu pedido:",
          footer: "Puedes volver a escribir 'menu' para reiniciar.",
          buttonText: "Ver categorías",
          sections: catalog.categories
        });
        await sendMessage(payload);
      } else {
        // Mensaje de bienvenida/ayuda
        await sendMessage({
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: "Hola 👋 Escribe 'menu' o 'pedido' para empezar." }
        });
      }
    }

    // Respuestas interactivas
    if (type === "interactive") {
      const interactive = msg.interactive;

      if (interactive.type === "list_reply") {
        const selection = interactive.list_reply; // { id, title, description }
        // 2) Después de elegir categoría o producto, ofrecer acciones
        const nextButtons = [
          { id: `add_${selection.id}`, title: "Agregar" },
          { id: "ver_carrito", title: "Ver carrito" },
          { id: "finalizar", title: "Finalizar" }
        ];
        const payload = buildButtonMessage({
          to: from,
          text: `Elegiste: ${selection.title}. ¿Qué deseas hacer?`,
          buttons: nextButtons
        });
        await sendMessage(payload);
      }

      if (interactive.type === "button_reply") {
        const button = interactive.button_reply; // { id, title }

        if (button.id.startsWith("add_")) {
          const productId = button.id.replace("add_", "");
          await sendMessage({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: `Añadido al carrito: ${productId}. Escribe 'menu' para agregar más.` }
          });
        } else if (button.id === "ver_carrito") {
          await sendMessage({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: "Tu carrito tiene X ítems (demo). ¿Deseas finalizar?" }
          });
        } else if (button.id === "finalizar") {
          // 3) Confirmación de pedido
          const confirmButtons = [
            { id: "confirm_si", title: "Confirmar" },
            { id: "confirm_no", title: "Cancelar" }
          ];
          await sendMessage(buildButtonMessage({
            to: from,
            text: "Confirma tu pedido:",
            buttons: confirmButtons
          }));
        } else if (button.id === "confirm_si") {
          await sendMessage({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: "¡Pedido confirmado! Gracias." }
          });
        } else if (button.id === "confirm_no") {
          await sendMessage({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: "Pedido cancelado. Escribe 'menu' para iniciar de nuevo." }
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err?.response?.data || err);
    res.sendStatus(200);
  }
});

// Endpoint para disparar un flujo de pedido manualmente desde la web
app.post("/api/send-start", async (req, res) => {
  try {
    const { phone } = req.query; // o req.body
    if (!phone) return res.status(400).json({ error: "phone requerido" });

    const payload = buildButtonMessage({
      to: phone,
      text: "¿Listo para hacer tu pedido?",
      buttons: [
        { id: "start_menu", title: "Ver menú" },
        { id: "hablar_agente", title: "Hablar con agente" }
      ]
    });
    const data = await sendMessage(payload);
    res.json({ ok: true, data });
  } catch (e) {
    console.error(e?.response?.data || e);
    res.status(500).json({ error: "No se pudo enviar el inicio" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
