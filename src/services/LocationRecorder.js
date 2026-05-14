import { insertPoint } from '../db/locationDB';

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const hasValidCoordinates = (latitude, longitude) => (
  isFiniteNumber(latitude) &&
  isFiniteNumber(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180
);

const toOptionalNumber = (value) => (isFiniteNumber(value) ? value : null);

export const recordLocation = async (location, sessionId) => {
  const coords = location?.coords;
  const coordinatesValid = hasValidCoordinates(coords?.latitude, coords?.longitude);
  const timestamp = Number.isNaN(new Date(location?.timestamp).getTime())
    ? new Date()
    : new Date(location.timestamp);

  await insertPoint({
    session_id: sessionId,
    latitude: coordinatesValid ? coords.latitude : null,
    longitude: coordinatesValid ? coords.longitude : null,
    accuracy: toOptionalNumber(coords?.accuracy),
    speed: toOptionalNumber(coords?.speed),
    heading: toOptionalNumber(coords?.heading),
    timestamp: timestamp.toISOString()
  });
};
