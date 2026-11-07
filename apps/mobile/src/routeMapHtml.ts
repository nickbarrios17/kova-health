/**
 * The cycling map (docs/ciclismo.md): MapLibre GL in a WebView (phone) or an iframe (browser), with
 * OpenFreeMap tiles (no key) and AWS terrain tiles for the 3D view. The app talks to it with messages:
 *
 *   in:  { routes: [{ coords, segments, selected }], parks, markers: [{ coord, kind }], fit?: boolean, view3d?: boolean, fly?: boolean }
 *   out: { type: 'tap', coord: [lng, lat] } | { type: 'ready' }
 *
 * No user data leaves the device except the map area being looked at (to load tiles).
 */
export const WAY_COLORS = { bicisenda: '#22b573', calle: '#7b68d9', avenida: '#f2853a', sendero: '#2fa8e0', otro: '#8b8ca3' } as const;

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl';
const PMTILES = 'https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js';
// Overture Maps buildings: OpenStreetMap plus Microsoft/Google footprints, so every block is filled.
// If this release ever goes away, the map falls back to the OpenStreetMap buildings.
const OVERTURE_BUILDINGS = 'https://overturemaps-extras-us-west-2.s3.amazonaws.com/tiles/2026-10-21.0/buildings.pmtiles';

/** The page behind the map, for the containers so nothing flashes dark while it loads. */
export const MAP_BG = '#f3f2ef';

