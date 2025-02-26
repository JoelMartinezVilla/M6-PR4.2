// Dependencias principales
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Configuración y constantes a partir de .env
const SUBCARPETA_IMAGENES = 'imatges/animals';
const TIPOS_IMAGEN = ['.jpg', '.jpeg', '.png', '.gif'];
const URL_OLLAMA = process.env.CHAT_API_OLLAMA_URL;
const MODELO_OLLAMA = process.env.CHAT_API_OLLAMA_MODEL_VISION;


async function convertirImagenABase64(rutaImagen) {
  try {
    const contenido = await fs.readFile(rutaImagen);
    return Buffer.from(contenido).toString('base64');
  } catch (error) {
    console.error(`Fallo al leer/convertir la imagen ${rutaImagen}:`, error.message);
    return null;
  }
}

async function consultarOllama(imagenBase64, prompt) {
  const cuerpoSolicitud = {
    model: MODELO_OLLAMA,
    prompt: prompt,
    images: [imagenBase64],
    stream: false
  };

  try {
    console.log('Lanzando petición a Ollama...');
    console.log(`Endpoint: ${URL_OLLAMA}/generate`);
    console.log('Modelo:', MODELO_OLLAMA);

    const respuesta = await fetch(`${URL_OLLAMA}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoSolicitud)
    });

    if (!respuesta.ok) {
      throw new Error(`Error en la respuesta HTTP: ${respuesta.status} - ${respuesta.statusText}`);
    }

    const datos = await respuesta.json();
    console.log('Respuesta completa de Ollama:', JSON.stringify(datos, null, 2));

    if (!datos || !datos.response) {
      throw new Error('Estructura inesperada en la respuesta de Ollama');
    }
    return datos.response;
  } catch (error) {
    console.error('Error al consultar Ollama:', error);
    console.error('Detalles adicionales:', {
      url: `${URL_OLLAMA}/generate`,
      modelo: MODELO_OLLAMA,
      longitudPrompt: prompt.length,
      longitudImagenBase64: imagenBase64.length
    });
    return null;
  }
}

async function generarArchivoSalida(resultado) {
  const directorioSalida = path.join(__dirname, 'data');
  const rutaArchivoSalida = path.join(directorioSalida, 'exercici3_resposta.json');

  try {
    await fs.access(directorioSalida);
  } catch (error) {
    await fs.mkdir(directorioSalida, { recursive: true });
  }

  await fs.writeFile(rutaArchivoSalida, JSON.stringify(resultado, null, 2));
  console.log(`Archivo con resultados guardado en: ${rutaArchivoSalida}`);
}

/**
 * Función principal que orquesta la lectura de imágenes, conversión a Base64,
 * consulta al API de Ollama y guardado del resultado.
 */
async function main() {
  try {
    // Verificamos que las variables de entorno requeridas estén definidas
    if (!process.env.DATA_PATH) {
      throw new Error('Falta definir la variable de entorno DATA_PATH.');
    }
    if (!URL_OLLAMA) {
      throw new Error('Falta definir la variable de entorno CHAT_API_OLLAMA_URL.');
    }
    if (!MODELO_OLLAMA) {
      throw new Error('Falta definir la variable de entorno CHAT_API_OLLAMA_MODEL_VISION.');
    }

    // Ruta a la carpeta donde se encuentran las imágenes
    const rutaCarpetaImagenes = path.join(__dirname, process.env.DATA_PATH, SUBCARPETA_IMAGENES);
    // Verificamos que la carpeta exista
    try {
      await fs.access(rutaCarpetaImagenes);
    } catch (error) {
      throw new Error(`No se encontró el directorio de imágenes: ${rutaCarpetaImagenes}`);
    }

    // Leemos el contenido de la carpeta (subcarpetas correspondientes a animales)
    const directoriosAnimales = await fs.readdir(rutaCarpetaImagenes);
    const resultadoGlobal = { analisis: [] };

    // Recorremos cada subcarpeta dentro de la carpeta principal de imágenes
    for (const carpetaAnimal of directoriosAnimales) {
      const rutaCarpetaAnimal = path.join(rutaCarpetaImagenes, carpetaAnimal);

      try {
        const info = await fs.stat(rutaCarpetaAnimal);
        if (!info.isDirectory()) {
          console.log(`Elemento no válido (no es carpeta): ${rutaCarpetaAnimal}`);
          continue;
        }
      } catch (error) {
        console.error(`Error al obtener info de la carpeta: ${rutaCarpetaAnimal}`, error.message);
        continue;
      }

      // Listamos todos los archivos de la subcarpeta correspondiente al animal
      const archivosImagen = await fs.readdir(rutaCarpetaAnimal);

      // Recorremos cada archivo dentro de esa subcarpeta
      for (const archivo of archivosImagen) {
        const rutaArchivo = path.join(rutaCarpetaAnimal, archivo);
        const extension = path.extname(rutaArchivo).toLowerCase();

        // Ignoramos archivos que no tengan una extensión de imagen válida
        if (!TIPOS_IMAGEN.includes(extension)) {
          console.log(`Se ignora un archivo no válido: ${rutaArchivo}`);
          continue;
        }

        // Convertimos la imagen a Base64
        const contenidoBase64 = await convertirImagenABase64(rutaArchivo);

        if (contenidoBase64) {
          console.log(`\nProcesando imagen: ${rutaArchivo}`);
          console.log(`Tamaño en Base64: ${contenidoBase64.length} caracteres`);

          // Definimos el prompt para Ollama
          const prompt = "Identifica qué tipo de animal aparece en la imagen";
          console.log('Prompt usado:', prompt);

          // Enviamos la solicitud a Ollama
          const respuesta = await consultarOllama(contenidoBase64, prompt);

          if (respuesta) {
            console.log(`\nRespuesta de Ollama para ${archivo}:`);
            console.log(respuesta);

            // Agregamos la información obtenida al resultado global
            resultadoGlobal.analisis.push({
              nombreArchivo: archivo,
              resultadoOllama: respuesta
            });
          } else {
            console.error(`\nNo se recibió una respuesta válida de Ollama para el archivo ${archivo}`);
          }
          console.log('------------------------');
        }
      }
      console.log(`\nSe detiene la ejecución tras iterar el primer directorio de imágenes.`);
      break; // Detenemos la ejecución después de procesar la primera carpeta.
    }

    // Finalmente, guardamos el resultado en un archivo JSON
    await generarArchivoSalida(resultadoGlobal);

  } catch (error) {
    console.error('Se produjo un error en la ejecución:', error.message);
  }
}

// Lanzamos la función principal
main();
