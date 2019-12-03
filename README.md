# WebGL Globe

A library to create interactive 3D globes with support for geojson files.
![Screenshot](/assets/screenshot_01.png)

Create an interactive globe in your browser and load data from geojson files.  

Features:
- Easy to use.
- Supports threejs integrations.
- 

## Getting Started

### Include
```
<script src="/globe/third-party/Detector.js"></script>
<script src="/globe/third-party/three.min.js"></script>
<script src="/globe/third-party/Tween.js"></script>
<script src="/globe/third-party/MercatorPlane.js"></script>
<script src="/globe/globe.js"></script>
<script src="/globe/third-party/mapbox-gl.js"></script>
```

### Initialize
**Full Screen**:
Javascript:
```
var globe = new DAT.Globe(null, opts);
```

**Windowed**:
HTML:
```
...
<div id="container"></div>
...
```
Javascript:
```
var container = document.getElementById("container");
var globe = new DAT.Globe(container, opts);
```

### Load Data
```
var sampleData = await fetch('/data/sample.geojson');
var geojson = await sampleData.json();
globe.addFeatureCollection(geojson);
```

