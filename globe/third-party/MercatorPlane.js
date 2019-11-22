// src: https://gist.github.com/nicoptere/c4bfa8662317f3c542a1

var MercatorPlane = function()
{

    // create the material
    var vs = "varying vec2 vUv;\nvoid main() {\n vUv = uv;\ngl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n}";
    var fs = "uniform sampler2D map;\nvarying vec2 vUv;\n void main() {\nvec4 color = texture2D( map, vUv );\ngl_FragColor = color;\n}";
    var material = new THREE.ShaderMaterial({

        uniforms: {
            map: {  type: "t", value: null }
        },
        vertexShader:   vs,
        fragmentShader: fs,

        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false
    });

    var PI = Math.PI;
    var RAD = PI / 180;

    function MercatorPlane( texture, size, minLat, maxLat, minLng, maxLng ) {

        minLat = Math.max( -90,( minLat == null ) ? -90 : minLat );
        maxLat = Math.min( 90, ( maxLat == null ) ?  89 : maxLat );

        minLng = Math.max( -180, ( minLng == null ) ? -180 : minLng );
        maxLng = Math.min( 180,  ( maxLng == null ) ?  179 : maxLng );

        // create the geometry
        var w = 1 + maxLng - minLng;
        var h = 1 + maxLat - minLat;

        if( w == 0 || h == 0 )return;//invalid patch

        var length = w * h;
        var vertices 	= new Float32Array( length * 3 );
        var uvs 		= new Float32Array( length * 2 );
        var indices 	= new Uint16Array(  length * 3 * 2 );

        var position    = new THREE.Vector3();
        var x, y, xy, index = 0, k = 0;

        var facesIndices = [];
        for( x = minLng; x <= maxLng; x++ ) {

            var tmp = [];
            for( y = minLat; y <= maxLat; y++ ) {

                xy = getXY( x, y, size / 2 );

                k = index * 3;
                vertices[ k++ ] = xy[0];
                vertices[ k++ ] = xy[1];
                vertices[ k++ ] = 0;

                k = index * 2;
                uvs[k++] = .5 + x / 360;
                uvs[k++] = .5 + y / 180;

                tmp.push( index );
                index++;
            }
            facesIndices.push( tmp );
        }

        //faces
        index = 0;
        for ( x = 0; x < facesIndices.length - 1; x++) {

            for ( y = 0; y < facesIndices[ 0 ].length - 1; y++) {

                var i0 = facesIndices[x][y];
                var i1 = facesIndices[x + 1][y];
                var i2 = facesIndices[x][y + 1];
                var i3 = facesIndices[x + 1][y + 1];

                indices[ index++ ] = i0;
                indices[ index++ ] = i3;
                indices[ index++ ] = i1;

                indices[ index++ ] = i0;
                indices[ index++ ] = i2;
                indices[ index++ ] = i3;
            }
        }

        var geometry 	= new THREE.PlaneBufferGeometry();
        geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.addAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.addAttribute('index', new THREE.BufferAttribute(indices, 1));

        //assign texture to material
        material.uniforms.map.value = texture;

        _super.call( this, geometry, material );
    }

    //https://alastaira.wordpress.com/2011/01/23/the-google-maps-bing-maps-spherical-mercator-projection/
    function getXY( lon, lat, width )
    {
        var x = lon * width / 180;
        var y = Math.log( Math.tan( ( 90 - lat ) * Math.PI / 360 ) ) / RAD;
        y = y * width / 180;
        return [x, y];
    }

    var _super 	= THREE.Mesh;
    MercatorPlane.prototype =  Object.create( _super.prototype );

    var _p = MercatorPlane.prototype;
    _p.constructor = MercatorPlane;
    return MercatorPlane;

}();

/*
//the plane is drawn in the XY plane, to use with an orthographic Camera like 

var width = 1024;
var w2 = width/2;
var h2 = width / 2;

var camera = new THREE.OrthographicCamera(-w2, w2, -h2, h2, 1, 10000 );
camera.position.z = 1000; 

var mp = new MercatorPlane( texture, width, minLat (default:-90), maxLat(default:90), minLng (default:-180), maxLng (default:180) );
scene.add( mp );
*/