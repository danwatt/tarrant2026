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
let isdChartInstance = null;

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

function updateMap() {
    const baseYear = document.getElementById('baseYear').value;
    const compareYear = document.getElementById('compareYear').value;
    const isComparison = compareYear !== 'none';

    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }
    if (districtLayer) {
        map.removeLayer(districtLayer);
    }
    if (labelLayer) {
        map.removeLayer(labelLayer);
    }

    geojsonLayer = L.geoJson(currentData, {
        style: function(feature) {
            let color;
            if (isComparison) {
                const rednessStart = parseFloat(feature.properties[`redness_${compareYear}`]);
                const rednessEnd = parseFloat(feature.properties[`redness_${baseYear}`]);
                const change = rednessStart - rednessEnd;
                if (isNaN(change)) return { fillOpacity: 0, weight: 0 };
                color = getColor(change);
            } else {
                const redness = parseFloat(feature.properties[`redness_${baseYear}`]);
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
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid #eee;">
                            <th style="text-align: left;">Year</th>
                            <th style="text-align: right;">Ballots</th>
                            <th style="text-align: right;">Voters</th>
                            <th style="text-align: right;">Turnout</th>
                            <th style="text-align: right;">Redness</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            const years = ['2020', '2024', '2025', '2026'];
            const baseYear = document.getElementById('baseYear').value;

            years.forEach(year => {
                const val = parseFloat(feature.properties[`redness_${year}`]);
                const ballots = parseInt(feature.properties[`ballots_${year}`]);
                const voters = parseInt(feature.properties[`voters_${year}`]);
                const turnout = (!isNaN(ballots) && !isNaN(voters) && voters > 0) ? (ballots / voters) : null;

                const isSelected = year === baseYear;
                const rowStyle = isSelected ? 'style="font-weight: bold; background-color: #f9f9f9;"' : '';
                
                popupContent += `
                    <tr ${rowStyle}>
                        <td style="padding: 2px 0;">${year}</td>
                        <td style="text-align: right; padding: 2px 0;">${!isNaN(ballots) ? ballots.toLocaleString() : 'N/A'}</td>
                        <td style="text-align: right; padding: 2px 0;">${!isNaN(voters) ? voters.toLocaleString() : 'N/A'}</td>
                        <td style="text-align: right; padding: 2px 0;">${turnout !== null ? (turnout * 100).toFixed(2) + '%' : 'N/A'}</td>
                        <td style="text-align: right; padding: 2px 0;">${!isNaN(val) ? (val * 100).toFixed(2) + '%' : 'N/A'}</td>
                    </tr>
                `;
            });

            popupContent += `
                    </tbody>
                </table>
            `;

            if (isComparison) {
                const rednessStart = parseFloat(feature.properties[`redness_${compareYear}`]);
                const rednessEnd = parseFloat(feature.properties[`redness_${baseYear}`]);
                const change = rednessStart - rednessEnd;
                popupContent += `
                    <hr>
                    <strong>Change (${baseYear} to ${compareYear}):</strong> 
                    ${!isNaN(change) ? (change * 100).toFixed(2) + '%' : 'N/A'}
                `;
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
    
    updateLegend(isComparison);
}

function updateLegend(isComparison) {
    const legend = document.getElementById('legend');
    if (isComparison) {
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
    const response = await fetch('data_simplified.geojson.gz');
    const arrayBuffer = await response.arrayBuffer();
    const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' });
    const data = JSON.parse(decompressed);

    const districts = {};
    currentData = data.features;

    currentData.forEach(feature => {
        const districtName = feature.properties.district_name;
        if (!districts[districtName]) {
            districts[districtName] = [];
        }
        districts[districtName].push(feature);
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
    
    updateMap();
}

loadData();

document.getElementById('baseYear').addEventListener('change', updateMap);
document.getElementById('compareYear').addEventListener('change', updateMap);

// ISD Chart Modal Logic
const modal = document.getElementById("isdModal");
const btn = document.getElementById("isdChartBtn");
const span = document.getElementsByClassName("close")[0];

btn.onclick = function() {
    modal.style.display = "block";
    showISDChart();
}

span.onclick = function() {
    modal.style.display = "none";
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

function showISDChart() {
    const isdData = {};
    const years = ['2020', '2024', '2025', '2026'];

    currentData.forEach(feature => {
        const isd = feature.properties.district_name;
        if (!isdData[isd]) {
            isdData[isd] = {};
            years.forEach(year => {
                isdData[isd][year] = { totalRednessWeight: 0, totalBallots: 0, totalVoters: 0 };
            });
        }

        years.forEach(year => {
            const redness = parseFloat(feature.properties[`redness_${year}`]);
            const ballots = parseInt(feature.properties[`ballots_${year}`]);
            const voters = parseInt(feature.properties[`voters_${year}`]);
            if (!isNaN(redness) && !isNaN(ballots) && ballots > 0) {
                isdData[isd][year].totalRednessWeight += (redness * ballots);
                isdData[isd][year].totalBallots += ballots;
            }
            if (!isNaN(voters)) {
                isdData[isd][year].totalVoters += voters;
            }
        });
    });

    const chartData = Object.keys(isdData).map(isd => {
        const stats = {};
        years.forEach(year => {
            if (isdData[isd][year].totalBallots > 0) {
                stats[year] = {
                    redness: isdData[isd][year].totalRednessWeight / isdData[isd][year].totalBallots,
                    turnout: isdData[isd][year].totalBallots / isdData[isd][year].totalVoters,
                    ballots: isdData[isd][year].totalBallots,
                    voters: isdData[isd][year].totalVoters
                };
            } else {
                stats[year] = null;
            }
        });

        return {
            isd: isd,
            totalChange: (stats['2026'] !== null && stats['2020'] !== null) ? (stats['2026'].redness - stats['2020'].redness) : null,
            totalTurnoutChange: (stats['2026'] !== null && stats['2020'] !== null) ? (stats['2026'].turnout - stats['2020'].turnout) : null,
            stats: stats
        };
    }).filter(d => d.stats['2020'] !== null || d.stats['2024'] !== null || d.stats['2025'] !== null || d.stats['2026'] !== null);

    // Sort by 2026 redness level (descending) so most red is first
    chartData.sort((a, b) => ((b.stats['2026']?.redness) || 0) - ((a.stats['2026']?.redness) || 0));

    const ctx = document.getElementById('isdChart').getContext('2d');
    
    if (isdChartInstance) {
        isdChartInstance.destroy();
    }

    const datasets = [];
    const colors = {
        '2020': 'rgba(255, 99, 132, 0.8)',
        '2024': 'rgba(255, 206, 86, 0.8)',
        '2025': 'rgba(75, 192, 192, 0.8)',
        '2026': 'rgba(153, 102, 255, 0.8)'
    };

    years.forEach(year => {
        // Redness (Circles)
        datasets.push({
            label: `${year} Redness`,
            data: chartData.map((d, i) => d.stats[year] ? { x: d.stats[year].redness * 100, y: i } : null).filter(v => v !== null),
            backgroundColor: colors[year],
            pointStyle: 'circle',
            pointRadius: 6,
            pointHoverRadius: 8
        });
        // Turnout (Squares)
        datasets.push({
            label: `${year} Turnout`,
            data: chartData.map((d, i) => d.stats[year] ? { x: d.stats[year].turnout * 100, y: i } : null).filter(v => v !== null),
            backgroundColor: colors[year],
            pointStyle: 'rect',
            pointRadius: 6,
            pointHoverRadius: 8
        });
    });

    isdChartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Percentage (%)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + '%';
                        }
                    },
                    suggestedMin: 0,
                    suggestedMax: 100
                },
                y: {
                    ticks: {
                        callback: function(value) {
                            return chartData[value]?.isd;
                        },
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const d = chartData[context.dataIndex];
                            const label = context.dataset.label;
                            const value = context.parsed.x;
                            return `${d.isd} ${label}: ${value.toFixed(2)}%`;
                        },
                        afterBody: function(context) {
                            const d = chartData[context[0].dataIndex];
                            return [
                                '',
                                `2020: ${d.stats['2020'] ? `Redness ${(d.stats['2020'].redness * 100).toFixed(2)}%, Turnout ${(d.stats['2020'].turnout * 100).toFixed(2)}%` : 'N/A'}`,
                                `2024: ${d.stats['2024'] ? `Redness ${(d.stats['2024'].redness * 100).toFixed(2)}%, Turnout ${(d.stats['2024'].turnout * 100).toFixed(2)}%` : 'N/A'}`,
                                `2025: ${d.stats['2025'] ? `Redness ${(d.stats['2025'].redness * 100).toFixed(2)}%, Turnout ${(d.stats['2025'].turnout * 100).toFixed(2)}%` : 'N/A'}`,
                                `2026: ${d.stats['2026'] ? `Redness ${(d.stats['2026'].redness * 100).toFixed(2)}%, Turnout ${(d.stats['2026'].turnout * 100).toFixed(2)}%` : 'N/A'}`,
                                `Total Redness Change: ${d.totalChange !== null ? (d.totalChange * 100).toFixed(2) + '%' : 'N/A'}`,
                                `Total Turnout Change: ${d.totalTurnoutChange !== null ? (d.totalTurnoutChange * 100).toFixed(2) + '%' : 'N/A'}`
                            ];
                        }
                    }
                }
            }
        }
    });
}
