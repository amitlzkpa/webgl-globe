/**
 * dat.globe Javascript WebGL Globe Toolkit
 * https://github.com/dataarts/webgl-globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

var DAT = DAT || {};

/**
 *
 * Constructor used to create an instance of the globe.
 * A globe instance is a threejs scene which contains the globe and all associated 3D objects.
 *
 * @param {DOMObject} container - The container to hold the scene.
 * @param {Object} opts - An object containing configuration parameters for the globe.
 *                        'colorFn': A function for mapping the globe's colors based on HSL values.
 *                        'textureImage': Path to image to be used as texture.
 *                        'autoStart': If the globe object should auto-start (default true).
 * @return {DAT.Globe} An instance of the globe.
 *
 * @example
 *
 *  var container = document.getElementById("container");
 *  var globe = new DAT.Globe(container);
 *
 */
DAT.Globe = function(container, opts) {
  opts = opts || {};
  var autoStart = typeof opts.autoStart === "undefined" || opts.autoStart === true;
  
  var colorFn = opts.colorFn || function(x) {
    var c = new THREE.Color();
    c.setHSL( ( 0.6 - ( x * 0.5 ) ), 1.0, 0.5 );
    return c;
  };
  var textureImage = opts.textureImage || '';

  var Shaders = {
    'earth' : {
      uniforms: {
        'texture': { type: 't', value: null }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          'vNormal = normalize( normalMatrix * normal );',
          'vUv = uv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D texture;',
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'vec3 diffuse = texture2D( texture, vUv ).xyz;',
          'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
          'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
          'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
        '}'
      ].join('\n')
    },
    'atmosphere' : {
      uniforms: {},
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'vNormal = normalize( normalMatrix * normal );',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
          'gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;',
        '}'
      ].join('\n')
    }
  };

  var camera, scene, renderer, w, h;
  var mesh, atmosphere, point;
  var groundMesh;

  var overRenderer;

  var curZoomSpeed = 0;
  var zoomSpeed = 50;

  var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 };
  var rotation = { x: 0, y: 0 },
      target = { x: Math.PI*3/2, y: Math.PI / 6.0 },
      targetOnDown = { x: 0, y: 0 };

  var distance = 100000, distanceTarget = 100000;
  var padding = 40;
  var PI_HALF = Math.PI / 2;

  function init() {

    container.style.color = '#fff';
    container.style.font = '13px/20px Arial, sans-serif';

    var shader, uniforms, material;
    w = container.offsetWidth || window.innerWidth;
    h = container.offsetHeight || window.innerHeight;

    camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
    camera.position.z = distance;

    scene = new THREE.Scene();

    var geometry = new THREE.SphereGeometry(200, 40, 30);

    shader = Shaders['earth'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    uniforms['texture'].value = THREE.ImageUtils.loadTexture(textureImage);

    material = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader

        });

    mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.y = Math.PI;
    scene.add(mesh);
    groundMesh = mesh;

    shader = Shaders['atmosphere'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    material = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true

        });

    mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set( 1.1, 1.1, 1.1 );
    scene.add(mesh);

    geometry = new THREE.BoxGeometry(0.75, 0.75, 1);
    geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0,0,-0.5));

    point = new THREE.Mesh(geometry);

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(w, h);

    renderer.domElement.style.position = 'absolute';

    container.appendChild(renderer.domElement);

    container.addEventListener('mousedown', onMouseDown, false);

    container.addEventListener('mousewheel', onMouseWheel, false);

    document.addEventListener('keydown', onDocumentKeyDown, false);

    window.addEventListener('resize', onWindowResize, false);

    container.addEventListener('mouseover', function() {
      overRenderer = true;
    }, false);

    container.addEventListener('mouseout', function() {
      overRenderer = false;
    }, false);
  }

  function addData(data, opts) {
    var lat, lng, size, color, i, step, colorFnWrapper;

    opts.animated = opts.animated || false;
    this.is_animated = opts.animated;
    opts.format = opts.format || 'magnitude'; // other option is 'legend'
    if (opts.format === 'magnitude') {
      step = 3;
      colorFnWrapper = function(data, i) { return colorFn(data[i+2]); }
    } else if (opts.format === 'legend') {
      step = 4;
      colorFnWrapper = function(data, i) { return colorFn(data[i+3]); }
    } else {
      throw('error: format not supported: '+opts.format);
    }

    if (opts.animated) {
      if (this._baseGeometry === undefined) {
        this._baseGeometry = new THREE.Geometry();
        for (i = 0; i < data.length; i += step) {
          lat = data[i];
          lng = data[i + 1];
          color = colorFnWrapper(data,i);
          size = 0;
          addPoint(lat, lng, size, color, this._baseGeometry);
        }
      }
      if(this._morphTargetId === undefined) {
        this._morphTargetId = 0;
      } else {
        this._morphTargetId += 1;
      }
      opts.name = opts.name || 'morphTarget'+this._morphTargetId;
    }
    var subgeo = new THREE.Geometry();
    for (i = 0; i < data.length; i += step) {
      lat = data[i];
      lng = data[i + 1];
      color = colorFnWrapper(data,i);
      size = data[i + 2];
      size = size*200;
      addPoint(lat, lng, size, color, subgeo);
    }
    if (opts.animated) {
      this._baseGeometry.morphTargets.push({'name': opts.name, vertices: subgeo.vertices});
    } else {
      this._baseGeometry = subgeo;
    }
  };

  function createPoints() {
    if (this._baseGeometry !== undefined) {
      if (this.is_animated === false) {
        this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
              color: 0xffffff,
              vertexColors: THREE.FaceColors,
              morphTargets: false
            }));
      } else {
        if (this._baseGeometry.morphTargets.length < 8) {
          console.log('t l',this._baseGeometry.morphTargets.length);
          var padding = 8-this._baseGeometry.morphTargets.length;
          console.log('padding', padding);
          for(var i=0; i<=padding; i++) {
            console.log('padding',i);
            this._baseGeometry.morphTargets.push({'name': 'morphPadding'+i, vertices: this._baseGeometry.vertices});
          }
        }
        this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
              color: 0xffffff,
              vertexColors: THREE.FaceColors,
              morphTargets: true
            }));
      }
      scene.add(this.points);
    }
  }

  function onMouseDown(event) {
    event.preventDefault();

    container.addEventListener('mousemove', onMouseMove, false);
    container.addEventListener('mouseup', onMouseUp, false);
    container.addEventListener('mouseout', onMouseOut, false);

    mouseOnDown.x = - event.clientX;
    mouseOnDown.y = event.clientY;

    targetOnDown.x = target.x;
    targetOnDown.y = target.y;

    container.style.cursor = 'move';
  }

  function onMouseMove(event) {
    mouse.x = - event.clientX;
    mouse.y = event.clientY;

    var zoomDamp = distance/1000;

    target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
    target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

    target.y = target.y > PI_HALF ? PI_HALF : target.y;
    target.y = target.y < - PI_HALF ? - PI_HALF : target.y;
  }

  function onMouseUp(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
    container.style.cursor = 'auto';
  }

  function onMouseOut(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
  }

  function onMouseWheel(event) {
    event.preventDefault();
    if (overRenderer) {
      zoom(event.wheelDeltaY * 0.3);
    }
    return false;
  }

  function onDocumentKeyDown(event) {
    switch (event.keyCode) {
      case 38:
        zoom(100);
        event.preventDefault();
        break;
      case 40:
        zoom(-100);
        event.preventDefault();
        break;
    }
  }

  function onWindowResize( event ) {
    camera.aspect = container.offsetWidth / container.offsetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( container.offsetWidth, container.offsetHeight );
  }

  function zoom(delta) {
    distanceTarget -= delta;
    distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
    distanceTarget = distanceTarget < 210 ? 210 : distanceTarget;
  }

  function animate() {
    requestAnimationFrame(animate);
    render();
  }

  function render() {
    zoom(curZoomSpeed);

    rotation.x += (target.x - rotation.x) * 0.1;
    rotation.y += (target.y - rotation.y) * 0.1;
    distance += (distanceTarget - distance) * 0.3;

    camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
    camera.position.y = distance * Math.sin(rotation.y);
    camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

    camera.lookAt(mesh.position);

    renderer.render(scene, camera);
  }



  
  // ----------------------------------------------------------------------------
  /*

        _   _ _ _ _         
  _   _| |_(_) (_) |_ _   _ 
 | | | | __| | | | __| | | |
 | |_| | |_| | | | |_| |_| |
  \__,_|\__|_|_|_|\__|\__, |
                      |___/ 

  */



 function foo() {

}


