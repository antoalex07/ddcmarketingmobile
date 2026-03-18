import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

/**
 * MapPickerModal — Leaflet + OpenStreetMap + Nominatim geocoding.
 * Zero API keys required.
 *
 * Props:
 *   visible       (bool)
 *   onClose       (fn)
 *   onConfirm     (fn)  – called with "lat,lng" string
 *   initialCoords (string|null)  – e.g. "12.9716,77.5946"
 */
const MapPickerModal = ({ visible, onClose, onConfirm, initialCoords }) => {
  const webviewRef = useRef(null);

  // markerRef = source of truth; never fed back into WebView (avoids drag loop)
  const markerRef = useRef(null);
  const [displayCoord, setDisplayCoord] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const initialInjected = useRef(false);
  const [locating, setLocating] = useState(false);

  // ── Reset on open/close ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setMapReady(false);
      setDisplayCoord(null);
      markerRef.current = null;
      initialInjected.current = false;
      return;
    }
    seedInitialPosition();
  }, [visible]);

  const seedInitialPosition = async () => {
    if (initialCoords) {
      const parts = initialCoords.split(',').map((s) => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const coord = { lat: parts[0], lng: parts[1] };
        markerRef.current = coord;
        setDisplayCoord(coord);
        return;
      }
    }
    await fetchDeviceLocation(false);
  };

  const fetchDeviceLocation = async (injectNow) => {
    setLocating(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted =
        status === 'granted' ||
        (await Location.requestForegroundPermissionsAsync()).status === 'granted';
      if (!granted) return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coord = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      markerRef.current = coord;
      setDisplayCoord(coord);
      if (injectNow) {
        webviewRef.current?.injectJavaScript(`setMarker(${coord.lat},${coord.lng},true);true;`);
      }
    } catch {
      // Stay at Leaflet default
    } finally {
      setLocating(false);
    }
  };

  // Inject initial position once the map signals ready
  const handleMapReady = () => {
    setMapReady(true);
    if (markerRef.current && !initialInjected.current) {
      initialInjected.current = true;
      const { lat, lng } = markerRef.current;
      webviewRef.current?.injectJavaScript(`setMarker(${lat},${lng},true);true;`);
    }
  };

  // "Use My Location" button
  const handleUseMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted =
        status === 'granted' ||
        (await Location.requestForegroundPermissionsAsync()).status === 'granted';
      if (!granted) {
        Alert.alert('Permission needed', 'Please grant location permission.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coord = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      markerRef.current = coord;
      setDisplayCoord(coord);
      webviewRef.current?.injectJavaScript(`setMarker(${coord.lat},${coord.lng},true);true;`);
    } catch {
      Alert.alert('Error', 'Could not get current location.');
    } finally {
      setLocating(false);
    }
  };

  const handleConfirm = () => {
    const coord = markerRef.current;
    if (!coord) {
      Alert.alert('No location selected', 'Tap the map or search for an address first.');
      return;
    }
    onConfirm(`${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}`);
  };

  // Messages from Leaflet (marker moved, map ready, search request)
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'mapReady') {
        handleMapReady();
        return;
      }

      if (data.type === 'markerMoved') {
        const coord = { lat: data.lat, lng: data.lng };
        markerRef.current = coord;
        setDisplayCoord(coord);
        return;
      }

      // Nominatim search — called from inside the WebView
      if (data.type === 'search') {
        performSearch(data.query);
      }
    } catch {}
  };

  // Nominatim geocoding (runs in RN, avoids CORS issues on Android WebView)
  const performSearch = async (query) => {
    if (!query.trim()) return;
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'DDCMarketingApp/1.0' },
      });
      const results = await res.json();
      // Send results back to the WebView
      webviewRef.current?.injectJavaScript(
        `showSearchResults(${JSON.stringify(results)});true;`
      );
    } catch {
      webviewRef.current?.injectJavaScript(`showSearchResults([]);true;`);
    }
  };

  // ── Leaflet HTML ─────────────────────────────────────────────────────────
  const leafletHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:sans-serif}
    html,body{width:100%;height:100%;overflow:hidden}
    #map{width:100%;height:100%}

    /* Search overlay */
    #search-box{
      position:absolute;top:10px;left:10px;right:10px;z-index:1000;
    }
    #search-input{
      width:100%;padding:10px 14px;border-radius:8px;
      border:none;outline:none;font-size:15px;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
    }
    #results{
      background:#fff;border-radius:8px;margin-top:4px;
      box-shadow:0 2px 8px rgba(0,0,0,0.2);overflow:hidden;
      display:none;
    }
    .result-item{
      padding:11px 14px;border-bottom:1px solid #f0f0f0;
      font-size:13px;color:#1f2937;cursor:pointer;
      line-height:1.4;
    }
    .result-item:last-child{border-bottom:none}
    .result-item:active{background:#eff6ff}
    #no-results{
      padding:12px 14px;font-size:13px;color:#9ca3af;text-align:center;
    }
    #spinner{
      padding:12px;text-align:center;display:none;font-size:13px;color:#6b7280;
    }
  </style>
