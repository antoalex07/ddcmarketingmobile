import { getUnsyncedPoints, markAsSynced } from '../db/locationDB';
import api from '../config/api';

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const uploadBatch = async (token, sessionId, points) => {
  const payload = points.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    accuracy: p.accuracy,
    speed: p.speed,
    heading: p.heading,
    timestamp: p.timestamp,
  }));

  await api.post(
    '/sessions/locations/bulk',
    { sessionId, points: payload },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

export const uploadUnsyncedLocations = async (token) => {
  const unsyncedPoints = await getUnsyncedPoints();

  if (unsyncedPoints.length === 0) {
    return { uploaded: 0, failed: 0 };
  }

  // Group points by session_id
  const pointsBySession = {};
  for (const point of unsyncedPoints) {
    const sid = point.session_id;
    if (sid === null) continue; // Skip points without session
    if (!pointsBySession[sid]) {
      pointsBySession[sid] = [];
    }
    pointsBySession[sid].push(point);
  }

  let uploaded = 0;
  let failed = 0;

  // Upload each session's points in batches
  for (const [sessionId, points] of Object.entries(pointsBySession)) {
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map((p) => p.id);

      let success = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await uploadBatch(token, parseInt(sessionId, 10), batch);
          await markAsSynced(batchIds);
          uploaded += batch.length;
          success = true;
          break;
        } catch (err) {

          if (attempt < MAX_RETRIES) {
            await delay(RETRY_DELAY_MS * attempt);
          }
        }
      }

      if (!success) {
        failed += batch.length;
      }
    }
  }

  return { uploaded, failed };
};
