// api/webhook.js

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  // ✅ 1) VERIFICACIÓN (GET) PARA META
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send("Verification failed");
    }
  }

  // ✅ 2) MENSAJES ENTRANTES (POST)
  if (req.method === "POST") {
    try {
      const body = req.body;

      if (!body || !body.object) {
        return res.status(200).json({ status: "ignored" });
      }

      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];

      if (!message) {
        return res.status(200).json({ status: "no_message" });
      }

      const from = message.from;
      const text = message.text?.body || "";

      console.log("📩 Mensaje entrante:", { from, text });

      // ✅ 3) LLAMAR A OPENAI (MODELO BARATO: gpt-4o-mini)
      const gptResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "Eres el asistente clínico y estético oficial del Dr. Salvador Cordero. Respondes con precisión, calma y autoridad, sin emojis, sin lenguaje infantil. Siempre invitas a valorar en consulta cuando se requiere exploración física."
              },
              {
                role: "user",
                content: text
              }
            ]
          })
        }
      );

      const gptData = await gptResponse.json();

      let replyText =
        gptData?.choices?.[0]?.message?.content?.trim() ||
        "Gracias por tu mensaje. En un momento el Dr. Cordero o su equipo te responderán.";

      if (!gptResponse.ok) {
        console.error("❌ Error OpenAI:", gptData);
        replyText =
          "He recibido tu mensaje. En este momento no puedo procesar la respuesta automática, pero el equipo del Dr. Cordero te responderá directamente.";
      }

      // ✅ 4) RESPONDER POR WHATSAPP
      const waResponse = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            text: { body: replyText }
          })
        }
      );

      const waData = await waResponse.json();

      if (!waResponse.ok) {
        console.error("❌ Error enviando a WhatsApp:", waData);
        return res
          .status(500)
          .json({ status: "error_whatsapp", detail: waData });
      }

      console.log("✅ Mensaje enviado a WhatsApp:", waData);

      return res.status(200).json({ status: "sent" });
    } catch (error) {
      console.error("❌ Error en webhook:", error);
      return res.status(500).json({ status: "server_error" });
    }
  }

  // ✅ 3) MÉTODO NO PERMITIDO
  return res.status(405).json({ error: "Method not allowed" });
}
