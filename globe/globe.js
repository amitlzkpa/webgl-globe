
var DAT = DAT || {};

/**
 *
 * Constructor used to create an instance of the globe.
 * A globe instance is a threejs scene which contains the globe and all associated 3D objects.
 *
 * @param {DOMObject} container - The container to hold the scene.
 * @param {Object} opts - An object containing configuration parameters for the globe.
 *                        'earthRadius': Radius of the earth's surface in threejs units (default: 200).
 *                        'colorFn': A function for mapping the globe's colors based on HSL values.
 *                        'textureImage': Path to image to be used as texture.
 *                        'disableAtmosphere': Disable atmosphere (default: false).
 *                        'autoStart': If the globe object should auto-start (default: true).
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
  var earthRadius = opts.earthRadius || 200;
  var disableAtmosphere = opts.disableAtmosphere || false;
  
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
  var earthMesh;
  var atmosphereMesh;

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

    var geometry = new THREE.SphereGeometry(earthRadius, 40, 30);

    shader = Shaders['earth'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    uniforms['texture'].value = THREE.ImageUtils.loadTexture(textureImage);

    material = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader

        });

    earthMesh = new THREE.Mesh(geometry, material);
    earthMesh.rotation.y = Math.PI;
    scene.add(earthMesh);

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

    if (!disableAtmosphere) {
      atmosphereMesh = new THREE.Mesh(geometry, material);
      atmosphereMesh.scale.set( 1.1, 1.1, 1.1 );
      scene.add(atmosphereMesh);
    }

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(w, h);

    // renderer.domElement.style.position = 'absolute';

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

    camera.lookAt(earthMesh.position);

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

  /**
   * 
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
      coords = input.geometry.coordinates;
    }

    var lng = coords[0];
    var lat = coords[1];

    var phi = latToSphericalCoords(lat);
    var theta = lngToSphericalCoords(lng);

    var sz = opts.size || 2;
    var color = opts.color || 0xffff00;
    var geometry = new THREE.SphereGeometry( sz, 8, 8 );
    var material = new THREE.MeshBasicMaterial( {color: color} );
    var point = new THREE.Mesh( geometry, material );

    point.position.x = earthRadius * Math.sin(phi) * Math.cos(theta);
    point.position.y = earthRadius * Math.cos(phi);
    point.position.z = earthRadius * Math.sin(phi) * Math.sin(theta);

    var addedObj = addToActiveGeoJsons(point);
    
    return addedObj;
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
   *                      [-73.935242, 40.730610],
   *                      [-0.12574, 51.5085297],
   *                      [139.6917114, 35.6894989],
   *                      [2.3487999, 48.8534088]
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
      coords = input.geometry.coordinates;
    }

    var points = new THREE.Object3D();

    for(var ptIdx = 0; ptIdx < coords.length; ptIdx++) {
      var lng = coords[ptIdx][0];
      var lat = coords[ptIdx][1];

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
   * Adds an array or geojson object representing a single line to a threejs 3D line.
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
   *     var lineA = globe.addLineString(lnA);
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
   *     var lineB = globe.addLineString(lnB);
   *
   */
  function addLineString(input, opts) {

    var inPts = null;
    opts = opts || {};

    if (input.constructor === Array) {
      inPts = input;
    } else {
      inPts = input.geometry.coordinates;
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

    var col = opts.color || 0xffffff
    var material = new THREE.LineBasicMaterial({ color: col });
    var c=0;
    var geometry = new THREE.Geometry();
    do {
      var lng = pts[c][0];
      var lat = pts[c][1];
      var phi = latToSphericalCoords(lat);
      var theta = lngToSphericalCoords(lng);
      var vt = new THREE.Vector3();
      vt.x = earthRadius * Math.sin(phi) * Math.cos(theta);
      vt.y = earthRadius * Math.cos(phi);
      vt.z = earthRadius * Math.sin(phi) * Math.sin(theta);
      geometry.vertices.push( vt );
      c++;
    } while(c < pts.length)

    var line = new THREE.Line( geometry, material );

    var addedObj = addToActiveGeoJsons(line);
    
    return addedObj;
  }

  /**
   * Adds an array or geojson object representing multiple lines to threejs 3D lines.
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
   *     var lineA = globe.addMultiLineString(lnA);
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
   *                      ],
   *                      [
   *                        94.4233498564023,
   *                        49.924251753870685
   *                      ]
   *                    ]
   *                  ]
   *                },
   *                "properties": {
   *                  "name": "Incense License"
   *                }
   *              }
   *     var lineB = globe.addMultiLineString(lnB);
   *
   */
  function addMultiLineString(input, opts) {

    var inLns = null;
    opts = opts || {};

    if (input.constructor === Array) {
      inLns = input;
    } else {
      inLns = input.geometry.coordinates;
    }

    var lines = new THREE.Object3D();

    for(let inLnsIdx = 0; inLnsIdx < inLns.length; inLnsIdx++)
    {

      var inPts = inLns[inLnsIdx];
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

      var col = opts.color || 0xffffff
      var material = new THREE.LineBasicMaterial({ color: col });
      var c=0;
      var geometry = new THREE.Geometry();
      do {
        var lng = pts[c][0];
        var lat = pts[c][1];
        var phi = latToSphericalCoords(lat);
        var theta = lngToSphericalCoords(lng);
        var vt = new THREE.Vector3();
        vt.x = earthRadius * Math.sin(phi) * Math.cos(theta);
        vt.y = earthRadius * Math.cos(phi);
        vt.z = earthRadius * Math.sin(phi) * Math.sin(theta);
        geometry.vertices.push( vt );
        c++;
      } while(c < pts.length)

      var line = new THREE.Line( geometry, material );
      lines.add(line);
    }

    var addedObj = addToActiveGeoJsons(lines);
    
    return addedObj;
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

    switch(geoJson.type) {
      case "Feature": {
        var feat = addFeature(geoJson);
        scene.add(feat);
        break;
      }
      case "FeatureCollection": {
        var feat = addFeatureCollection(geoJson);
        scene.add(feat);
        break;
      }
      default: {
        throw (`Unknown geojson type: ${geoJson}`)
        break;
      }
    }
  }

  /**
   * Adds a given node in a geojson object and returns corresponding threejs object.
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
   *    var threeJsObj = globe.addFeature(node);
   *
   */
  function addFeature(node) {
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
        ret = addLineString(node, { color: 0xff00f0 });
        break;
      }
      case 'MultiLineString': {
        ret = addMultiLineString(node, { color: 0x0000ff });
        break;
      }
      default: {
        ret = null;
        break;
      }
    }

    var addedObj = addToActiveGeoJsons(ret);
    
    return addedObj;
  }

  /**
   * Adds a given node in a geojson object and returns corresponding threejs object.
   *
   * @param {Geojson} geoJsonNode - Geojson node to be added.
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
   *    var threeJsObj = globe.addFeatureCollection(node);
   *
   */
  function addFeatureCollection(node) {
    var ftType = node.type;
    if (ftType !== "FeatureCollection") {
      throw (`Unexpected typ: '${ftType}'. Expected FeatureCollection`)
    }
    var ret = new THREE.Object3D();
    var feats = node.features;
    for(var i=0; i<feats.length; i++) {
      var f = addFeature(feats[i]);
      if (f) ret.add(f);
    }

    var addedObj = addToActiveGeoJsons(ret);
    
    return addedObj;
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
  this.addPoint = addPoint;
  this.addMultiPoint = addMultiPoint;
  this.addLineString = addLineString;
  this.addMultiLineString = addMultiLineString;
  this.addFeature = addFeature;
  this.addFeatureCollection = addFeatureCollection;
  this.addGeoJson = addGeoJson;
  this.renderer = renderer;
  this.scene = scene;
  this.earthMesh = earthMesh;
  this.atmosphereMesh = atmosphereMesh;
  

  
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

