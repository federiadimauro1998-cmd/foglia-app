// Netlify Function: riconoscimento pianta da foto tramite Pl@ntNet API.
//
// La chiave API NON è scritta qui: viene letta dalla variabile d'ambiente
// PLANTNET_API_KEY, che va impostata su Netlify (Site settings → Environment
// variables), mai nel codice pubblico dell'app.
//
// L'app manda una foto (come immagine in base64) in POST a questa funzione,
// che la inoltra a PlantNet e restituisce i nomi delle specie più probabili
// con la relativa percentuale di confidenza.

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Metodo non consentito" }) };
  }

  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Chiave API PlantNet non configurata sul server (PLANTNET_API_KEY mancante)." })
    };
  }

  try {
    const { imageBase64, organ } = JSON.parse(event.body || "{}");
    if (!imageBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Nessuna immagine ricevuta." }) };
    }

    // Converte il base64 (data URL o puro) in un Buffer binario.
    const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const buffer = Buffer.from(base64Data, "base64");

    // Costruisce una multipart/form-data manualmente (senza dipendenze extra).
    const boundary = "----FogliaBoundary" + Date.now();
    const organField = organ || "auto";
    const parts = [];
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="organs"\r\n\r\n${organField}\r\n`
    ));
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="foto.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    ));
    parts.push(buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const bodyBuffer = Buffer.concat(parts);

    const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(apiKey)}&lang=it`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: bodyBuffer
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers,
        body: JSON.stringify({ error: data.message || "Errore nella richiesta a PlantNet.", details: data })
      };
    }

    // Semplifica la risposta: le prime 3 ipotesi con nome comune, nome
    // scientifico e percentuale di affidabilità.
    const results = (data.results || []).slice(0, 3).map(r => ({
      scientificName: r.species?.scientificNameWithoutAuthor || "",
      commonNames: r.species?.commonNames || [],
      score: Math.round((r.score || 0) * 100)
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ results }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Errore interno: " + err.message }) };
  }
};
