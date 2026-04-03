const functions = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const ical = require("ical-generator").default;

// We delay the initialization to avoid deployment timeouts
let app;

exports.icalFeed = functions.https.onRequest(async (req, res) => {
  const courseId = req.query.courseId;
  
  if (!courseId) {
    res.status(400).send("Falta el parámetro courseId. Uso: ?courseId=2k");
    return;
  }

  try {
    if (!app) {
      app = initializeApp();
    }
    // Access the specifically named database for events
    const db = getFirestore(app, "hn-calendar");
    const eventsRef = db.collection(`HNC-LCH.${courseId}`);
    const snapshot = await eventsRef.get();

    const calendar = ical({
      name: `HaNet Calendar - ${courseId.toUpperCase()}`,
      description: `Calendario Institucional Oficial (HaNet) para el curso ${courseId}`,
      timezone: "America/Santiago",
    });

    // We add a TTL (Time To Live) so Apple Calendar natively knows how often to sync
    calendar.ttl(60 * 60); // 1 hour

    snapshot.forEach((doc) => {
      const data = doc.data();
      const start = data.startDate ? data.startDate.toDate() : new Date();
      const end = data.endDate ? data.endDate.toDate() : new Date(start.getTime() + 90 * 60000);

      const typeIndicator = data.type ? `[${data.type}] ` : '';
      const subjectInd = data.subject ? ` (${data.subject})` : '';
      
      calendar.createEvent({
        id: doc.id,
        start: start,
        end: end,
        summary: `${typeIndicator}${data.title}${subjectInd}`,
        description: data.description || "Evento programado. Administrado por HaNet Institucional.",
        location: data.location || "Liceo",
        // Apple Calendar support tweaks
        sequence: 0,
        status: data.cancelled ? 'CANCELLED' : 'CONFIRMED'
      });
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="hanet-${courseId}.ics"`);
    res.send(calendar.toString());

  } catch (error) {
    console.error("Error al generar Node-iCal:", error);
    res.status(500).send("Error interno generando el calendario.");
  }
});
