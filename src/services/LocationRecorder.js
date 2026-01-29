import { insertPoint } from '../db/locationDB';

export const recordLocation = async (location, sessionId) => {
  await insertPoint({
    session_id: sessionId,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    speed: location.coords.speed,
    heading: location.coords.heading,
    timestamp: new Date(location.timestamp).toISOString()
  });
};
