// Where HaNet's functions run (muxp 2026-11-21): in Santiago, next to the
// Firestore databases (southamerica-west1), so each read stays in the same
// region instead of crossing from Iowa. The move was a straight cut: the
// Iowa copies were deleted and testers updated the app.
//
// icalFeed is the exception and stays in Iowa too: calendars that subscribed
// before the move have the Iowa address (see index.js).
//
// Scheduled functions run in São Paulo: Cloud Scheduler has no location in
// Santiago (https://docs.cloud.google.com/scheduler/docs/locations), and São
// Paulo is the closest region that has it.

const https = require("firebase-functions/v2/https");

const SANTIAGO = "southamerica-west1";
const IOWA = "us-central1";
const SAO_PAULO = "southamerica-east1";
const HTTPS_REGIONS = [SANTIAGO];
const SCHEDULE_REGION = SAO_PAULO;

// onCall and onRequest with HTTPS_REGIONS unless the function names its own.
function inRegions(trigger) {
  return (optionsOrHandler, handler) =>
    typeof optionsOrHandler === "function"
      ? trigger({ region: HTTPS_REGIONS }, optionsOrHandler)
      : trigger({ region: HTTPS_REGIONS, ...optionsOrHandler }, handler);
}

module.exports = {
  SANTIAGO,
  IOWA,
  SAO_PAULO,
  HTTPS_REGIONS,
  SCHEDULE_REGION,
  HttpsError: https.HttpsError,
  onCall: inRegions(https.onCall),
  onRequest: inRegions(https.onRequest),
};