// A light "scale model" look: white extruded buildings, pale streets, green parks, few labels.
// OpenFreeMap vector tiles (OpenMapTiles schema), no key.
const ROAD_W = (minor: number, major: number) => [
  'interpolate', ['exponential', 1.5], ['zoom'],
  10, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], major * 0.25, minor * 0.1],
  18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], major * 4, ['secondary', 'tertiary'], major * 3, minor * 3],
];
const EXTRUDE = { 'fill-extrusion-color': '#fbfaf8', 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true };
const STYLE = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    ov: { type: 'vector', url: 'pmtiles://' + OVERTURE_BUILDINGS, attribution: '<a href="https://overturemaps.org">Overture Maps</a>' },
  },
  light: { anchor: 'map', color: '#ffffff', intensity: 0.6, position: [1.3, 210, 40] },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': MAP_BG } },
    { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood']]], paint: { 'fill-color': '#dcebd0' } },
    { id: 'parks-base', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#dcebd0' } },
    { id: 'pitch', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['pitch', 'cemetery', 'stadium']]], paint: { 'fill-color': '#e3eddb' } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#cddfea' } },
    { id: 'paths', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14, filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]], paint: { 'line-color': '#d6d6d2', 'line-width': 1.2, 'line-dasharray': [2, 1.5] } },
    { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': '#d2d1cd', 'line-width': 1.5 } },
    { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#d3d7e0', '#dfe1e6'], 'line-width': ROAD_W(3, 5) } },
    { id: 'buildings', type: 'fill-extrusion', source: 'ov', 'source-layer': 'building', minzoom: 13, filter: ['!=', ['get', 'is_underground'], true], paint: { ...EXTRUDE, 'fill-extrusion-height': ['case', ['has', 'height'], ['get', 'height'], ['has', 'num_floors'], ['*', ['get', 'num_floors'], 3.2], 7], 'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0] } },
    { id: 'buildings-osm', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13, layout: { visibility: 'none' }, filter: ['!=', ['get', 'hide_3d'], true], paint: { ...EXTRUDE, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] } },
    { id: 'road-names', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: { 'text-color': '#8d8e96', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } },
    { id: 'places', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 14, filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb', 'neighbourhood']]], layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['match', ['get', 'class'], 'city', 14, 12] }, paint: { 'text-color': '#6e6f78', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } },
  ],
};

export const ROUTE_MAP_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${MAPLIBRE}.css">
<style>html,body,#m{margin:0;height:100%;background:${MAP_BG}}.maplibregl-ctrl-attrib{font-size:10px}</style>
</head><body><div id="m"></div>
<script src="${MAPLIBRE}.js"></script>
<script src="${PMTILES}"></script>
<script>
(function(){
  var COLORS = ${JSON.stringify(WAY_COLORS)};
  function send(msg){
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage({ kovaMap: s }, '*');
  }
  if (window.pmtiles) maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
  var map = new maplibregl.Map({
    container: 'm', style: ${JSON.stringify(STYLE)},
    center: [-58.4370, -34.6070], zoom: 11.5, attributionControl: { compact: true }, maxPitch: 75
  });
  var ready = false, pending = null, flying = null, last = null;
  var empty = { type: 'FeatureCollection', features: [] };
  map.on('load', function(){
    map.addSource('dem', { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
    map.addSource('parks', { type: 'geojson', data: empty });
    map.addSource('others', { type: 'geojson', data: empty });
    map.addSource('route', { type: 'geojson', data: empty });
    map.addSource('marks', { type: 'geojson', data: empty });
    map.addLayer({ id: 'parks', type: 'fill', source: 'parks', paint: { 'fill-color': '#9fd8a8', 'fill-opacity': 0.35 } });
    map.addLayer({ id: 'others', type: 'line', source: 'others', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7b7d92', 'line-width': 4, 'line-opacity': 0.75, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10 } });
    map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 6 } });
    map.addLayer({ id: 'marks', type: 'circle', source: 'marks', paint: { 'circle-radius': 8, 'circle-color': ['match', ['get', 'kind'], 'start', '#5fd39a', 'end', '#f25f5c', 'me', '#4aa3ff', '#e9e9ed'], 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });
    ready = true;
    if (pending) apply(pending);
    send({ type: 'ready' });
  });
  // Overture buildings unavailable (offline release, blocked script): use the OpenStreetMap ones.
  var fellBack = false;
  map.on('error', function(e){
    if (fellBack || !e || e.sourceId !== 'ov' || !map.getLayer('buildings-osm')) return;
    fellBack = true;
    map.setLayoutProperty('buildings', 'visibility', 'none');
    map.setLayoutProperty('buildings-osm', 'visibility', 'visible');
  });
  if (!window.pmtiles) map.once('styledata', function(){ map.fire('error', { sourceId: 'ov' }); });
  map.on('click', function(e){
    if (map.queryRenderedFeatures(e.point, { layers: ['others'] }).length) {
      var f = map.queryRenderedFeatures(e.point, { layers: ['others'] })[0];
      send({ type: 'pick', index: f.properties.index });
      return;
    }
    send({ type: 'tap', coord: [e.lngLat.lng, e.lngLat.lat] });
  });

  function line(coords, from, to){ return coords.slice(from, to + 1).map(function(c){ return [c[0], c[1]]; }); }
  function apply(d){
    last = d;
    var sel = null, others = [], parts = [];
    (d.routes || []).forEach(function(r, i){
      if (r.selected) sel = r;
      else others.push({ type: 'Feature', properties: { index: i }, geometry: { type: 'LineString', coordinates: line(r.coords, 0, r.coords.length - 1) } });
    });
    if (sel) {
      var segs = sel.segments && sel.segments.length ? sel.segments : [{ from: 0, to: sel.coords.length - 1, kind: 'otro' }];
      segs.forEach(function(s){ parts.push({ type: 'Feature', properties: { color: COLORS[s.kind] || COLORS.otro }, geometry: { type: 'LineString', coordinates: line(sel.coords, s.from, s.to) } }); });
    }
    var parks = (d.parks || []).map(function(p){ return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: p.rings } }; });
    var marks = (d.markers || []).map(function(m){ return { type: 'Feature', properties: { kind: m.kind }, geometry: { type: 'Point', coordinates: m.coord } }; });
    map.getSource('parks').setData({ type: 'FeatureCollection', features: parks });
    map.getSource('others').setData({ type: 'FeatureCollection', features: others });
    map.getSource('route').setData({ type: 'FeatureCollection', features: parts });
    map.getSource('marks').setData({ type: 'FeatureCollection', features: marks });

    set3d(!!d.view3d);
    if (d.fit) {
      var pts = [];
      (d.routes || []).forEach(function(r){ r.coords.forEach(function(c){ pts.push(c); }); });
      (d.markers || []).forEach(function(m){ pts.push(m.coord); });
      if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 14 });
      else if (pts.length > 1) {
        var b = new maplibregl.LngLatBounds(pts[0], pts[0]);
        pts.forEach(function(p){ b.extend([p[0], p[1]]); });
        map.fitBounds(b, { padding: 40, pitch: d.view3d ? 55 : 0, duration: 600 });
      }
    }
    if (d.fly && sel) fly(sel.coords); else stopFly();
  }
  function set3d(on){
    if (on) {
      if (!map.getTerrain()) map.setTerrain({ source: 'dem', exaggeration: 1.6 });
      if (map.getPitch() < 30) map.easeTo({ pitch: 58, duration: 600 });
    } else {
      if (map.getTerrain()) map.setTerrain(null);
      if (map.getPitch() > 0) map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }
  }
  function stopFly(){ if (flying) { cancelAnimationFrame(flying); flying = null; } }
  // A 3D flyover along the route: the camera follows the path, looking ahead.
  function fly(coords){
    stopFly();
    if (!map.getTerrain()) map.setTerrain({ source: 'dem', exaggeration: 1.6 });
    var pts = coords.map(function(c){ return [c[0], c[1]]; });
    var dist = [0];
    for (var i = 1; i < pts.length; i++) {
      var dx = (pts[i][0] - pts[i-1][0]) * Math.cos(pts[i][1] * Math.PI / 180), dy = pts[i][1] - pts[i-1][1];
      dist.push(dist[i-1] + Math.sqrt(dx*dx + dy*dy));
    }
    var total = dist[dist.length - 1] || 1, ms = Math.min(45000, Math.max(15000, total * 111000 * 1.5)), t0 = null;
    function at(f){
      var target = f * total, k = 1;
      while (k < dist.length - 1 && dist[k] < target) k++;
      var seg = (dist[k] - dist[k-1]) || 1, u = (target - dist[k-1]) / seg;
      return [pts[k-1][0] + (pts[k][0] - pts[k-1][0]) * u, pts[k-1][1] + (pts[k][1] - pts[k-1][1]) * u];
    }
    function frame(ts){
      if (t0 === null) t0 = ts;
      var f = Math.min(1, (ts - t0) / ms), here = at(f), ahead = at(Math.min(1, f + 0.02));
      var bearing = Math.atan2((ahead[0] - here[0]) * Math.cos(here[1] * Math.PI / 180), ahead[1] - here[1]) * 180 / Math.PI;
      map.jumpTo({ center: here, bearing: map.getBearing() + (((bearing - map.getBearing() + 540) % 360) - 180) * 0.08, pitch: 62, zoom: 16 });
      if (f < 1) flying = requestAnimationFrame(frame); else { flying = null; send({ type: 'flyEnd' }); }
    }
    flying = requestAnimationFrame(frame);
  }
  window.kovaMap = function(d){ stopFly(); if (ready) apply(d); else pending = d; };
  window.addEventListener('message', function(e){
    if (e.data && e.data.kovaMapIn) window.kovaMap(JSON.parse(e.data.kovaMapIn));
  });
  document.addEventListener('message', function(e){ try { window.kovaMap(JSON.parse(e.data)); } catch (_) {} });
})();
</script></body></html>`;
