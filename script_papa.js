const { google } = require('googleapis');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const WASENDER_TOKEN_PAPA = process.env.WASENDER_TOKEN_PAPA;
const CALENDAR_ID_PAPA = process.env.CALENDAR_ID_PAPA;
const NUMERO_PAPA = "5491154773088"; // Tu número para el resumen

const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_PAPA),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

function filtrarEventosQueMostrar(eventos = []) {
    return eventos.filter((evento) => {
        const summary = evento.summary?.toLowerCase();
        return summary && (summary.startsWith("mostrar") || summary.startsWith("depto"));
    });
}

function obtenerFechaInicioEvento(evento) {
    return new Date(evento.start.dateTime || `${evento.start.date}T00:00:00`);
}

function obtenerHoraEvento(evento) {
    const fechaEvento = obtenerFechaInicioEvento(evento);
    fechaEvento.setHours(fechaEvento.getHours() - 3);
    return fechaEvento.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function obtenerEventosEntre(timeMin, timeMax) {
    const res = await Promise.all([
        calendar.events.list({
            calendarId: CALENDAR_ID_PAPA,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        }),
    ]);

    const eventos = res[0].data.items || [];
    const todosLosEventos = filtrarEventosQueMostrar(eventos);

    console.log(`Eventos encontrados: ${todosLosEventos.length}`);
    return todosLosEventos;
}

async function obtenerEventosParaMostrar(timeMin, timeMax) {
    const res = await Promise.all([
        calendar.events.list({
            calendarId: CALENDAR_ID_PAPA,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        }),
    ]);

    const eventos = res[0].data.items || [];
    const todosLosEventos = filtrarEventosQueMostrar(eventos);

    console.log(`Eventos encontrados: ${todosLosEventos.length}`);
    return todosLosEventos;
}

async function enviarResumenHoyAPapa() {
    console.log("Armando resumen de hoy para papá...");

    const mananaInicio = new Date();
    mananaInicio.setDate(mananaInicio.getDate());
    mananaInicio.setHours(0, 0, 0, 0);

    const mananaFin = new Date();
    mananaFin.setDate(mananaFin.getDate());
    mananaFin.setHours(23, 59, 59, 999);

    try {
        const eventos = await obtenerEventosEntre(mananaInicio.toISOString(), mananaFin.toISOString());

        if (eventos.length === 0) {
            await enviarWhatsApp(NUMERO_PAPA, "Hola! No hay visitas agendadas para hoy.");
            return;
        }

        let resumen = "📅 *Resumen de eventos de hoy:*\n\n";

        for (const evento of eventos) {
            // 1. Ajuste de 3 horas (si obtenerHoraEvento no lo hace)
            let fecha = new Date(evento.start.dateTime || evento.start.date);
            fecha.setHours(fecha.getHours() - 3);

            // Usamos una función simple para formatear HH:mm
            const horaAjustada = fecha.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            const texto = evento.summary.toLowerCase();
            let mensajeLinea = "";

            // 2. Lógica de mensajes diferenciados
            if (texto.startsWith("mostrar")) {
                // Para los "Mostrar", mantenemos el estilo de visita
                mensajeLinea = `🔑 *Visita:* ${evento.summary}`;
            }
            else if (texto.startsWith("depto")) {
                // Para los "Depto", un estilo de gestión/mantenimiento
                mensajeLinea = `🏠 *Gestión:* ${evento.summary}`;
            }
            else {
                mensajeLinea = evento.summary;
            }

            resumen += `• ${horaAjustada}: ${mensajeLinea}\n`;
        }

        await enviarWhatsApp(NUMERO_PAPA, resumen);
        console.log("Resumen diario enviado a papá.");
    } catch (error) {
        console.error("Error al enviar resumen diario:", error);
    }
}

async function enviarRecordatoriosAClientes() {
    console.log("Enviando recordatorios a clientes para hoy...");

    const mananaInicio = new Date();
    mananaInicio.setDate(mananaInicio.getDate());
    mananaInicio.setHours(0, 0, 0, 0);

    const mananaFin = new Date();
    mananaFin.setDate(mananaFin.getDate());
    mananaFin.setHours(23, 59, 59, 999);

    try {
        const eventos = await obtenerEventosParaMostrar(mananaInicio.toISOString(), mananaFin.toISOString());

        if (eventos.length === 0) {
            console.log("No hay clientes para avisar hoy.");
            return;
        }

        for (let i = 0; i < eventos.length; i++) {
            const evento = eventos[i];
            const telefono = evento.summary.match(/\+\d[\d\s-]{7,}/)?.[0]?.replace(/\D/g, '') || null;

            if (!telefono) {
                continue;
            }

            const fecha = obtenerFechaInicioEvento(evento);
            fecha.setHours(fecha.getHours() - 3);
            const hora = fecha.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const direccion = evento.location || "la dirección acordada";
            const mensajePaciente = `Hola! Te recuerdo que te espero hoy, a las ${hora}\nen ${direccion}. \n\nGonzalez Soro, servicios inmobiliarios.\n\n_Por favor *reacciona* con un "👍" para confirmar._`;
            await enviarWhatsApp(telefono, mensajePaciente);
        }

        console.log("Recordatorios enviados correctamente.");
    } catch (error) {
        console.error("Error al enviar recordatorios:", error);
    }
}

// Función de envío genérica
async function enviarWhatsApp(numero, texto) {
    try {
        await axios.post("https://www.wasenderapi.com/api/send-message", {
            to: numero,
            text: texto
        }, {
            headers: {
                'Authorization': `Bearer ${WASENDER_TOKEN_PAPA}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ WhatsApp enviado a: ${numero}`);
    } catch (error) {
        console.error(`❌ Error enviando a ${numero}:`, error.response?.data || error.message);
    }
}

enviarResumenHoyAPapa();
enviarRecordatoriosAClientes();