/**
 * Method to convert latitude to X coordinate on the globe's surface.
 *
 * @param {float} lat - Latitude in decimal coordinates.
 * @return {float} X coordinate on the globe's surface.
 *
 * @example
 *
 *     latToSphericalCoords(19.076090);
 *
 */
function latToSphericalCoords(lat) {
  return (90 - lat) * Math.PI / 180;
}

/**
 * Method to convert longitude to Y coordinate on the globe's surface.
 *
 * @param {float} lng - Longitude in decimal coordinates.
 * @return {float} Y coordinate on the globe's surface.
 *
 * @example
 *
 *     lngToSphericalCoords(72.877426);
 *
 */
function lngToSphericalCoords(lng) {
  return (180 - lng) * Math.PI / 180;
}


  
  // ----------------------------------------------------------------------------
  /*
                   _                 
   __ _  ___  ___ (_)___  ___  _ __  
  / _` |/ _ \/ _ \| / __|/ _ \| '_ \ 
 | (_| |  __/ (_) | \__ \ (_) | | | |
  \__, |\___|\___// |___/\___/|_| |_|
  |___/         |__/                 

  */


  var activeGeoJsons = {};


  function addToActiveGeoJsons(threejsObj) {
    
    var id = (threejsObj && threejsObj.uuid) ? threejsObj.uuid : null;
    if (!id) return null;

    activeGeoJsons[id] = threejsObj;
    scene.add(threejsObj);
    return threejsObj;
    
  }


  /**
   * Adds an array or geojson object representing a single point to a threejs 3D object.
   *
   * @param {geojson} input - An array or geojson object representing a point on the map.
   * @param {Object} opts - An object containing configuration parameters.
   *                        'color': Color for the mesh (default: 0xffff00).
   *                        'size': Size for the mesh (default: 2).
   * @return {THREE.Mesh} A threejs 3D object (as a sphere).
   *
   * @example
   *      
   *     // As array
   *     var posA = [28.644800, 77.216721];
   *     var meshA = globe.addPoint(posA);
   *
   *    // As geojson
   *    var posB =  {
   *                  "type": "Feature",
   *                  "geometry": {
   *                    "type": "Point",
   *                    "coordinates": [125.6, 10.1]
   *                  },
   *                  "properties": {
   *                    "name": "Dinagat Islands"
   *                  }
   *                };
   *     var meshB = globe.addPoint(posB);
   *
   */
  function addPoint(input, opts) {

    var coords = null;
    opts = opts || {};

    if (input.constructor === Array) {
      coords = input;
    } else {
      // coordinate format is flipped in geojsons
      coords = [];
      coords.push(input.geometry.coordinates[1]);
      coords.push(input.geometry.coordinates[0]);
    }

    var lat = coords[0];
    var lng = coords[1];

    var phi = latToSphericalCoords(lat);
    var theta = lngToSphericalCoords(lng);

    var sz = opts.size || 2;
    var color = opts.color || 0xffff00;
    var geometry = new THREE.SphereGeometry( sz, 8, 8 );
    var material = new THREE.MeshBasicMaterial( {color: color} );
    var point = new THREE.Mesh( geometry, material );

    point.position.x = 203 * Math.sin(phi) * Math.cos(theta);
    point.position.y = 203 * Math.cos(phi);
    point.position.z = 203 * Math.sin(phi) * Math.sin(theta);

    var mesh = addToActiveGeoJsons(point);
    
    return mesh;
  }

  /**
   * Adds an array or geojson object representing a multiple points to a threejs 3D object.
   *
   * @param {geojson} input - An array or geojson object representing multiple points on the map.
   * @param {Object} opts - An object containing configuration parameters.
   *                        'color': Color for the mesh (default: 0xffff00).
   *                        'size': Size for the mesh (default: 2).
   * @return {THREE.Object3D} A threejs 3D object (as a collection of spheres inside an THREE.Object3D).
   *
   * @example
   *      
   *     // As array
   *     var posA = [ [55.751244, 37.618423], [30.266666, -97.733330] ];
   *     var objA = globe.addMultiPoint(posA);
   *
   *    // As geojson
   *    var posB =  {
   *                  "type": "Feature",
   *                  "geometry": {
   *                    "type": "MultiPoint",
   *                    "coordinates": [
   *                      [40.730610, -73.935242],
   *                      [51.5085297, -0.12574],
   *                      [35.6894989, 139.6917114],
   *                      [48.8534088, 2.3487999]
   *                    ]
   *                  },
   *                  "properties": {
   *                    "name": "Fallen Cities"
   *                  }
   *                }
   *     var objB = globe.addMultiPoint(posB);
   *
   */
  function addMultiPoint(input, opts) {

    var coords = null;
    opts = opts || {};

    if (input.constructor === Array) {
      coords = input;
    } else {
      // coordinate format is flipped in geojsons
      coords = input.geometry.coordinates.map(c => [c[0], c[1]]);
    }

    var points = new THREE.Object3D();

    for(var ptIdx = 0; ptIdx < coords.length; ptIdx++) {
      var lat = coords[ptIdx][0];
      var lng = coords[ptIdx][1];

      var phi = latToSphericalCoords(lat);
      var theta = lngToSphericalCoords(lng);

      var sz = opts.size || 2;
      var color = opts.color || 0xffff00;
      var geometry = new THREE.SphereGeometry( sz, 8, 8 );
      var material = new THREE.MeshBasicMaterial( {color: color} );
      var point = new THREE.Mesh( geometry, material );

      point.position.x = 203 * Math.sin(phi) * Math.cos(theta);
      point.position.y = 203 * Math.cos(phi);
      point.position.z = 203 * Math.sin(phi) * Math.sin(theta);

      points.add(point);
    }

    var mesh = addToActiveGeoJsons(points);
    
    return mesh;
  }

  /**
   * Parses an array or geojson object representing a single line to a threejs 3D line.
   * Currently only supports lines with a start and end point.
   *
   * @param {geojson} input - An array or geojson object representing a line on the map.
   * @param {Object} opts - An object containing configuration parameters.
   *                        'color': Color for the line (default: 0xffffff).
   * @return {THREE.Line} A threejs 3D line.
   *
   * @example
   *      
   *     // As array
   *     var lnA = [ [14.6042004, 120.9822006], [22.3964272, 114.1094971] ];
   *     var lineA = globe.parseLineString(lnA);
   *
   *    // As geojson
   *    var lnB = {
   *                "type": "Feature",
   *                "geometry": {
   *                  "type": "LineString",
   *                  "coordinates": [
   *                    [
   *                      29.301449060440063,
   *                      -31.952162238024957
   *                    ],
   *                    [
   *                      69.24430757761002,
   *                      34.63320791137959
   *                    ]
   *                  ]
   *                },
   *                "properties": {
   *                  "name": "Magellan Line"
   *                }
   *              }
   *     var lineB = globe.parseLineString(lnB);
   *
   */
  function parseLineString(input, opts) {

    var inPts = null;

    if (input.constructor === Array) {
      inPts = input;
    } else {
      // coordinate format is flipped in geojsons
      inPts = input.geometry.coordinates.map(c => { return [c[1], c[0]]; });
    }

    if (inPts.length < 2) throw ('Need at least 2 points for a line');

    var divs = 100;
    // var d = Math.sqrt(Math.pow(inPts[1][0] - inPts[0][0], 2) + Math.pow(inPts[1][0] - inPts[0][0], 2));
    // console.log(d);

    var pts = [];

    var idx = 1;
    while(idx < inPts.length) {
      var secondPt = inPts[idx];
      var firstPt = inPts[idx-1];
    
      var deltaLat = (secondPt[0] - firstPt[0]) / divs;
      var deltaLng = (secondPt[1] - firstPt[1]) / divs;

      for(var j = 0; j<divs; j++) {
        pts.push([firstPt[0] + (j * deltaLat), firstPt[1] + (j * deltaLng)]);
      }
      idx++;
    }

    var col = (opts && opts.color) ? opts.color : 0xffffff
    var material = new THREE.LineBasicMaterial({ color: col });
    var c=0;
    var geometry = new THREE.Geometry();
    do {
      var lat = pts[c][0];
      var lng = pts[c][1];
      var phi = latToSphericalCoords(lat);
      var theta = lngToSphericalCoords(lng);
      var vt = new THREE.Vector3();
      vt.x = 200 * Math.sin(phi) * Math.cos(theta);
      vt.y = 200 * Math.cos(phi);
      vt.z = 200 * Math.sin(phi) * Math.sin(theta);
      geometry.vertices.push( vt );
      c++;
    } while(c < pts.length)

    var line = new THREE.Line( geometry, material );
    return line;
  }

  /**
   * Parses an array or geojson object representing multiple lines to threejs 3D lines.
   * Currently only supports lines with a start and end point.
   *
   * @param {geojson} input - An array or geojson object representing multiple lines on the map.
   * @param {Object} opts - An object containing configuration parameters.
   *                        'color': Color for the line (default: 0xffffff).
   * @return {THREE.Object3D} A threejs 3D object (as a collection of lines inside an THREE.Object3D).
   *
   * @example
   *      
   *     // As array
   *     var lnA = [ [ [14.6042004, 120.9822006], [22.3964272, 114.1094971] ], [ [11.5624504, 104.916008], [10.82302, 106.6296463] ] ];
   *     var lineA = globe.parseMultiLineString(lnA);
   *
   *    // As geojson
   *    var lnB = {
   *                "type": "Feature",
   *                "geometry": {
   *                  "type": "MultiLineString",
   *                  "coordinates": [
   *                    [ 
   *                      [
   *                        32.506026327610016,
   *                        15.580710739162123
   *                      ],
   *                      [
   *                        77.44035622384729,
   *                        12.983147716796577
   *                      ]
   *                    ],
   *                    [ 
   *                      [
   *                        88.29484841134729,
   *                        22.553147478403194
   *                      ],
   *                      [
   *                        74.4233498564023,
   *                        42.924251753870685
   *                      ]
   *                    ]
   *                  ]
   *                },
   *                "properties": {
   *                  "name": "Incense License"
   *                }
   *              }
   *     var lineB = globe.parseMultiLineString(lnB);
   *
   */
  function parseMultiLineString(input, opts) {

    var inLns = null;

    if (input.constructor === Array) {
      inLns = input;
    } else {
      // coordinate format is flipped in geojsons
      inLns = input.geometry.coordinates.map(l => { return l.map(c => { return [c[1], c[0]]; }); });
    }

    var lines = new THREE.Object3D();

    for(let inLnsIdx = 0; inLnsIdx < inLns.length; inLnsIdx++)
    {
      var inPts = inLns[inLnsIdx];
      if (inPts.length != 2) throw ('Need 2 points for a line');
      var divs = 100;
      // var d = Math.sqrt(Math.pow(inPts[1][0] - inPts[0][0], 2) + Math.pow(inPts[1][0] - inPts[0][0], 2));
      // console.log(d);
      var deltaLat = (inPts[1][0] - inPts[0][0]) / divs;
      var deltaLng = (inPts[1][1] - inPts[0][1]) / divs;

      var pts = [];

      for(var j = 0; j<divs; j++) {
        pts.push([inPts[0][0] + (j * deltaLat), inPts[0][1] + (j * deltaLng)]);
      }
      pts.push(inPts[inPts.length-1])

      var col = (opts && opts.color) ? opts.color : 0xffffff
      var material = new THREE.LineBasicMaterial({ color: col });
      var c=0;
      var geometry = new THREE.Geometry();
      do {
        var lat = pts[c][0];
        var lng = pts[c][1];
        var phi = latToSphericalCoords(lat);
        var theta = lngToSphericalCoords(lng);
        var vt = new THREE.Vector3();
        vt.x = 200 * Math.sin(phi) * Math.cos(theta);
        vt.y = 200 * Math.cos(phi);
        vt.z = 200 * Math.sin(phi) * Math.sin(theta);
        geometry.vertices.push( vt );
        c++;
      } while(c < pts.length)

      var line = new THREE.Line( geometry, material );
      lines.add(line);
    }

    return lines;
  }

  /**
   * Add the given geojson object to the map.
   * Currently supports only a single feature json containing Point, MultiPoint, Line or MultiLine.
   *
   * @param {Geojson} geoJson - Geojson object to be added.
   *
   * @example
   *
   *    var geoJson = {
   *                   "type": "Feature",
   *                   "geometry": {
   *                     "type": "Point",
   *                     "coordinates": [125.6, 10.1]
   *                   },
   *                   "properties": {
   *                     "name": "Dinagat Islands"
   *                   }
   *                 };
   *    globe.addGeoJson(geoJson);
   *
   */
  function addGeoJson(geoJson) {
    var feat = parseFeature(geoJson);
    scene.add(feat);
    // var feat = parseFeatureCollection(geoJson);
    // scene.add(feat);
  }

  /**
   * Parses a given node in a geojson object and returns corresponding threejs object.
   * Currently supports only a single feature json containing Point, MultiPoint, Line or MultiLine.
   *
   * @param {Geojson} geoJsonNode - Geojson node to be parsed.
   *
   * @example
   *
   *    var node =   {
   *                   "type": "Feature",
   *                   "geometry": {
   *                     "type": "Point",
   *                     "coordinates": [125.6, 10.1]
   *                   },
   *                   "properties": {
   *                     "name": "Dinagat Islands"
   *                   }
   *                 };
   *    var threeJsObj = globe.parseFeature(node);
   *
   */
  function parseFeature(node) {
    var ftType = node.geometry.type;
    var ret = null;
    switch (ftType) {
      case 'Point': {
        ret = addPoint(node, { color: 0xff0000 });
        break;
      }
      case 'MultiPoint': {
        ret = addMultiPoint(node, { color: 0xababab });
        break;
      }
      case 'LineString': {
        ret = parseLineString(node, { color: 0xff00f0 });
        break;
      }
      case 'MultiLineString': {
        ret = parseMultiLineString(node, { color: 0x0000ff });
        break;
      }
      default: {
        ret = null;
        break;
      }
    }
    return ret;
  }

  /**
   * Parses a given node in a geojson object and returns corresponding threejs object.
   * Currently supports FeatureCollections.
   *
   * @param {Geojson} geoJsonNode - Geojson node to be parsed.
   *
   * @example
   *
   *    var node =    {
   *                    "type": "FeatureCollection",
   *                    "features": [
   *                      { "type": "Feature",
   *                        "geometry": {"type": "Point", "coordinates": [102.0, 0.5]},
   *                        "properties": {"prop0": "value0"}
   *                        },
   *                      { "type": "Feature",
   *                        "geometry": {
   *                          "type": "LineString",
   *                          "coordinates": [
   *                            [102.0, 0.0], [103.0, 1.0], [104.0, 0.0], [105.0, 1.0]
   *                            ]
   *                          },
   *                        "properties": {
   *                          "prop0": "value0",
   *                          "prop1": 0.0
   *                          }
   *                        },
   *                      { "type": "Feature",
   *                         "geometry": {
   *                           "type": "Polygon",
   *                           "coordinates": [
   *                             [ [100.0, 0.0], [101.0, 0.0], [101.0, 1.0],
   *                               [100.0, 1.0], [100.0, 0.0] ]
   *                             ]
   *                  
   *                         },
   *                         "properties": {
   *                           "prop0": "value0",
   *                           "prop1": {"this": "that"}
   *                           }
   *                         }
   *                      ]
   *                    };
   *    var threeJsObj = globe.parseFeatureCollection(node);
   *
   */
  function parseFeatureCollection(node) {
    var ftType = node.type;
    if (ftType !== "FeatureCollection") {
      throw (`Unexpected typ: '${ftType}'. Expected FeatureCollection`)
    }
    var ret = new THREE.Object3D();
    var feats = node.features;
    for(var i=0; i<feats.length; i++) {
      var f = parseFeature(feats[i]);
      if (f) ret.add(f);
    }
    return ret;
  }
  



  // ----------------------------------------------------------------------------
  /*
    _       _ _   _       _ _         
  (_)_ __ (_) |_(_) __ _| (_)_______ 
  | | '_ \| | __| |/ _` | | |_  / _ \
  | | | | | | |_| | (_| | | |/ /  __/
  |_|_| |_|_|\__|_|\__,_|_|_/___\___|

  */
  
  init();
  if (autoStart) {
    animate();
  }


  // ----------------------------------------------------------------------------
  /*
                _     _ _                            
    _ __  _   _| |__ | (_) ___  __   ____ _ _ __ ___ 
  | '_ \| | | | '_ \| | |/ __| \ \ / / _` | '__/ __|
  | |_) | |_| | |_) | | | (__   \ V / (_| | |  \__ \
  | .__/ \__,_|_.__/|_|_|\___|   \_/ \__,_|_|  |___/
  |_|                                               

  */

  
  this.init = init;
  this.reset = init;
  this.animate = animate;
  this.addData = addData;
  this.addPoint = addPoint;
  this.addMultiPoint = addMultiPoint;
  this.parseLineString = parseLineString;
  this.parseMultiLineString = parseMultiLineString;
  this.addGeoJson = addGeoJson;
  this.createPoints = createPoints;
  this.renderer = renderer;
  this.scene = scene;
  this.mesh = groundMesh;
  

  
  this.__defineGetter__('time', function() {
    return this._time || 0;
  });
  
  this.__defineSetter__('time', function(t) {
    var validMorphs = [];
    var morphDict = this.points.morphTargetDictionary;
    for(var k in morphDict) {
      if(k.indexOf('morphPadding') < 0) {
        validMorphs.push(morphDict[k]);
      }
    }
    validMorphs.sort();
    var l = validMorphs.length-1;
    var scaledt = t*l+1;
    var index = Math.floor(scaledt);
    for (i=0;i<validMorphs.length;i++) {
      this.points.morphTargetInfluences[validMorphs[i]] = 0;
    }
    var lastIndex = index - 1;
    var leftover = scaledt - index;
    if (lastIndex >= 0) {
      this.points.morphTargetInfluences[lastIndex] = 1 - leftover;
    }
    this.points.morphTargetInfluences[index] = leftover;
    this._time = t;
  });


  // ----------------------------------------------------------------------------
  return this;

};

