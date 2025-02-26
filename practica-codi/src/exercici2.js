// Dependencias
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
require('dotenv').config();

// Constantes y configuración
const CARPETA_OBJETIVO = 'steamreviews';
const ARCHIVO_JUEGOS = 'games.csv';
const ARCHIVO_RESEÑAS = 'reviews.csv';
const ARCHIVO_SALIDA = process.env.OUTPUT_FILE_NAME || 'output.json';

async function obtenerContenidoCSV(rutaArchivo) {
  const datos = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(rutaArchivo)
      .pipe(csvParser())
      .on('data', (fila) => datos.push(fila))
      .on('end', () => resolve(datos))
      .on('error', (error) => reject(error));
  });
}

async function obtenerSentimientoOllama(texto) {
  try {
    console.log('Enviando solicitud a Ollama...');
    console.log('Usando modelo:', process.env.CHAT_API_OLLAMA_MODEL_TEXT);

    const respuesta = await fetch(`${process.env.CHAT_API_OLLAMA_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CHAT_API_OLLAMA_MODEL_TEXT,
        prompt: `Analyze the sentiment of this text and respond with only one word (positive/negative/neutral): "${texto}"`,
        stream: false
      })
    });

    if (!respuesta.ok) {
      throw new Error(`Error HTTP: ${respuesta.status} ${respuesta.statusText}`);
    }

    const contenido = await respuesta.json();
    console.log('Respuesta completa de Ollama:', JSON.stringify(contenido, null, 2));

    if (!contenido || !contenido.response) {
      throw new Error('La respuesta de Ollama no tiene el formato esperado');
    }

    return contenido.response.trim().toLowerCase();
  } catch (error) {
    console.error('Error en la solicitud a Ollama:', error);
    console.error('Detalles adicionales:', {
      url: `${process.env.CHAT_API_OLLAMA_URL}/generate`,
      modelo: process.env.CHAT_API_OLLAMA_MODEL_TEXT,
      longitudPrompt: texto.length
    });
    return 'error';
  }
}

async function ejecutarAnalisis() {
  try {
    if (!process.env.DATA_PATH || !process.env.CHAT_API_OLLAMA_URL || !process.env.CHAT_API_OLLAMA_MODEL_TEXT) {
      throw new Error('Faltan variables de entorno necesarias. Revisa tu archivo .env');
    }

    const rutaDatos = process.env.DATA_PATH;
    const rutaJuegos = path.join(__dirname, rutaDatos, CARPETA_OBJETIVO, ARCHIVO_JUEGOS);
    const rutaReseñas = path.join(__dirname, rutaDatos, CARPETA_OBJETIVO, ARCHIVO_RESEÑAS);

    // Verificamos que existan ambos archivos CSV
    if (!fs.existsSync(rutaJuegos) || !fs.existsSync(rutaReseñas)) {
      throw new Error('No se encontraron los archivos CSV necesarios');
    }

    // Lectura del contenido de los CSVs
    const listaJuegos = await obtenerContenidoCSV(rutaJuegos);
    const listaReseñas = await obtenerContenidoCSV(rutaReseñas);

    // Estructura de salida
    const resultadoFinal = {
      fechaEjecucion: new Date().toISOString(),
      juegos: []
    };

    // Solo tomamos los dos primeros juegos como ejemplo
    for (const juego of listaJuegos.slice(0, 2)) {
      // Filtrar reseñas correspondientes y tomar solo 2
      const reseñasDelJuego = listaReseñas.filter(r => r.app_id === juego.appid).slice(0, 2);

      // Contadores de sentimientos
      const estadisticas = {
        positive: 0,
        negative: 0,
        neutral: 0,
        error: 0
      };

      // Analizar cada reseña
      for (const reseña of reseñasDelJuego) {
        const sentimiento = await obtenerSentimientoOllama(reseña.content);
        if (estadisticas.hasOwnProperty(sentimiento)) {
          estadisticas[sentimiento]++;
        } else {
          estadisticas.error++;
        }
      }

      // Agregar datos al resultado
      resultadoFinal.juegos.push({
        appid: juego.appid,
        nombre: juego.name,
        estadisticas
      });
    }

    // Guardar el JSON final
    const rutaSalida = path.join(__dirname, rutaDatos, ARCHIVO_SALIDA);
    fs.writeFileSync(rutaSalida, JSON.stringify(resultadoFinal, null, 2));

    console.log(`Resultado guardado exitosamente en: ${rutaSalida}`);
  } catch (error) {
    console.error('Error durante la ejecución:', error.message);
  }
}

// Ejecutamos la función principal
ejecutarAnalisis();
