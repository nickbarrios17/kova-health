/**
 * The cycling map (docs/ciclismo.md): MapLibre GL in a WebView (phone) or an iframe (browser), with
 * OpenFreeMap tiles (no key) and AWS terrain tiles for the 3D view. The app talks to it with messages:
 *
 *   map:  { routes: [{ coords, segments, selected }], parks, markers: [{ coord, kind }], fit?: boolean, view3d?: boolean }
 *   ride: { kmh, paused } to start or change «Recorrer en 3D» on the selected route, null to stop it
 *   out:  { type: 'ready' } | { type: 'tap', coord: [lng, lat] } | { type: 'pick', index }
 *         | { type: 'rideProgress', done_m, total_m } | { type: 'flyEnd' }
 *
 * No user data leaves the device except the map area being looked at (to load tiles).
 */
export const WAY_COLORS = { bicisenda: '#22b573', calle: '#7b68d9', avenida: '#f2853a', sendero: '#2fa8e0', otro: '#8b8ca3' } as const;

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl';
const THREE_JS = 'https://unpkg.com/three@0.149.0/build/three.min.js';
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
  var COLORS = ${JSON.stringify(WAY_COLORS)}, THREE_URL = '${THREE_JS}';
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
  var ready = false, pending = null, last = null;
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
    if (pendingRide) { startRide(pendingRide); pendingRide = null; }
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

    set3d(!!d.view3d || !!ride);
    if (d.fit && !ride) {
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
    selCoords = sel ? sel.coords : null;
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
  // «Recorrer en 3D»: a 3D bike rides the route and the camera follows it from behind.
  // Speed is in km/h of map distance; it can change or pause mid-ride without restarting.
  var ride = null, selCoords = null, bike = null, threeLoading = false, pendingRide = null;
  // Bigger than life so it reads on a phone screen.
  var BIKE_SCALE = 7;
  function meters(a, b){
    var R = 6371000, la1 = a[1] * Math.PI / 180, la2 = b[1] * Math.PI / 180;
    var dla = la2 - la1, dlo = (b[0] - a[0]) * Math.PI / 180;
    var h = Math.sin(dla/2) * Math.sin(dla/2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo/2) * Math.sin(dlo/2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearingOf(a, b){
    var la1 = a[1] * Math.PI / 180, la2 = b[1] * Math.PI / 180, dlo = (b[0] - a[0]) * Math.PI / 180;
    return Math.atan2(Math.sin(dlo) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo)) * 180 / Math.PI;
  }
  function stopRide(){
    if (ride && ride.raf) cancelAnimationFrame(ride.raf);
    ride = null;
    if (bike) { bike.group.visible = false; map.triggerRepaint(); }
  }
  // three.js is big, so it only loads the first time someone starts a ride.
  function loadThree(cb){
    if (window.THREE) return cb();
    if (threeLoading) return;
    threeLoading = true;
    var s = document.createElement('script');
    s.src = THREE_URL;
    s.onload = s.onerror = function(){ threeLoading = false; cb(); };
    document.head.appendChild(s);
  }
  // The bike and rider, built from simple shapes, in meters: x forward, y up, z to the side.
  function makeBike(){
    var T = window.THREE, g = new T.Group();
    var mat = function(c){ return new T.MeshLambertMaterial({ color: c }); };
    var frame = mat('#7b68d9'), dark = mat('#26272f'), metal = mat('#b9bcc6'), jersey = mat('#22b573'), skin = mat('#e2b48e'), white = mat('#ffffff'), shorts = mat('#2b2c38');
    var up = new T.Vector3(0, 1, 0);
    function tube(r, m){ var t = new T.Mesh(new T.CylinderGeometry(r, r, 1, 10), m); g.add(t); return t; }
    function place(t, a, b){
      var va = new T.Vector3(a[0], a[1], a[2] || 0), vb = new T.Vector3(b[0], b[1], b[2] || 0), d = vb.clone().sub(va);
      t.position.copy(va).add(vb).multiplyScalar(0.5);
      t.scale.set(1, d.length() || 0.001, 1);
      t.quaternion.setFromUnitVectors(up, d.normalize());
    }
    function wheel(x){
      var w = new T.Group();
      w.add(new T.Mesh(new T.TorusGeometry(0.34, 0.035, 8, 32), dark));
      for (var i = 0; i < 3; i++) { var sp = new T.Mesh(new T.BoxGeometry(0.66, 0.012, 0.012), metal); sp.rotation.z = i * Math.PI / 3; w.add(sp); }
      w.position.set(x, 0.34, 0); g.add(w); return w;
    }
    var rear = wheel(-0.52), front = wheel(0.52);
    var RH = [-0.52, 0.34], BB = [0, 0.3], SEAT = [-0.12, 0.86], HT = [0.42, 0.9], HB = [0.46, 0.72], FH = [0.52, 0.34], BAR = [0.38, 1.0];
    [[RH, BB], [RH, SEAT], [BB, SEAT], [SEAT, HT], [BB, HB], [HT, HB]].forEach(function(p){ place(tube(0.025, frame), p[0], p[1]); });
    place(tube(0.02, metal), HB, FH); place(tube(0.02, metal), HT, BAR);
    place(tube(0.018, dark), [BAR[0], BAR[1], -0.23], [BAR[0], BAR[1], 0.23]);
    var saddle = new T.Mesh(new T.BoxGeometry(0.26, 0.05, 0.12), dark); saddle.position.set(-0.13, 0.9, 0); g.add(saddle);
    var HIP = [-0.1, 0.98], SH = [0.2, 1.38];
    place(tube(0.13, jersey), HIP, SH);
    var head = new T.Mesh(new T.SphereGeometry(0.11, 16, 12), skin); head.position.set(0.3, 1.54, 0); g.add(head);
    var helmet = new T.Mesh(new T.SphereGeometry(0.13, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), white); helmet.position.set(0.29, 1.57, 0); g.add(helmet);
    [-1, 1].forEach(function(sd){
      var el = [0.33, 1.18, 0.2 * sd];
      place(tube(0.04, jersey), [SH[0], SH[1], 0.17 * sd], el); place(tube(0.035, skin), el, [BAR[0], BAR[1], 0.21 * sd]);
    });
    var legs = [-1, 1].map(function(sd){ return { sd: sd, thigh: tube(0.06, shorts), shin: tube(0.045, skin), crank: tube(0.015, metal) }; });
    function pedal(angle){
      legs.forEach(function(l, i){
        var a = angle + i * Math.PI, z = 0.1 * l.sd;
        var P = [BB[0] + Math.cos(a) * 0.17, BB[1] + Math.sin(a) * 0.17, z];
        place(l.crank, [BB[0], BB[1], z], P);
        // Knee by two-bone IK in the side plane, bending forward.
        var dx = P[0] - HIP[0], dy = P[1] - HIP[1], d = Math.min(Math.sqrt(dx*dx + dy*dy), 0.89), L = 0.45;
        var base = Math.atan2(dy, dx), off = Math.acos(Math.min(1, d / (2 * L)));
        var K = [HIP[0] + Math.cos(base + off) * L, HIP[1] + Math.sin(base + off) * L, z];
        place(l.thigh, [HIP[0], HIP[1], z], K); place(l.shin, K, P);
      });
    }
    pedal(0);
    return { group: g, rear: rear, front: front, pedal: pedal, at: null };
  }
  function addBikeLayer(){
    var T = window.THREE;
    var scene = new T.Scene(), camera = new T.Camera(), renderer = null;
    scene.add(new T.AmbientLight(0xffffff, 0.65));
    var sun = new T.DirectionalLight(0xffffff, 0.75); sun.position.set(0.4, 1, 0.6); scene.add(sun);
    bike = makeBike();
    bike.group.visible = false;
    scene.add(bike.group);
    map.addLayer({
      id: 'bike', type: 'custom', renderingMode: '3d',
      onAdd: function(m, gl){ renderer = new T.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true }); renderer.autoClear = false; },
      render: function(gl, matrix){
        if (!bike.group.visible || !bike.at) return;
        var elev = (map.queryTerrainElevation && map.queryTerrainElevation(bike.at.lngLat)) || 0;
        var mc = maplibregl.MercatorCoordinate.fromLngLat(bike.at.lngLat, elev);
        var sc = mc.meterInMercatorCoordinateUnits() * BIKE_SCALE;
        var model = new T.Matrix4().makeTranslation(mc.x, mc.y, mc.z)
          .scale(new T.Vector3(sc, -sc, sc))
          .multiply(new T.Matrix4().makeRotationX(Math.PI / 2))
          // Model x points forward; turn it to the compass bearing (0 = north, clockwise).
          .multiply(new T.Matrix4().makeRotationY(Math.PI / 2 - bike.at.bearing * Math.PI / 180));
        camera.projectionMatrix = new T.Matrix4().fromArray(matrix).multiply(model);
        renderer.resetState();
        // Always in front of the buildings: in a dense city they would hide it at every block.
        renderer.clearDepth();
        renderer.render(scene, camera);
      }
    });
  }
  function startRide(r){
    if (!selCoords || selCoords.length < 2) return;
    var coords = selCoords.map(function(c){ return [c[0], c[1]]; });
    var dist = [0];
    for (var i = 1; i < coords.length; i++) dist.push(dist[i-1] + meters(coords[i-1], coords[i]));
    ride = { coords: coords, dist: dist, total: dist[dist.length - 1] || 1, done: 0, kmh: r.kmh, paused: !!r.paused, last: null, raf: 0, crank: 0, bearing: null, sent: 0 };
    if (!map.getTerrain()) map.setTerrain({ source: 'dem', exaggeration: 1.6 });
    loadThree(function(){
      if (!ride) return;
      if (window.THREE && !map.getLayer('bike')) { try { addBikeLayer(); } catch (_) { bike = null; } }
      if (bike) bike.group.visible = true;
      ride.raf = requestAnimationFrame(step);
    });
  }
  function at(m){
    var d = ride.dist, c = ride.coords, k = 1;
    m = Math.max(0, Math.min(ride.total, m));
    while (k < d.length - 1 && d[k] < m) k++;
    var u = (m - d[k-1]) / ((d[k] - d[k-1]) || 1);
    return [c[k-1][0] + (c[k][0] - c[k-1][0]) * u, c[k-1][1] + (c[k][1] - c[k-1][1]) * u];
  }
  function step(ts){
    if (!ride) return;
    var dt = ride.last === null ? 0 : Math.min(0.1, (ts - ride.last) / 1000);
    ride.last = ts;
    if (!ride.paused) {
      ride.done = Math.min(ride.total, ride.done + dt * ride.kmh / 3.6);
      ride.crank += dt * Math.PI * 2 * 1.4;
    }
    var here = at(ride.done), target = bearingOf(at(ride.done - 10), at(ride.done + 25));
    if (ride.bearing === null) ride.bearing = target;
    // Turn smoothly instead of snapping at every corner.
    ride.bearing += (((target - ride.bearing + 540) % 360) - 180) * Math.min(1, dt * 3);
    if (bike) {
      bike.at = { lngLat: here, bearing: ride.bearing };
      bike.pedal(ride.crank);
      bike.rear.rotation.z = bike.front.rotation.z = -ride.crank * 1.8;
      map.triggerRepaint();
    }
    // The camera sits behind, above and a little to the side, so the bike and the pedalling show.
    map.jumpTo({ center: at(ride.done + 6), bearing: ride.bearing - 32, pitch: 52, zoom: 18.8 });
    if (ts - ride.sent > 500) { ride.sent = ts; send({ type: 'rideProgress', done_m: Math.round(ride.done), total_m: Math.round(ride.total) }); }
    if (ride.done >= ride.total) { send({ type: 'rideProgress', done_m: Math.round(ride.total), total_m: Math.round(ride.total) }); stopRide(); send({ type: 'flyEnd' }); return; }
    ride.raf = requestAnimationFrame(step);
  }
  // in: null to stop, or { kmh, paused }. A ride already going keeps its place.
  window.kovaRide = function(r){
    if (!r) { pendingRide = null; return stopRide(); }
    if (ride) { ride.kmh = r.kmh; ride.paused = !!r.paused; return; }
    if (ready) startRide(r); else pendingRide = r;
  };
  window.kovaMap = function(d){ if (ready) apply(d); else pending = d; };
  window.addEventListener('message', function(e){
    if (e.data && e.data.kovaMapIn) window.kovaMap(JSON.parse(e.data.kovaMapIn));
    if (e.data && typeof e.data.kovaRideIn === 'string') window.kovaRide(JSON.parse(e.data.kovaRideIn));
  });
  document.addEventListener('message', function(e){ try { window.kovaMap(JSON.parse(e.data)); } catch (_) {} });
})();
</script></body></html>`;
