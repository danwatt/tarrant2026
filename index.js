const map = L.map('map').setView([32.75, -97.33], 10);

// Use a reliable B&W basemap (Jawg Light or similar, or OpenStreetMap with grayscale filter)
// Since Stamen is currently transitioning, let's use Jawg or a simple grayscale OSM
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	subdomains: 'abcd',
	maxZoom: 20
}).addTo(map);

let geojsonLayer;
let districtLayer;
let labelLayer;
let currentData = [];
let districtBoundaries = [];

function getColor(change) {
    // change is rednessEnd - rednessStart, typically between -1 and 1
    // We want 7 shades from blue to red.
    // Midpoint "no change" is narrow: -0.01 to 0.01
    // Extremes at -0.25 and 0.25

    const colors = [
        '#0000ff', // Deep Blue (Strong Blue Shift: <= -0.25)
        '#6666ff', // Medium Blue (-0.25 to -0.10)
        '#ccccff', // Light Blue (-0.10 to -0.01)
        '#f0f0f0', // Grey (No Change: -0.01 to 0.01)
        '#ffcccc', // Light Red (0.01 to 0.10)
        '#ff6666', // Medium Red (0.10 to 0.25)
        '#ff0000'  // Deep Red (Strong Red Shift: >= 0.25)
    ];

    if (change <= -0.25) return colors[0];
    if (change <= -0.10) return colors[1];
    if (change < -0.01) return colors[2];
    if (change <= 0.01) return colors[3];
    if (change < 0.10) return colors[4];
    if (change < 0.25) return colors[5];
    return colors[6];
}

function updateMap(yearRange) {
    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }
    if (districtLayer) {
        map.removeLayer(districtLayer);
    }
    if (labelLayer) {
        map.removeLayer(labelLayer);
    }

    const startYear = yearRange.split('-')[0];
    const endYear = yearRange.split('-')[1];

    geojsonLayer = L.geoJson(currentData, {
        style: function(feature) {
            const rednessStart = parseFloat(feature.properties[`redness_${startYear}`]);
            const rednessEnd = parseFloat(feature.properties[`redness_${endYear}`]);
            
            let change = rednessEnd - rednessStart;
            if (isNaN(change)) {
                return { fillOpacity: 0, weight: 0 };
            }
            
            return {
                fillColor: getColor(change),
                weight: 0.5,
                opacity: 0.5,
                color: 'white',
                fillOpacity: 0.7
            };
        },
        onEachFeature: function(feature, layer) {
            const startVal = feature.properties[`redness_${startYear}`];
            const endVal = feature.properties[`redness_${endYear}`];
            const startBallots = feature.properties[`ballots_${startYear}`];
            const endBallots = feature.properties[`ballots_${endYear}`];

            layer.bindPopup(`
                <strong>Precinct: ${feature.properties.precinct}</strong><br>
                District: ${feature.properties.district_name}<br>
                <hr>
                <strong>${startYear}:</strong><br>
                Ballots: ${startBallots || 'N/A'}<br>
                Redness: ${startVal}<br>
                <br>
                <strong>${endYear}:</strong><br>
                Ballots: ${endBallots || 'N/A'}<br>
                Redness: ${endVal}<br>
                <hr>
                Change in Redness: ${(endVal - startVal).toFixed(4)}
            `);
        }
    }).addTo(map);

    districtLayer = L.geoJson(districtBoundaries, {
        style: function(feature) {
            return {
                color: 'black',
                weight: 2,
                fillOpacity: 0,
                interactive: false
            };
        }
    }).addTo(map);
    
    labelLayer = L.layerGroup();
    districtBoundaries.forEach(district => {
        try {
            const center = turf.centerOfMass(district);
            const coords = center.geometry.coordinates;
            L.marker([coords[1], coords[0]], {
                icon: L.divIcon({
                    className: 'district-label',
                    html: district.properties.district_name,
                    iconSize: [100, 20],
                    iconAnchor: [50, 10]
                }),
                interactive: false
            }).addTo(labelLayer);
        } catch (e) {
            console.error("Error creating label for district:", district.properties.district_name, e);
        }
    });
    labelLayer.addTo(map);
    
    updateLegend();
}

function updateLegend() {
    const legend = document.getElementById('legend');
    legend.innerHTML = '<h4>Redness Change</h4>';
    const shades = [
        { change: -0.25, label: 'More Blue (<-25%)' },
        { change: -0.10, label: 'Blue Shift (-10%)' },
        { change: -0.05, label: 'Slight Blue Shift' },
        { change: 0, label: 'No Change (&plusmn;1%)' },
        { change: 0.05, label: 'Slight Red Shift' },
        { change: 0.10, label: 'Red Shift (+10%)' },
        { change: 0.25, label: 'More Red (>+25%)' }
    ];

    for (let i = 0; i < shades.length; i++) {
        legend.innerHTML +=
            '<div style="display: flex; align-items: center; margin-bottom: 2px;">' +
            '<i style="background:' + getColor(shades[i].change) + '; width: 18px; height: 18px; display: inline-block; margin-right: 5px;"></i>' +
            '<span>' + shades[i].label + '</span>' +
            '</div>';
    }
}

async function loadData() {
    const response = await fetch('data.csv.gz');
    const arrayBuffer = await response.arrayBuffer();
    const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' });

    Papa.parse(decompressed, {
        header: true,
        complete: function(results) {
            const districts = {};

            currentData = results.data
                .filter(row => row.geom_wkt)
                .map(row => {
                    const geojson = wellknown.parse(row.geom_wkt);
                    const feature = {
                        type: "Feature",
                        properties: row,
                        geometry: geojson
                    };

                    const districtName = row.district_name;
                    if (!districts[districtName]) {
                        districts[districtName] = [];
                    }
                    districts[districtName].push(feature);

                    return feature;
                });

            // Group by district and create boundaries
            districtBoundaries = Object.keys(districts).map(name => {
                const features = districts[name];
                try {
                    let unioned = features[0];
                    for (let i = 1; i < features.length; i++) {
                        unioned = turf.union(turf.featureCollection([unioned, features[i]]));
                    }
                    unioned.properties = { district_name: name };
                    return unioned;
                } catch (e) {
                    console.error(`Error unioning district ${name}:`, e);
                    // Fallback: return a collection of the original features if union fails
                    return {
                        type: "Feature",
                        properties: { district_name: name },
                        geometry: {
                            type: "GeometryCollection",
                            geometries: features.map(f => f.geometry)
                        }
                    };
                }
            });
            
            updateMap('2024-2025');
        }
    });
}

loadData();

document.querySelectorAll('input[name="yearRange"]').forEach(input => {
    input.addEventListener('change', (e) => {
        updateMap(e.target.value);
    });
});