</head>
<body>
<div id="map"></div>

<div id="search-box">
  <input id="search-input" type="text" placeholder="Search for an address…"
         autocomplete="off" autocorrect="off" spellcheck="false"/>
  <div id="results"></div>
  <div id="spinner">Searching…</div>
</div>

<script>
  var map = L.map('map', {tap:false}).setView([20.5937,78.9629],5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap contributors',
    maxZoom:19
  }).addTo(map);

  var pin = null;

  function postCoord(lat,lng){
    window.ReactNativeWebView.postMessage(
      JSON.stringify({type:'markerMoved',lat:lat,lng:lng})
    );
  }

  function setMarker(lat,lng,pan){
    if(pin){
      pin.setLatLng([lat,lng]);
    } else {
      pin = L.marker([lat,lng],{draggable:true}).addTo(map);
      pin.on('dragend',function(e){
        var p=e.target.getLatLng();
        postCoord(p.lat,p.lng);
      });
    }
    if(pan){map.setView([lat,lng],15);}
    postCoord(lat,lng);
  }

  map.on('click',function(e){
    setMarker(e.latlng.lat,e.latlng.lng,false);
    hideResults();
  });

  /* ── Search ── */
  var searchTimeout = null;
  var input = document.getElementById('search-input');
  var resultsDiv = document.getElementById('results');
  var spinner = document.getElementById('spinner');

  input.addEventListener('input', function(){
    clearTimeout(searchTimeout);
    var q = input.value.trim();
    if(q.length < 3){ hideResults(); return; }
    spinner.style.display='block';
    resultsDiv.style.display='none';
    searchTimeout = setTimeout(function(){
      window.ReactNativeWebView.postMessage(
        JSON.stringify({type:'search',query:q})
      );
    }, 500);
  });

  // Called by RN with Nominatim results
  function showSearchResults(results){
    spinner.style.display='none';
    resultsDiv.innerHTML='';
    if(!results || results.length===0){
      resultsDiv.innerHTML='<div id="no-results">No results found</div>';
      resultsDiv.style.display='block';
      return;
    }
    results.forEach(function(r){
      var div=document.createElement('div');
      div.className='result-item';
      div.textContent=r.display_name;
      div.addEventListener('click',function(){
        var lat=parseFloat(r.lat), lng=parseFloat(r.lon);
        setMarker(lat,lng,true);
        input.value=r.display_name;
        hideResults();
      });
      resultsDiv.appendChild(div);
    });
    resultsDiv.style.display='block';
  }

  function hideResults(){
    resultsDiv.style.display='none';
    spinner.style.display='none';
  }

  window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapReady'}));
</script>
</body>
</html>`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.cancelBtnText}>✕  Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pick Location</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Map + search overlay (all inside WebView) */}
        <WebView
          ref={webviewRef}
          style={styles.map}
          source={{ html: leafletHtml }}
          onMessage={handleMessage}
          javaScriptEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
          scrollEnabled={false}
        />

        {/* Footer */}
        <View style={styles.footer}>
          {displayCoord ? (
            <Text style={styles.coordsDisplay}>
              📌  {displayCoord.lat.toFixed(5)}, {displayCoord.lng.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.hint}>Search an address or tap the map to pin a location</Text>
          )}

          <View style={styles.footerBtns}>
            <TouchableOpacity
              style={styles.myLocationBtn}
              onPress={handleUseMyLocation}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator color="#2563eb" size="small" />
              ) : (
                <Text style={styles.myLocationBtnText}>📍 My Location</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, !displayCoord && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!displayCoord}
            >
              <Text style={styles.confirmBtnText}>Confirm ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 80,
  },
  map: {
    flex: 1,
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  coordsDisplay: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
  footerBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  myLocationBtn: {
    flex: 1,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  myLocationBtnText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#93c5fd',
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default MapPickerModal;
