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

function getAbsoluteColor(redness) {
    // redness is between 0 (Blue) and 1 (Red)
    // We use a 7-shade gradient for absolute redness too
    const colors = [
        '#0000ff', // 0.0 - 0.2 (Deep Blue)
        '#6666ff', // 0.2 - 0.4 (Medium Blue)
        '#ccccff', // 0.4 - 0.49 (Light Blue)
        '#f0f0f0', // 0.49 - 0.51 (Grey)
        '#ffcccc', // 0.51 - 0.6 (Light Red)
        '#ff6666', // 0.6 - 0.8 (Medium Red)
        '#ff0000'  // 0.8 - 1.0 (Deep Red)
    ];

    if (redness <= 0.2) return colors[0];
    if (redness <= 0.4) return colors[1];
    if (redness < 0.49) return colors[2];
    if (redness <= 0.51) return colors[3];
    if (redness < 0.6) return colors[4];
    if (redness < 0.8) return colors[5];
    return colors[6];
}

function updateMap(selection) {
    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }
    if (districtLayer) {
        map.removeLayer(districtLayer);
    }
    if (labelLayer) {
        map.removeLayer(labelLayer);
    }

    const [mode, value] = selection.split(':');

    geojsonLayer = L.geoJson(currentData, {
        style: function(feature) {
            let color;
            if (mode === 'change') {
                const startYear = value.split('-')[0];
                const endYear = value.split('-')[1];
                const rednessStart = parseFloat(feature.properties[`redness_${startYear}`]);
                const rednessEnd = parseFloat(feature.properties[`redness_${endYear}`]);
                const change = rednessEnd - rednessStart;
                if (isNaN(change)) return { fillOpacity: 0, weight: 0 };
                color = getColor(change);
            } else {
                const redness = parseFloat(feature.properties[`redness_${value}`]);
                if (isNaN(redness)) return { fillOpacity: 0, weight: 0 };
                color = getAbsoluteColor(redness);
            }
            
            return {
                fillColor: color,
                weight: 0.5,
                opacity: 0.5,
                color: 'white',
                fillOpacity: 0.7
            };
        },
        onEachFeature: function(feature, layer) {
            let popupContent = `
                <strong>Precinct: ${feature.properties.precinct}</strong><br>
                District: ${feature.properties.district_name}<br>
                <hr>
            `;

            if (mode === 'change') {
                const startYear = value.split('-')[0];
                const endYear = value.split('-')[1];
                const startVal = feature.properties[`redness_${startYear}`];
                const endVal = feature.properties[`redness_${endYear}`];
                const startBallots = feature.properties[`ballots_${startYear}`];
                const endBallots = feature.properties[`ballots_${endYear}`];

                popupContent += `
                    <strong>${startYear}:</strong><br>
                    Ballots: ${startBallots || 'N/A'}<br>
                    Redness: ${startVal || 'N/A'}<br>
                    <br>
                    <strong>${endYear}:</strong><br>
                    Ballots: ${endBallots || 'N/A'}<br>
                    Redness: ${endVal || 'N/A'}<br>
                    <hr>
                    Change in Redness: ${(!isNaN(endVal - startVal) ? (endVal - startVal).toFixed(4) : 'N/A')}
                `;
            } else {
                const years = ['2024', '2025', '2026'];
                years.forEach(year => {
                    const val = feature.properties[`redness_${year}`];
                    const ballots = feature.properties[`ballots_${year}`];
                    const isSelected = year === value;
                    
                    if (isSelected) popupContent += "<strong>";
                    popupContent += `
                        <strong>${year}:</strong><br>
                        Ballots: ${ballots || 'N/A'}<br>
                        Redness: ${val || 'N/A'}<br>
                    `;
                    if (isSelected) popupContent += "</strong>";
                    if (year !== '2026') popupContent += '<br>';
                });
            }

            layer.bindPopup(popupContent);
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
    
    updateLegend(mode);
}

function updateLegend(mode) {
    const legend = document.getElementById('legend');
    if (mode === 'change') {
        legend.innerHTML = '<h4>Redness Change</h4>';
        const shades = [
            { val: -0.25, label: 'More Blue (<-25%)' },
            { val: -0.10, label: 'Blue Shift (-10%)' },
            { val: -0.05, label: 'Slight Blue Shift' },
            { val: 0, label: 'No Change (&plusmn;1%)' },
            { val: 0.05, label: 'Slight Red Shift' },
            { val: 0.10, label: 'Red Shift (+10%)' },
            { val: 0.25, label: 'More Red (>+25%)' }
        ];

        for (let i = 0; i < shades.length; i++) {
            legend.innerHTML +=
                '<div style="display: flex; align-items: center; margin-bottom: 2px;">' +
                '<i style="background:' + getColor(shades[i].val) + '; width: 18px; height: 18px; display: inline-block; margin-right: 5px;"></i>' +
                '<span>' + shades[i].label + '</span>' +
                '</div>';
        }
    } else {
        legend.innerHTML = '<h4>Absolute Redness</h4>';
        const shades = [
            { val: 0.1, label: 'Strongly Blue (<20%)' },
            { val: 0.3, label: 'Lean Blue (20-40%)' },
            { val: 0.45, label: 'Light Blue (40-49%)' },
            { val: 0.5, label: 'Neutral (49-51%)' },
            { val: 0.55, label: 'Light Red (51-60%)' },
            { val: 0.7, label: 'Lean Red (60-80%)' },
            { val: 0.9, label: 'Strongly Red (>80%)' }
        ];

        for (let i = 0; i < shades.length; i++) {
            legend.innerHTML +=
                '<div style="display: flex; align-items: center; margin-bottom: 2px;">' +
                '<i style="background:' + getAbsoluteColor(shades[i].val) + '; width: 18px; height: 18px; display: inline-block; margin-right: 5px;"></i>' +
                '<span>' + shades[i].label + '</span>' +
                '</div>';
        }
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
            
            updateMap('change:2024-2025');
        }
    });
}

loadData();

document.querySelectorAll('input[name="visualization"]').forEach(input => {
    input.addEventListener('change', (e) => {
        updateMap(e.target.value);
    });
});
